// =============================================================================
// nylas-process-meeting — Phase A (sprint 06 + sprint 07 pool gate)
// =============================================================================
// Two flows:
//  - event.created/updated → maybe dispatch a Notetaker bot
//  - notetaker.* state updates → if media ready, fetch transcript and extract
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import {
  canDispatchMeeting,
  fireQuotaNotification,
  loadPoolStatus,
} from "../_shared/team-pool.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const NYLAS_API_URL = Deno.env.get("NYLAS_API_URL") ?? "https://api.us.nylas.com"
const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY") ?? ""

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    const { nylas_grant_id, nylas_event_or_notetaker_id, type } = body
    if (!nylas_grant_id || !nylas_event_or_notetaker_id || !type) {
      return json({ ok: false, error: "missing_args" }, 400)
    }

    if (type.startsWith("event.")) {
      return await handleCalendarEvent(nylas_grant_id, nylas_event_or_notetaker_id)
    }
    if (type.startsWith("notetaker.")) {
      return await handleNotetakerUpdate(
        nylas_grant_id,
        nylas_event_or_notetaker_id,
        type,
      )
    }

    return json({ ok: true, ignored: type })
  } catch (err) {
    console.error("nylas-process-meeting exception", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

// ----- Flow A: calendar event -> maybe dispatch -----------------------------

async function handleCalendarEvent(grantId: string, eventId: string): Promise<Response> {
  const { data: event } = await sb
    .from("meeting_events")
    .select("*")
    .eq("nylas_grant_id", grantId)
    .eq("nylas_event_id", eventId)
    .maybeSingle()

  if (!event) {
    return json({ ok: false, error: "event_not_found" }, 404)
  }

  // Idempotency — don't redispatch if we already scheduled.
  if (event.notetaker_state !== "not_dispatched") {
    return json({ ok: true, skipped: `already_${event.notetaker_state}` })
  }

  // Check 1: recognized provider.
  if (!event.meeting_provider || event.meeting_provider === "other") {
    await markEvent(event.id, "not_dispatched", "no_recognized_provider")
    return json({ ok: true, skipped: "no_provider" })
  }

  // Check 2: in the future. Allow up to 5 min in the past for clock skew.
  const startsAt = new Date(event.starts_at).getTime()
  if (startsAt < Date.now() - 5 * 60 * 1000) {
    await markEvent(event.id, "not_dispatched", "in_past")
    return json({ ok: true, skipped: "in_past" })
  }

  // Check 3: external participants exist.
  const { data: grant } = await sb
    .from("nylas_grants")
    .select("user_id, team_id, email_address")
    .eq("nylas_grant_id", grantId)
    .maybeSingle()

  if (!grant) {
    await markEvent(event.id, "not_dispatched", "grant_not_found")
    return json({ ok: false, error: "grant_not_found" }, 404)
  }

  const participants = (event.participants ?? []) as Array<{ email: string; name?: string }>
  const externals = participants.filter(
    (p) => p.email && p.email.toLowerCase() !== grant.email_address.toLowerCase(),
  )
  if (externals.length === 0) {
    await markEvent(event.id, "not_dispatched", "no_external_participants")
    return json({ ok: true, skipped: "internal_only" })
  }

  // Check 4: stakeholder match against an active deal.
  const { data: deals } = await sb
    .from("deals")
    .select("id, klo_state, updated_at")
    .eq("seller_id", grant.user_id)
    .eq("status", "active")
    .order("updated_at", { ascending: false })

  let matchedDealId: string | null = null
  let matchedAddress: string | null = null

  for (const deal of deals ?? []) {
    const people = ((deal.klo_state as { people?: Array<{ email?: string }> })?.people ??
      []) as Array<{ email?: string }>
    const peopleEmails = new Set(
      people.map((p) => (p.email ?? "").toLowerCase().trim()).filter(Boolean),
    )
    if (peopleEmails.size === 0) continue
    for (const ext of externals) {
      if (peopleEmails.has(ext.email.toLowerCase())) {
        matchedDealId = deal.id
        matchedAddress = ext.email.toLowerCase()
        break
      }
    }
    if (matchedDealId) break
  }

  if (!matchedDealId) {
    await markEvent(event.id, "not_dispatched", "no_stakeholder_match")
    return json({ ok: true, skipped: "no_match" })
  }

  // Check 5: pool capacity (sprint 07).
  const expectedMinutes = Math.max(
    1,
    Math.round(
      (new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60000,
    ),
  )
  const capacity = await canDispatchMeeting(sb, grant.team_id, expectedMinutes)
  if (!capacity.allowed) {
    await markEvent(event.id, "skipped_quota", capacity.reason ?? "pool_full")
    if (grant.team_id && capacity.status && !capacity.status.notified_100_at) {
      await fireQuotaNotification(grant.team_id, "meeting_pool_full", capacity.status)
    }
    return json({ ok: true, skipped: "pool_full" })
  }

  // Dispatch the bot.
  const dispatched = await dispatchNotetaker({
    grantId,
    eventId,
    meetingUrl: event.meeting_url ?? "",
    title: event.title ?? "Meeting",
  })

  if (!dispatched.ok) {
    await markEvent(event.id, "failed", `dispatch_failed:${dispatched.error}`)
    return json({ ok: false, error: "dispatch_failed", detail: dispatched.error })
  }

  // Persist deal_id, matched stakeholder, and notetaker_id.
  await sb
    .from("meeting_events")
    .update({
      deal_id: matchedDealId,
      matched_stakeholder: matchedAddress,
      nylas_notetaker_id: dispatched.notetaker_id,
      notetaker_state: "scheduled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", event.id)

  return json({
    ok: true,
    deal_id: matchedDealId,
    notetaker_id: dispatched.notetaker_id,
  })
}

async function dispatchNotetaker(args: {
  grantId: string
  eventId: string
  meetingUrl: string
  title: string
}): Promise<{ ok: true; notetaker_id: string } | { ok: false; error: string }> {
  const url = `${NYLAS_API_URL}/v3/grants/${args.grantId}/notetakers`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NYLAS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meeting_link: args.meetingUrl,
      event_id: args.eventId,
      name: "Klo (Klosure)",
      meeting_settings: {
        audio_recording: true,
        video_recording: false,
        transcription: true,
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return { ok: false, error: `${res.status}:${errText.slice(0, 200)}` }
  }
  const body = await res.json()
  const notetakerId = body.data?.id ?? body.id
  if (!notetakerId) {
    return { ok: false, error: "no_notetaker_id_in_response" }
  }
  return { ok: true, notetaker_id: notetakerId }
}

// ----- Flow B: notetaker state -> maybe extract -----------------------------

async function handleNotetakerUpdate(
  grantId: string,
  notetakerOrEventId: string,
  _type: string,
): Promise<Response> {
  // The id passed in could be the notetaker_id OR the event_id depending on
  // which Nylas event fired. Try both.
  const { data: events } = await sb
    .from("meeting_events")
    .select("*")
    .or(
      `nylas_notetaker_id.eq.${notetakerOrEventId},nylas_event_id.eq.${notetakerOrEventId}`,
    )
    .eq("nylas_grant_id", grantId)
    .limit(1)

  const event = events?.[0]
  if (!event) {
    return json({ ok: true, skipped: "event_not_found" })
  }

  // Only act when transcript becomes available.
  if (event.notetaker_state !== "ready" || !event.transcript_url) {
    return json({ ok: true, waiting: true, state: event.notetaker_state })
  }

  // Idempotency — already extracted.
  if (event.processed_at) {
    return json({ ok: true, skipped: "already_processed" })
  }

  if (!event.deal_id) {
    await sb
      .from("meeting_events")
      .update({
        processed_at: new Date().toISOString(),
        processing_error: "no_deal_id",
      })
      .eq("id", event.id)
    return json({ ok: true, skipped: "no_deal_id" })
  }

  const transcript = await fetchTranscript(event.transcript_url)
  if (!transcript) {
    await sb
      .from("meeting_events")
      .update({
        processed_at: new Date().toISOString(),
        processing_error: "transcript_fetch_failed",
      })
      .eq("id", event.id)
    return json({ ok: false, error: "transcript_fetch_failed" }, 502)
  }

  const durationMinutes = Math.max(
    1,
    Math.round(
      (new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60000,
    ),
  )

  const meetingMsg = formatMeetingForChat({
    title: event.title ?? "Meeting",
    startsAt: event.starts_at,
    durationMinutes,
    participants: (event.participants ?? []) as Array<{ email: string; name?: string }>,
    transcript,
  })

  const { data: msgRow, error: msgErr } = await sb
    .from("messages")
    .insert({
      deal_id: event.deal_id,
      sender_type: "system",
      sender_name: "meeting",
      content: meetingMsg,
      visible_to: null,
      metadata: {
        source: "nylas_notetaker",
        meeting_event_id: event.id,
      },
    })
    .select("id")
    .single()

  if (msgErr) {
    await sb
      .from("meeting_events")
      .update({
        processed_at: new Date().toISOString(),
        processing_error: `msg_insert:${msgErr.message}`,
      })
      .eq("id", event.id)
    return json({ ok: false, error: "msg_insert_failed" }, 500)
  }

  await sb.functions
    .invoke("klo-respond", {
      body: { deal_id: event.deal_id, triggering_message_id: msgRow.id },
    })
    .catch((err) => {
      console.error("klo-respond invoke failed", err)
    })

  // Increment meeting usage and check pool thresholds.
  const { data: grantInfo } = await sb
    .from("nylas_grants")
    .select("user_id, team_id")
    .eq("nylas_grant_id", grantId)
    .maybeSingle()

  if (grantInfo?.team_id) {
    const { data: usage } = await sb.rpc("increment_meeting_usage", {
      p_team_id: grantInfo.team_id,
      p_user_id: grantInfo.user_id,
      p_meeting_event_id: event.id,
      p_duration_minutes: durationMinutes,
    })
    // deno-lint-ignore no-explicit-any
    const u = (usage as any[])?.[0]
    if (u) {
      const status = await loadPoolStatus(sb, grantInfo.team_id)
      if (u.crossed_80 && status && !status.notified_80_at) {
        await fireQuotaNotification(grantInfo.team_id, "meeting_pool_80", status)
      }
      if (u.crossed_100 && status && !status.notified_100_at) {
        await fireQuotaNotification(grantInfo.team_id, "meeting_pool_full", status)
      }
    }
  }

  await sb
    .from("meeting_events")
    .update({
      transcript_text: transcript,
      duration_minutes: durationMinutes,
      posted_to_chat_message_id: msgRow.id,
      processed_at: new Date().toISOString(),
      processing_error: null,
    })
    .eq("id", event.id)

  return json({ ok: true, deal_id: event.deal_id, message_id: msgRow.id })
}

async function fetchTranscript(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${NYLAS_API_KEY}` },
    })
    if (!res.ok) {
      console.error("transcript fetch failed", res.status)
      return null
    }
    const contentType = res.headers.get("Content-Type") ?? ""
    if (contentType.includes("application/json")) {
      const j = await res.json()
      const segments = (j.transcript ?? j.data?.transcript ?? []) as Array<{
        speaker?: string
        text?: string
      }>
      const lines = segments
        .map((seg) => (seg.speaker ? `${seg.speaker}: ${seg.text}` : seg.text))
        .filter(Boolean)
      return lines.join("\n").slice(0, 50000)
    }
    return (await res.text()).slice(0, 50000)
  } catch (e) {
    console.error("transcript fetch error", e)
    return null
  }
}

function formatMeetingForChat(args: {
  title: string
  startsAt: string
  durationMinutes: number
  participants: Array<{ email: string; name?: string }>
  transcript: string
}): string {
  const dateStr = new Date(args.startsAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

async function markEvent(
  id: string,
  state: string,
  error: string | null,
): Promise<void> {
  await sb
    .from("meeting_events")
    .update({
      notetaker_state: state,
      processing_error: error,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
