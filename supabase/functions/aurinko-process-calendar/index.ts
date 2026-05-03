// =============================================================================
// aurinko-process-calendar — Phase B
// =============================================================================
// Calendar event processor. Three flows:
//   - created/updated → fetch event, match deal, ensure 📅 pill, decide bot
//   - deleted         → mark calendar pill as cancelled
//
// When a created/updated event has a recognized Zoom/Meet/Teams URL and meets
// pool capacity, we POST to Recall.ai to dispatch a bot. The Recall webhook
// handles the bot lifecycle and transcript download — we don't poll here.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { aurinkoFetch } from "../_shared/aurinko-client.ts"
import {
  canDispatchMeeting,
  fireQuotaNotification,
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
    const { aurinko_account_id, aurinko_event_id, change_type } = await req.json()
    if (!aurinko_account_id || !aurinko_event_id) {
      return json({ ok: false, error: "missing_args" }, 400)
    }

    if (change_type === "deleted") {
      return await handleDeleted(aurinko_account_id, aurinko_event_id)
    }
    return await handleCreatedOrUpdated(aurinko_account_id, aurinko_event_id)
  } catch (err) {
    console.error("aurinko-process-calendar exception", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

// ----- Flow A: created/updated --------------------------------------------

async function handleCreatedOrUpdated(
  accountId: number,
  eventId: string,
): Promise<Response> {
  const { data: row } = await sb
    .from("meeting_events")
    .select("*")
    .eq("aurinko_account_id", accountId)
    .eq("aurinko_event_id", eventId)
    .maybeSingle()
  if (!row) return json({ ok: false, error: "row_not_found" }, 404)

  const { data: grant } = await sb
    .from("aurinko_grants")
    .select("user_id, team_id, email_address")
    .eq("aurinko_account_id", accountId)
    .maybeSingle()
  if (!grant) return json({ ok: false, error: "grant_not_found" }, 404)

  // Fetch the full event from Aurinko.
  const event = await aurinkoFetch(
    sb,
    accountId,
    `/calendars/primary/events/${encodeURIComponent(eventId)}`,
  )
  if (!event) {
    await markRow(row.id, { processing_error: "aurinko_fetch_failed" })
    return json({ ok: false, error: "fetch_failed" }, 502)
  }

  // Aurinko event shape:
  //   subject, when: { start, end, isAllDay }, location: { url, displayName },
  //   attendees: [{ name, email, status }], onlineMeetingUrl, organizer
  const startsAtStr = pickIso(event, ["startTime", "start"])
  const endsAtStr = pickIso(event, ["endTime", "end"])
  if (!startsAtStr || !endsAtStr) {
    await markRow(row.id, { processing_error: "missing_when" })
    return json({ ok: true, skipped: "missing_when" })
  }

  const meetingUrl = pickMeetingUrl(event)
  const meetingProvider = detectProvider(meetingUrl)
  const title = String(event.subject ?? event.title ?? "")
  const participants = (((event.attendees as Array<Record<string, unknown>> | undefined) ?? [])
    .map((p) => ({
      name: (p.name as string | undefined) ?? null,
      email: String(p.email ?? "").toLowerCase(),
    }))
    .filter((p) => p.email))

  // Backfill the row with the parsed event fields.
  await sb
    .from("meeting_events")
    .update({
      starts_at: startsAtStr,
      ends_at: endsAtStr,
      title: title || null,
      participants,
      meeting_url: meetingUrl ?? null,
      meeting_provider: meetingProvider,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)

  // Internal-only events get no pill, no bot.
  const externals = participants.filter(
    (p) => p.email !== grant.email_address.toLowerCase(),
  )
  if (externals.length === 0) {
    if (row.notetaker_state === "not_dispatched") {
      await markRow(row.id, {
        notetaker_state: "not_dispatched",
        processing_error: "no_external_participants",
      })
    }
    return json({ ok: true, skipped: "internal_only" })
  }

  // Match a deal.
  let dealId: string | null = row.deal_id ?? null
  let matchedAddress: string | null = row.matched_stakeholder ?? null
  if (!dealId) {
    const m = await matchDealForEvent(grant.user_id, externals)
    dealId = m.dealId
    matchedAddress = m.address
    if (dealId) {
      await sb
        .from("meeting_events")
        .update({
          deal_id: dealId,
          matched_stakeholder: matchedAddress,
        })
        .eq("id", row.id)
    }
  }
  if (!dealId) {
    if (row.notetaker_state === "not_dispatched") {
      await markRow(row.id, {
        notetaker_state: "not_dispatched",
        processing_error: "no_stakeholder_match",
      })
    }
    return json({ ok: true, skipped: "no_match" })
  }

  // Ensure the 📅 pill exists in chat.
  await ensureCalendarPill({
    eventRowId: row.id,
    existingPillId: row.calendar_pill_message_id,
    aurinkoEventId: eventId,
    dealId,
    title: title || "Meeting",
    startsAt: startsAtStr,
    endsAt: endsAtStr,
    participants,
    meetingUrl,
    meetingProvider,
  })

  // Bot dispatch decision (only on first call).
  if (row.notetaker_state !== "not_dispatched") {
    return json({ ok: true, skipped: `already_${row.notetaker_state}` })
  }
  if (!meetingProvider || meetingProvider === "other") {
    await markRow(row.id, {
      notetaker_state: "not_dispatched",
      processing_error: "no_recognized_provider",
    })
    return json({ ok: true, skipped: "no_provider" })
  }
  if (new Date(startsAtStr).getTime() < Date.now() - 5 * 60 * 1000) {
    await markRow(row.id, {
      notetaker_state: "not_dispatched",
      processing_error: "in_past",
    })
    return json({ ok: true, skipped: "in_past" })
  }

  const expectedMinutes = Math.max(
    1,
    Math.round((new Date(endsAtStr).getTime() - new Date(startsAtStr).getTime()) / 60000),
  )
  const capacity = await canDispatchMeeting(sb, grant.team_id, expectedMinutes)
  if (!capacity.allowed) {
    await markRow(row.id, {
      notetaker_state: "skipped_quota",
      processing_error: capacity.reason ?? "pool_full",
    })
    if (grant.team_id && capacity.status && !capacity.status.notified_100_at) {
      await fireQuotaNotification(grant.team_id, "meeting_pool_full", capacity.status)
    }
    return json({ ok: true, skipped: "pool_full" })
  }

  // Dispatch a Recall bot.
  const dispatched = await dispatchRecallBot({
    meetingUrl: meetingUrl!,
    title: title || "Meeting",
    meetingEventRowId: row.id,
    userId: grant.user_id,
    teamId: grant.team_id,
  })

  if (!dispatched.ok) {
    await markRow(row.id, {
      notetaker_state: "failed",
      processing_error: `dispatch_failed:${dispatched.error}`,
    })
    return json({ ok: false, error: "dispatch_failed", detail: dispatched.error })
  }

  await sb
    .from("meeting_events")
    .update({
      recall_bot_id: dispatched.botId,
      notetaker_state: "scheduled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)

  return json({ ok: true, deal_id: dealId, recall_bot_id: dispatched.botId })
}

// ----- Flow B: deleted ----------------------------------------------------

async function handleDeleted(accountId: number, eventId: string): Promise<Response> {
  const { data: row } = await sb
    .from("meeting_events")
    .select("id, deal_id, calendar_pill_message_id, notetaker_state, recall_bot_id")
    .eq("aurinko_account_id", accountId)
    .eq("aurinko_event_id", eventId)
    .maybeSingle()
  if (!row) return json({ ok: true, skipped: "row_not_found" })

  if (row.notetaker_state !== "cancelled") {
    await sb
      .from("meeting_events")
      .update({ notetaker_state: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", row.id)
  }
  if (row.calendar_pill_message_id) {
    const { data: pill } = await sb
      .from("messages").select("content").eq("id", row.calendar_pill_message_id).maybeSingle()
    const current = pill?.content ?? ""
    if (current && !current.startsWith("[CANCELLED] ")) {
      await sb
        .from("messages")
        .update({ content: `[CANCELLED] ${current}` })
        .eq("id", row.calendar_pill_message_id)
    }
  }
  // Cancel the Recall bot if it hasn't joined yet.
  if (row.recall_bot_id && RECALL_API_KEY) {
    await fetch(`${RECALL_API_BASE}/bot/${row.recall_bot_id}`, {
      method: "DELETE",
      headers: { Authorization: `Token ${RECALL_API_KEY}` },
    }).catch((err) => console.warn("recall bot cancel failed", err))
  }
  return json({ ok: true, cancelled: row.id })
}

// ----- Helpers ------------------------------------------------------------

async function ensureCalendarPill(args: {
  eventRowId: string
  existingPillId: string | null
  aurinkoEventId: string
  dealId: string
  title: string
  startsAt: string
  endsAt: string
  participants: Array<{ email: string; name?: string | null }>
  meetingUrl: string | null
  meetingProvider: string | null
}): Promise<void> {
  if (args.existingPillId) return

  // Defensive lookup — another invocation may have inserted before us.
  const { data: prior } = await sb
    .from("messages")
    .select("id")
    .eq("deal_id", args.dealId)
    .contains("metadata", {
      source: "aurinko_calendar_event",
      meeting_event_id: args.eventRowId,
    })
    .maybeSingle()
  if (prior) {
    await sb
      .from("meeting_events")
      .update({ calendar_pill_message_id: prior.id })
      .eq("id", args.eventRowId)
    return
  }

  const durationMinutes = Math.max(
    1,
    Math.round((new Date(args.endsAt).getTime() - new Date(args.startsAt).getTime()) / 60000),
  )
  const dateStr = new Date(args.startsAt).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
  const partyList = args.participants
    .map((p) => p.name || p.email)
    .filter(Boolean)
    .join(", ") || "—"
  const content = `CALENDAR — ${args.title} — ${dateStr} (${durationMinutes} min)
Participants: ${partyList}
Provider: ${args.meetingProvider ?? "—"}
URL: ${args.meetingUrl ?? "—"}`

  const { data: msg, error } = await sb
    .from("messages")
    .insert({
      deal_id: args.dealId,
      sender_type: "system",
      sender_name: "calendar",
      content,
      visible_to: null,
      metadata: {
        source: "aurinko_calendar_event",
        meeting_event_id: args.eventRowId,
        aurinko_event_id: args.aurinkoEventId,
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
    .eq("id", args.eventRowId)
}

async function dispatchRecallBot(args: {
  meetingUrl: string
  title: string
  meetingEventRowId: string
  userId: string
  teamId: string | null
}): Promise<{ ok: true; botId: string } | { ok: false; error: string }> {
  if (!RECALL_API_KEY) return { ok: false, error: "RECALL_API_KEY not set" }

  const res = await fetch(`${RECALL_API_BASE}/bot`, {
    method: "POST",
    headers: {
      Authorization: `Token ${RECALL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meeting_url: args.meetingUrl,
      bot_name: "Klo (Klosure)",
      // meeting_captions = use the host platform's free captions for transcription.
      // That matches the cost model (~$0.65/hr all-in including bot time).
      transcription_options: { provider: "meeting_captions" },
      automatic_leave: { waiting_room_timeout: 1200, noone_joined_timeout: 1200 },
      metadata: {
        klosure_meeting_event_id: args.meetingEventRowId,
        klosure_user_id: args.userId,
        klosure_team_id: args.teamId,
      },
    }),
  })

  const responseBody = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: `${res.status}:${JSON.stringify(responseBody).slice(0, 200)}` }
  }
  const botId = String((responseBody as { id?: string }).id ?? "")
  if (!botId) return { ok: false, error: "no_bot_id_in_response" }

  // Persist the bot row so the webhook handler can correlate.
  await sb.from("recall_bots").insert({
    recall_bot_id: botId,
    meeting_event_id: args.meetingEventRowId,
    user_id: args.userId,
    team_id: args.teamId,
    meeting_url: args.meetingUrl,
    bot_state: "dispatched",
  })

  return { ok: true, botId }
}

async function matchDealForEvent(
  sellerId: string,
  externals: Array<{ email: string; name?: string | null }>,
): Promise<{ dealId: string | null; address: string | null }> {
  const { data: deals } = await sb
    .from("deals")
    .select("id, klo_state")
    .eq("seller_id", sellerId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
  if (!deals || deals.length === 0) return { dealId: null, address: null }

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

  for (const deal of deals) {
    const peopleEmails = new Set(emailsForDeal(deal))
    if (peopleEmails.size === 0) continue
    for (const ext of externals) {
      if (peopleEmails.has(ext.email)) {
        return { dealId: deal.id, address: ext.email }
      }
    }
  }
  for (const deal of deals) {
    const peopleDomains = new Set(
      emailsForDeal(deal)
        .map((e) => domainOf(e))
        .filter((d): d is string => !!d && !isCommonDomain(d)),
    )
    if (peopleDomains.size === 0) continue
    for (const ext of externals) {
      const dom = domainOf(ext.email)
      if (dom && peopleDomains.has(dom)) {
        return { dealId: deal.id, address: ext.email }
      }
    }
  }
  return { dealId: null, address: null }
}

async function markRow(id: string, updates: Record<string, unknown>): Promise<void> {
  await sb
    .from("meeting_events")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
}

function pickIso(event: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = event[k]
    if (typeof v === "string" && v) return new Date(v).toISOString()
    if (v && typeof v === "object") {
      const dt = (v as { dateTime?: string }).dateTime
      if (typeof dt === "string" && dt) return new Date(dt).toISOString()
    }
  }
  return null
}

function pickMeetingUrl(event: Record<string, unknown>): string | null {
  // Most reliable signal first: explicit onlineMeetingUrl.
  const direct = (event.onlineMeetingUrl as string | undefined)
    ?? ((event.onlineMeeting as { joinUrl?: string } | undefined)?.joinUrl)
  if (direct) return direct
  // Aurinko also surfaces location.url for some providers.
  const loc = event.location as { url?: string; displayName?: string } | undefined
  if (loc?.url) return loc.url
  // Fallback: scan the body/description for the first conference URL.
  const body = String(event.bodyPlain ?? event.description ?? "")
  const m = body.match(
    /https?:\/\/(?:[a-z0-9-]+\.)?(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com)\/[^\s<>"]+/i,
  )
  return m ? m[0] : null
}

function detectProvider(url: string | null): string | null {
  if (!url) return null
  if (url.includes("zoom.us")) return "zoom"
  if (url.includes("meet.google.com")) return "meet"
  if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) return "teams"
  return "other"
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@")
  if (at < 0) return null
  return email.slice(at + 1).toLowerCase().trim() || null
}

const COMMON_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "icloud.com", "me.com",
  "proton.me", "protonmail.com", "aol.com",
])

function isCommonDomain(d: string): boolean { return COMMON_DOMAINS.has(d) }

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
