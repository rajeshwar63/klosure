# Sprint 06 — Meeting extraction pipeline

**Sprint:** 6 of 11
**Estimated:** 2 days
**Goal:** Wire `nylas-process-meeting` to dispatch the Notetaker bot when a calendar event matches a deal stakeholder, fetch the transcript when ready, feed it to klo-respond, and post Klo's update in deal chat.

## Why this matters

This sprint hits the second roadmap acceptance criterion: **"Schedule a meeting on Google Calendar with a deal stakeholder; Notetaker bot joins automatically; transcript triggers klo_state update within 5 minutes of meeting end."**

It's also the most expensive feature in Klosure — meeting capture is 60% of per-seat cost. The throttle logic (deferred to sprint 7) is what keeps margins intact. This sprint just makes capture work; sprint 7 makes it safe at scale.

## Two distinct flows

The webhook delivers two kinds of meeting events to this processor:

**Flow A: Calendar event created/updated.** Decide whether to dispatch the bot. Don't wait for transcript.

**Flow B: Notetaker state changed (transcript ready).** Fetch transcript, run extraction, post to chat.

## Flow A: dispatch decision

A meeting gets a bot if ALL of these are true:

1. The meeting has a recognized provider URL (`zoom`, `meet`, `teams`)
2. The meeting starts in the future (we don't dispatch to past meetings)
3. The meeting has at least one external participant
4. At least one external participant is a stakeholder on an active deal of the user
5. The user's team has meeting-pool capacity (sprint 7 wires this; for now always allow)
6. The user hasn't manually disabled bot capture for this specific event (Phase B feature; for now always enabled)

If any check fails, set `notetaker_state` to `'not_dispatched'` and stop.

## Flow B: transcript ingest

When `notetaker.media.updated` arrives with a transcript URL:

1. Fetch the transcript (Nylas hosts it for 7 days)
2. Compute meeting duration in minutes
3. Match to deal (use the deal_id we stamped during dispatch — no re-matching needed)
4. Insert a system message with the transcript content
5. Trigger klo-respond
6. Update meeting_events: `notetaker_state='ready'`, `transcript_text`, `duration_minutes`, `posted_to_chat_message_id`
7. Increment meeting_usage via the SQL helper from sprint 02

## nylas-process-meeting — full implementation

Path: `supabase/functions/nylas-process-meeting/index.ts`

```typescript
// =============================================================================
// nylas-process-meeting — Phase A (sprint 06)
// =============================================================================
// Two flows:
//  - event.created/updated → maybe dispatch a Notetaker bot
//  - notetaker.* state updates → if media ready, fetch transcript and extract
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

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
      return await handleNotetakerUpdate(nylas_grant_id, nylas_event_or_notetaker_id, type)
    }

    return json({ ok: true, ignored: type })
  } catch (err) {
    console.error("nylas-process-meeting exception", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

// ----- Flow A: calendar event -> maybe dispatch -----------------------------

async function handleCalendarEvent(grantId: string, eventId: string): Promise<Response> {
  const { data: event } = await sb.from("meeting_events")
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
  const { data: grant } = await sb.from("nylas_grants")
    .select("user_id, team_id, email_address")
    .eq("nylas_grant_id", grantId)
    .maybeSingle()

  if (!grant) {
    await markEvent(event.id, "not_dispatched", "grant_not_found")
    return json({ ok: false, error: "grant_not_found" }, 404)
  }

  const participants = (event.participants ?? []) as Array<{ email: string; name?: string }>
  const externals = participants.filter(
    p => p.email && p.email.toLowerCase() !== grant.email_address.toLowerCase()
  )
  if (externals.length === 0) {
    await markEvent(event.id, "not_dispatched", "no_external_participants")
    return json({ ok: true, skipped: "internal_only" })
  }

  // Check 4: stakeholder match against an active deal.
  const { data: deals } = await sb.from("deals")
    .select("id, klo_state, updated_at")
    .eq("seller_id", grant.user_id)
    .eq("status", "active")
    .order("updated_at", { ascending: false })

  let matchedDealId: string | null = null
  let matchedAddress: string | null = null

  for (const deal of deals ?? []) {
    const people = (deal.klo_state?.people ?? []) as Array<{ email?: string }>
    const peopleEmails = new Set(
      people.map(p => (p.email ?? "").toLowerCase().trim()).filter(Boolean)
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

  // Check 5: pool capacity. Sprint 07 implements; for now always allow.
  // const allowed = await checkPoolCapacity(grant.team_id, durationMinutes)
  // if (!allowed) { await markEvent(event.id, "skipped_quota", "pool_at_limit"); return ... }

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
  await sb.from("meeting_events")
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
  // Nylas v3 Notetaker dispatch:
  // POST /v3/grants/{grant_id}/notetakers
  // { meeting_link, event_id, name, ... }
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
        video_recording: false,   // we only need transcript
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
  type: string,
): Promise<Response> {
  // The id passed in could be the notetaker_id OR the event_id depending on
  // which Nylas event fired. Try both.
  const { data: events } = await sb.from("meeting_events")
    .select("*")
    .or(`nylas_notetaker_id.eq.${notetakerOrEventId},nylas_event_id.eq.${notetakerOrEventId}`)
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
    // Bot ran but we never matched a deal (shouldn't happen post-sprint-06,
    // but be defensive). Mark and skip.
    await sb.from("meeting_events")
      .update({ processed_at: new Date().toISOString(), processing_error: "no_deal_id" })
      .eq("id", event.id)
    return json({ ok: true, skipped: "no_deal_id" })
  }

  // Fetch transcript.
  const transcript = await fetchTranscript(event.transcript_url)
  if (!transcript) {
    await sb.from("meeting_events")
      .update({ processed_at: new Date().toISOString(), processing_error: "transcript_fetch_failed" })
      .eq("id", event.id)
    return json({ ok: false, error: "transcript_fetch_failed" }, 502)
  }

  // Compute duration.
  const durationMinutes = Math.max(
    1,
    Math.round((new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60000)
  )

  // Insert system message.
  const meetingMsg = formatMeetingForChat({
    title: event.title ?? "Meeting",
    startsAt: event.starts_at,
    durationMinutes,
    participants: (event.participants ?? []) as Array<{ email: string; name?: string }>,
    transcript,
  })

  const { data: msgRow, error: msgErr } = await sb.from("messages")
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
    await sb.from("meeting_events")
      .update({ processed_at: new Date().toISOString(), processing_error: `msg_insert:${msgErr.message}` })
      .eq("id", event.id)
    return json({ ok: false, error: "msg_insert_failed" }, 500)
  }

  // Trigger klo-respond.
  await sb.functions.invoke("klo-respond", {
    body: { deal_id: event.deal_id, triggering_message_id: msgRow.id },
  }).catch((err) => {
    console.error("klo-respond invoke failed", err)
  })

  // Increment meeting usage and check pool thresholds.
  const { data: grantInfo } = await sb.from("nylas_grants")
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
    // crossed_80 / crossed_100 notification fires from sprint 07.
    console.log("meeting_usage incremented", usage)
  }

  // Mark complete.
  await sb.from("meeting_events")
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
      // Nylas returns structured JSON: { transcript: [{ speaker, text, ... }] }
      const j = await res.json()
      const lines = (j.transcript ?? j.data?.transcript ?? [])
        .map((seg: { speaker?: string; text?: string }) =>
          seg.speaker ? `${seg.speaker}: ${seg.text}` : seg.text
        )
        .filter(Boolean)
      return lines.join("\n").slice(0, 50000)  // cap at 50k chars
    }
    // Plain text fallback.
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
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
  const partyList = args.participants
    .map(p => p.name || p.email)
    .filter(Boolean)
    .join(", ")
  return `🎙️ MEETING — ${args.title} — ${dateStr} (${args.durationMinutes} min)
Participants: ${partyList}

TRANSCRIPT:
${args.transcript}`
}

async function markEvent(id: string, state: string, error: string | null): Promise<void> {
  await sb.from("meeting_events")
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
```

## Deploy

```powershell
supabase functions deploy nylas-process-meeting --no-verify-jwt
```

The webhook handler from sprint 04 already triggers this function — no change needed there.

## klo-respond — already updated for system messages in sprint 05

Sprint 5 added `system` to the `MessageRow.sender_type` union and the `EMAIL_AND_MEETING_RULES` prompt block. Meetings flow through the same path. The prompt already differentiates `sender_name='email'` vs `sender_name='meeting'`. No additional klo-respond changes needed in this sprint.

## End-to-end test

1. Pick a deal where you've added a stakeholder's email to `klo_state.people`
2. Schedule a Google Meet with that stakeholder, starting 5 minutes from now
3. Within 1 minute: check `meeting_events` — should see the row with `notetaker_state='scheduled'` and `nylas_notetaker_id` populated
4. Look at the meeting participant list in Google Meet — "Klo (Klosure)" should appear shortly after meeting start
5. Have a 10+ minute conversation with deal-relevant content
6. End the meeting
7. Within 5 minutes: check `meeting_events` — `notetaker_state='ready'`, `transcript_text` populated, `duration_minutes` set, `posted_to_chat_message_id` linked
8. Check the deal chat — Klo's message: "Caught the call with [stakeholder]. Three takeaways: ..."
9. Check `team_pool` — `current_meeting_minutes` incremented
10. Check `meeting_usage` — new row with the duration

## Acceptance

- [ ] `nylas-process-meeting` deploys
- [ ] A calendar event with a stakeholder triggers bot dispatch (verify `notetaker_state='scheduled'` in DB)
- [ ] A calendar event with NO stakeholder match shows `notetaker_state='not_dispatched', processing_error='no_stakeholder_match'`
- [ ] An internal-only meeting (everyone has the user's domain) is skipped
- [ ] Past meetings are skipped
- [ ] Bot joins the actual meeting (verify in Google Meet UI)
- [ ] After meeting ends, transcript becomes available within 5 minutes
- [ ] Klo posts a chat message referencing the meeting
- [ ] `klo_state` updates with extracted commitments / decisions / new stakeholders
- [ ] `meeting_usage` row created
- [ ] `team_pool.current_meeting_minutes` incremented by exactly the meeting duration
- [ ] Replaying a `notetaker.media.updated` webhook does NOT double-process (idempotency on `processed_at`)

## Pitfalls

- **Bot doesn't join** → most common cause: meeting URL didn't survive the round-trip. Some Outlook calendar events use weird Teams URL formats Nylas doesn't parse. Log the meeting_url at dispatch time.
- **Transcript URL expires** → Nylas hosts transcripts for 7 days. We copy `transcript_text` to our DB on first ingest, so that's fine. But if the URL fetch fails, we have nothing — investigate immediately.
- **Bot joins but no transcript** → check `notetaker.meeting_state.updated` events. If the bot got `failed` state, the meeting may have rejected non-host attendees, or the host removed the bot manually. Log the failure reason.
- **Recurring meetings** → each occurrence gets its own `event.created` webhook. The bot dispatches per occurrence. Don't dispatch for the recurring master event (which has `when.object='date'` not `'timespan'` — the webhook handler already filters this).
- **Duration calculation** → we use scheduled duration, not actual. If a meeting was scheduled for 30 min but ran 45, we bill 30. This is wrong but also forgiving in the user's favor; will fix in Phase B by reading actual recording length from the notetaker payload.
- **Cost surprise** → at 5 hours of free Notetaker per Nylas account, you'll burn through validation testing fast. Beyond the trial, Notetaker is metered (~$1.20/hour). Watch your spend during sprint 6 testing — schedule short test meetings (5 min), not long ones.

## What this sprint does NOT do

- Pool-based throttling → sprint 7 (the `// Check 5` comment marks the insertion point)
- Manager dashboard view of meeting usage → sprint 10
- Retroactive transcript replay if Nylas hands us a transcript late → out of scope
- Custom bot per-customer branding → Phase D+

→ Next: `07-team-pool-metering.md`
