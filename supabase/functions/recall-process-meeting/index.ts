// =============================================================================
// recall-process-meeting — Phase B
// =============================================================================
// Triggered by recall-webhook when a bot finishes recording. Fetches the
// transcript from Recall, posts a system 'meeting' message into deal chat,
// triggers klo-respond, and increments meeting_usage.
//
// Idempotent on recall_bots.bot_state — once we set 'transcript_ready' we
// won't re-post the message even if Recall fires the webhook twice.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import {
  fireQuotaNotification,
  loadPoolStatus,
} from "../_shared/team-pool.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const RECALL_API_BASE = Deno.env.get("RECALL_API_BASE") ?? "https://us-east-1.recall.ai/api/v1"
const RECALL_API_KEY = Deno.env.get("RECALL_API_KEY") ?? ""

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  try {
    const { recall_bot_id } = await req.json()
    if (!recall_bot_id) return json({ ok: false, error: "missing_bot_id" }, 400)

    const { data: bot } = await sb
      .from("recall_bots")
      .select("id, meeting_event_id, user_id, team_id, bot_state")
      .eq("recall_bot_id", recall_bot_id)
      .maybeSingle()
    if (!bot) return json({ ok: false, error: "bot_not_found" }, 404)
    if (bot.bot_state === "transcript_ready") {
      return json({ ok: true, skipped: "already_processed" })
    }

    // Load the linked meeting_event for context.
    const { data: meeting } = bot.meeting_event_id
      ? await sb
          .from("meeting_events")
          .select("id, deal_id, title, starts_at, ends_at, participants, processed_at")
          .eq("id", bot.meeting_event_id)
          .maybeSingle()
      : { data: null }

    // Fetch the transcript from Recall. The shape is an array of segments
    // [{ speaker, words: [{ text, start_timestamp, end_timestamp }] }].
    const transcript = await fetchTranscript(recall_bot_id)
    if (!transcript) {
      await sb.from("recall_bots")
        .update({ bot_state: "failed", last_error: "transcript_fetch_failed", updated_at: new Date().toISOString() })
        .eq("id", bot.id)
      return json({ ok: false, error: "transcript_fetch_failed" }, 502)
    }

    await sb.from("recall_bots")
      .update({ transcript_text: transcript, bot_state: "transcript_ready", updated_at: new Date().toISOString() })
      .eq("id", bot.id)

    // If we don't have a meeting row, we can still record the transcript on
    // the bot but there's nothing to post into chat — return early.
    if (!meeting?.deal_id) {
      if (meeting) {
        await sb.from("meeting_events")
          .update({ notetaker_state: "ready", processed_at: new Date().toISOString(), processing_error: meeting.deal_id ? null : "no_deal_id", updated_at: new Date().toISOString() })
          .eq("id", meeting.id)
      }
      return json({ ok: true, skipped: "no_deal_id" })
    }

    // Idempotency on the meeting row too.
    if (meeting.processed_at) {
      return json({ ok: true, skipped: "meeting_already_processed" })
    }

    const startsAt = meeting.starts_at as string
    const endsAt = meeting.ends_at as string
    const durationMinutes = Math.max(
      1,
      Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000),
    )

    const meetingMsg = formatMeetingForChat({
      title: (meeting.title as string | null) ?? "Meeting",
      startsAt,
      durationMinutes,
      participants: ((meeting.participants as Array<{ email: string; name?: string }>) ?? []),
      transcript,
    })

    const { data: msgRow, error: msgErr } = await sb
      .from("messages")
      .insert({
        deal_id: meeting.deal_id,
        sender_type: "system",
        sender_name: "meeting",
        content: meetingMsg,
        visible_to: null,
        metadata: {
          source: "recall_notetaker",
          meeting_event_id: meeting.id,
          recall_bot_id,
        },
      })
      .select("id")
      .single()
    if (msgErr) {
      console.error("meeting message insert failed", msgErr)
      return json({ ok: false, error: "msg_insert_failed" }, 500)
    }

    // Trigger klo-respond.
    fetch(`${SUPABASE_URL}/functions/v1/klo-respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        deal_id: meeting.deal_id,
        triggering_message_id: msgRow.id,
      }),
    }).catch((err) => console.error("klo-respond fetch failed", err))

    // Increment usage + check pool thresholds.
    if (bot.team_id) {
      const { data: usage } = await sb.rpc("increment_meeting_usage", {
        p_team_id: bot.team_id,
        p_user_id: bot.user_id,
        p_meeting_event_id: meeting.id,
        p_duration_minutes: durationMinutes,
      })
      // deno-lint-ignore no-explicit-any
      const u = (usage as any[])?.[0]
      if (u) {
        const status = await loadPoolStatus(sb, bot.team_id)
        if (u.crossed_80 && status && !status.notified_80_at) {
          await fireQuotaNotification(bot.team_id, "meeting_pool_80", status)
        }
        if (u.crossed_100 && status && !status.notified_100_at) {
          await fireQuotaNotification(bot.team_id, "meeting_pool_full", status)
        }
      }
    }

    await sb.from("meeting_events")
      .update({
        transcript_text: transcript,
        duration_minutes: durationMinutes,
        notetaker_state: "ready",
        posted_to_chat_message_id: msgRow.id,
        processed_at: new Date().toISOString(),
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", meeting.id)

    return json({ ok: true, deal_id: meeting.deal_id, message_id: msgRow.id })
  } catch (err) {
    console.error("recall-process-meeting exception", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

async function fetchTranscript(botId: string): Promise<string | null> {
  if (!RECALL_API_KEY) return null

  // Recall deprecated /bot/<id>/transcript. The current path is to fetch the
  // bot, follow recordings[0].media_shortcuts.transcript.data.download_url,
  // and read the diarized JSON straight from S3 (signed URL — no auth needed).
  const botRes = await fetch(`${RECALL_API_BASE}/bot/${botId}`, {
    headers: { Authorization: `Token ${RECALL_API_KEY}` },
  })
  if (!botRes.ok) {
    console.error("recall bot fetch failed", botRes.status)
    return null
  }
  // deno-lint-ignore no-explicit-any
  const bot: any = await botRes.json().catch(() => null)
  const downloadUrl: string | undefined =
    bot?.recordings?.[0]?.media_shortcuts?.transcript?.data?.download_url
  if (!downloadUrl) {
    console.error("recall transcript download_url missing")
    return null
  }

  const transRes = await fetch(downloadUrl)
  if (!transRes.ok) {
    console.error("recall transcript S3 fetch failed", transRes.status)
    return null
  }
  const body = await transRes.json().catch(() => null)
  if (!body) return null

  // Diarized format is an array of { participant: { name }, words: [{text}] }.
  // Older shapes nest under { transcript: [...] } — handle both defensively.
  // deno-lint-ignore no-explicit-any
  const segments: any[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { transcript?: unknown }).transcript)
      ? (body as { transcript: unknown[] }).transcript
      : []

  const lines = segments.map((seg) => {
    const speaker = seg.participant?.name ?? seg.speaker ?? "Speaker"
    const words: Array<{ text?: string }> = Array.isArray(seg.words) ? seg.words : []
    const text = words.map((w) => w.text ?? "").filter(Boolean).join(" ").trim()
    if (!text) return ""
    return `${speaker}: ${text}`
  }).filter(Boolean)
  return lines.join("\n").slice(0, 50000)
}

function formatMeetingForChat(args: {
  title: string
  startsAt: string
  durationMinutes: number
  participants: Array<{ email: string; name?: string }>
  transcript: string
}): string {
  const dateStr = new Date(args.startsAt).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
  const partyList = args.participants
    .map((p) => p.name || p.email)
    .filter(Boolean)
    .join(", ")
  return `MEETING — ${args.title} — ${dateStr} (${args.durationMinutes} min)
Participants: ${partyList}

TRANSCRIPT:
${args.transcript}`
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
