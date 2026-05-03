// =============================================================================
// nylas-process-meeting — Phase A (sprint 06 + sprint 07 pool gate + calendar pills)
// =============================================================================
// Three flows:
//  - event.created/updated → match deal, ensure calendar pill, maybe dispatch
//  - event.deleted        → mark calendar pill as cancelled
//  - notetaker.*          → if media ready, fetch transcript + post Klo coaching
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

    if (type === "event.deleted") {
      return await handleCalendarEventCancelled(
        nylas_grant_id,
        nylas_event_or_notetaker_id,
      )
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

// ----- Flow A: calendar event -> match deal, ensure pill, maybe dispatch ----

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

  // Internal-only meetings are never our business — no pill, no dispatch.
  // Detect this BEFORE matching a deal so we don't pull a grant lookup for
  // events we're going to drop on the floor.
  const { data: grant } = await sb
    .from("nylas_grants")
    .select("user_id, team_id, email_address")
    .eq("nylas_grant_id", grantId)
    .maybeSingle()

  if (!grant) {
    if (event.notetaker_state === "not_dispatched") {
      await markEvent(event.id, "not_dispatched", "grant_not_found")
    }
    return json({ ok: false, error: "grant_not_found" }, 404)
  }

  const participants = (event.participants ?? []) as Array<{ email: string; name?: string }>
  const externals = participants.filter(
    (p) => p.email && p.email.toLowerCase() !== grant.email_address.toLowerCase(),
  )
  if (externals.length === 0) {
    if (event.notetaker_state === "not_dispatched") {
      await markEvent(event.id, "not_dispatched", "no_external_participants")
    }
    return json({ ok: true, skipped: "internal_only" })
  }

  // Match a deal regardless of dispatch eligibility — calendar awareness is
  // valuable even when the bot can't transcribe (no link, quota, etc.).
  let dealId: string | null = event.deal_id ?? null
  let matchedAddress: string | null = event.matched_stakeholder ?? null
  if (!dealId) {
    const match = await matchDealForEvent(grant.user_id, externals)
    dealId = match.dealId
    matchedAddress = match.address

    if (dealId) {
      await sb
        .from("meeting_events")
        .update({
          deal_id: dealId,
          matched_stakeholder: matchedAddress,
          updated_at: new Date().toISOString(),
        })
        .eq("id", event.id)
      event.deal_id = dealId
      event.matched_stakeholder = matchedAddress
    }
  }

  if (!dealId) {
    if (event.notetaker_state === "not_dispatched") {
      await markEvent(event.id, "not_dispatched", "no_stakeholder_match")
    }
    return json({ ok: true, skipped: "no_match" })
  }

  // Ensure exactly one 📅 pill exists in chat for this meeting (idempotent).
  await ensureCalendarPillForEvent(event)

  // Dispatch decision only on the first call. Re-fires of event.updated
  // refresh the pill but never redispatch — guarded here and in markEvent.
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

  // Check 3: pool capacity (sprint 07).
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

  await sb
    .from("meeting_events")
    .update({
      nylas_notetaker_id: dispatched.notetaker_id,
      notetaker_state: "scheduled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", event.id)

  return json({
    ok: true,
    deal_id: dealId,
    notetaker_id: dispatched.notetaker_id,
  })
}

async function matchDealForEvent(
  sellerId: string,
  externals: Array<{ email: string; name?: string }>,
): Promise<{ dealId: string | null; address: string | null }> {
  const { data: deals } = await sb
    .from("deals")
    .select("id, klo_state, updated_at")
    .eq("seller_id", sellerId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })

  if (!deals || deals.length === 0) return { dealId: null, address: null }

  // Klo's coaching loop occasionally rewrites klo_state.people without the
  // email field, so we union with deal_context.stakeholders — that's the
  // durable email-of-record source captured at deal creation.
  const dealIds = deals.map((d) => d.id)
  const { data: contexts } = await sb
    .from("deal_context")
    .select("deal_id, stakeholders")
    .in("deal_id", dealIds)

  const stakeholdersByDeal = new Map<string, Array<{ email?: string }>>()
  for (const ctx of contexts ?? []) {
    stakeholdersByDeal.set(
      ctx.deal_id as string,
      (ctx.stakeholders ?? []) as Array<{ email?: string }>,
    )
  }

  function emailsForDeal(deal: { id: string; klo_state: unknown }): string[] {
    const people = ((deal.klo_state as { people?: Array<{ email?: string }> })?.people ??
      []) as Array<{ email?: string }>
    const stakeholders = stakeholdersByDeal.get(deal.id) ?? []
    const out = new Set<string>()
    for (const p of [...people, ...stakeholders]) {
      const addr = (p.email ?? "").toLowerCase().trim()
      if (addr) out.add(addr)
    }
    return [...out]
  }

  // Pass 1: exact email match across all deals (strongest signal).
  for (const deal of deals) {
    const peopleEmails = new Set(emailsForDeal(deal))
    if (peopleEmails.size === 0) continue
    for (const ext of externals) {
      if (peopleEmails.has(ext.email.toLowerCase())) {
        return { dealId: deal.id, address: ext.email.toLowerCase() }
      }
    }
  }

  // Pass 2: domain fallback. If any participant shares a domain with a known
  // stakeholder on a deal (excluding free-mail providers), treat as a match.
  for (const deal of deals) {
    const peopleDomains = new Set(
      emailsForDeal(deal)
        .map((e) => domainOf(e))
        .filter((d): d is string => !!d && !isCommonDomain(d)),
    )
    if (peopleDomains.size === 0) continue
    for (const ext of externals) {
      const dom = domainOf(ext.email.toLowerCase())
      if (dom && peopleDomains.has(dom)) {
        return { dealId: deal.id, address: ext.email.toLowerCase() }
      }
    }
  }

  return { dealId: null, address: null }
}

async function ensureCalendarPillForEvent(event: Record<string, unknown>): Promise<void> {
  const eventId = event.id as string
  const dealId = event.deal_id as string | null
  if (!dealId) return

  const existingId = event.calendar_pill_message_id as string | null
  if (existingId) return

  // Defensive: another invocation may have inserted in the meantime without
  // the FK column being set. Look it up by metadata back-reference.
  const { data: prior } = await sb
    .from("messages")
    .select("id")
    .eq("deal_id", dealId)
    .contains("metadata", {
      source: "nylas_calendar_event",
      meeting_event_id: eventId,
    })
    .maybeSingle()
  if (prior) {
    await sb
      .from("meeting_events")
      .update({ calendar_pill_message_id: prior.id })
      .eq("id", eventId)
    return
  }

  const content = formatCalendarPillContent(event)
  const { data: msg, error } = await sb
    .from("messages")
    .insert({
      deal_id: dealId,
      sender_type: "system",
      sender_name: "calendar",
      content,
      visible_to: null,
      metadata: {
        source: "nylas_calendar_event",
        meeting_event_id: eventId,
        nylas_event_id: event.nylas_event_id,
      },
    })
    .select("id")
    .single()

  if (error) {
    console.error("calendar pill insert failed", error)
    return
  }

  await sb
    .from("meeting_events")
    .update({ calendar_pill_message_id: msg.id })
    .eq("id", eventId)
}

function formatCalendarPillContent(event: Record<string, unknown>): string {
  const title = (event.title as string | null) ?? "Meeting"
  const startsAt = event.starts_at as string
  const endsAt = event.ends_at as string
  const provider = (event.meeting_provider as string | null) ?? null
  const meetingUrl = (event.meeting_url as string | null) ?? null
  const participants =
    (event.participants as Array<{ email: string; name?: string }> | null) ?? []
  const durationMinutes = Math.max(
    1,
    Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000),
  )
  const dateStr = new Date(startsAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
  const partyList = participants
    .map((p) => p.name || p.email)
    .filter(Boolean)
    .join(", ") || "—"
  return `CALENDAR — ${title} — ${dateStr} (${durationMinutes} min)
Participants: ${partyList}
Provider: ${provider ?? "—"}
URL: ${meetingUrl ?? "—"}`
}

// ----- Flow B: cancellation ------------------------------------------------

async function handleCalendarEventCancelled(
  grantId: string,
  eventId: string,
): Promise<Response> {
  const { data: event } = await sb
    .from("meeting_events")
    .select("id, deal_id, calendar_pill_message_id, notetaker_state")
    .eq("nylas_grant_id", grantId)
    .eq("nylas_event_id", eventId)
    .maybeSingle()

  if (!event) {
    return json({ ok: true, skipped: "event_not_found" })
  }

  if (event.notetaker_state !== "cancelled") {
    await sb
      .from("meeting_events")
      .update({
        notetaker_state: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id)
  }

  if (event.calendar_pill_message_id) {
    const { data: pill } = await sb
      .from("messages")
      .select("content")
      .eq("id", event.calendar_pill_message_id)
      .maybeSingle()
    const current = pill?.content ?? ""
    if (current && !current.startsWith("[CANCELLED] ")) {
      await sb
        .from("messages")
        .update({ content: `[CANCELLED] ${current}` })
        .eq("id", event.calendar_pill_message_id)
    }
  }

  return json({ ok: true, cancelled: event.id })
}

// ----- Helpers -------------------------------------------------------------

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

// ----- Flow C: notetaker state -> maybe extract -----------------------------

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

  // Only act when the bot has finished and media is available on Nylas.
  if (event.notetaker_state !== "ready") {
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

  // Nylas v3 doesn't include media URLs in the notetaker.media webhook payload
  // — they live at /v3/grants/{grant}/notetakers/{id}/media. Fetch on demand
  // when state is "ready" and we haven't cached the URL yet.
  let transcriptUrl = event.transcript_url as string | null
  if (!transcriptUrl) {
    transcriptUrl = await fetchTranscriptUrlFromMedia(grantId, event.nylas_notetaker_id)
    if (transcriptUrl) {
      await sb
        .from("meeting_events")
        .update({ transcript_url: transcriptUrl })
        .eq("id", event.id)
    }
  }
  if (!transcriptUrl) {
    await sb
      .from("meeting_events")
      .update({
        processed_at: new Date().toISOString(),
        processing_error: "no_transcript_url",
      })
      .eq("id", event.id)
    return json({ ok: false, error: "no_transcript_url" }, 502)
  }

  const transcript = await fetchTranscript(transcriptUrl)
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

  // Direct fetch + service-role apikey because:
  // 1. sb.functions.invoke() does not propagate the service-role key in
  //    edge-function context.
  // 2. Project's new-format keys (sb_publishable_/sb_secret_) are not JWTs,
  //    so klo-respond must be deployed with verify_jwt: false.
  // 3. await ensures Deno doesn't recycle the worker before the call resolves.
  const kloRes = await fetch(`${SUPABASE_URL}/functions/v1/klo-respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      deal_id: event.deal_id,
      triggering_message_id: msgRow.id,
    }),
  }).catch((err) => {
    console.error("klo-respond fetch failed", err)
    return null
  })
  if (kloRes && !kloRes.ok) {
    console.error(
      "klo-respond non-2xx",
      kloRes.status,
      (await kloRes.text().catch(() => "")).slice(0, 200),
    )
  }

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

async function fetchTranscriptUrlFromMedia(
  grantId: string,
  notetakerId: string | null,
): Promise<string | null> {
  if (!notetakerId) return null
  try {
    const res = await fetch(
      `${NYLAS_API_URL}/v3/grants/${grantId}/notetakers/${notetakerId}/media`,
      { headers: { Authorization: `Bearer ${NYLAS_API_KEY}` } },
    )
    if (!res.ok) {
      console.error("media endpoint fetch failed", res.status)
      return null
    }
    const body = await res.json()
    return body?.data?.transcript?.url ?? null
  } catch (e) {
    console.error("media endpoint fetch error", e)
    return null
  }
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

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@")
  if (at < 0) return null
  return email.slice(at + 1).toLowerCase().trim() || null
}

const COMMON_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
])

function isCommonDomain(d: string): boolean {
  return COMMON_DOMAINS.has(d)
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
