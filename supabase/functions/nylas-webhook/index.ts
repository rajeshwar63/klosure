// =============================================================================
// nylas-webhook — Phase A
// =============================================================================
// Single endpoint for all Nylas v3 webhook events.
//
// Behavior:
//   1. Verify HMAC-SHA256 signature using NYLAS_WEBHOOK_SECRET
//   2. Parse the deltas array (Nylas batches events)
//   3. For each delta, persist to the right table idempotently
//   4. Trigger async processing for new events
//   5. Return 200 within 5s or Nylas retries
//
// Deploy:
//   supabase functions deploy nylas-webhook --no-verify-jwt
// (--no-verify-jwt because Nylas obviously doesn't send a Supabase JWT)
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const NYLAS_WEBHOOK_SECRET = Deno.env.get("NYLAS_WEBHOOK_SECRET") ?? ""

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  // Nylas sends a one-time challenge GET when you register the webhook URL.
  // Echo it back to confirm we own the endpoint.
  if (req.method === "GET") {
    const url = new URL(req.url)
    const challenge = url.searchParams.get("challenge")
    if (challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })
    }
    return new Response("ok", { status: 200 })
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 })
  }

  const startTime = Date.now()

  try {
    const rawBody = await req.text()
    const signature = req.headers.get("X-Nylas-Signature") ?? ""

    // 1. Verify signature.
    const valid = await verifySignature(rawBody, signature, NYLAS_WEBHOOK_SECRET)
    if (!valid) {
      console.warn("invalid webhook signature", { signature: signature.slice(0, 16) })
      // Return 200 anyway — invalid signatures are likely abuse/scans, no point
      // signaling to attackers that they're being rejected. Real Nylas will
      // never get here.
      return new Response("ok", { status: 200 })
    }

    // 2. Parse. Nylas v3 sends one CloudEvent per webhook
    //    (`{specversion, type, data: {object: {...}}}`); the legacy v2 batch
    //    shape (`{deltas: [...]}`) is kept here only as a defensive fallback
    //    in case Nylas ever flips a project back. The earlier handler only
    //    accepted v2, which silently dropped every real Nylas v3 event.
    const payload = JSON.parse(rawBody) as Record<string, unknown>
    const deltas = extractDeltas(payload)
    if (deltas.length === 0) {
      console.warn("payload had no deltas (v3 cloudevent extraction failed)")
      return new Response("ok", { status: 200 })
    }

    // 3. Process each delta.
    let processed = 0
    let skipped = 0
    const triggers: Array<Promise<void>> = []

    for (const delta of deltas) {
      try {
        const result = await handleDelta(delta)
        if (result === "processed") processed++
        else skipped++
        if (result === "processed") {
          // Fire-and-forget the downstream processor. Don't await — the webhook
          // must return fast.
          triggers.push(
            triggerProcessor(delta).catch((e) => {
              console.error("trigger failed", e, delta.type)
            }),
          )
        }
      } catch (err) {
        console.error("delta error", err, delta.type, delta.object?.id)
        // Continue processing other deltas. We log the error but don't fail
        // the whole webhook — that would cause Nylas to retry the entire
        // batch, including the deltas we already wrote.
        skipped++
      }
    }

    // Best-effort kick the triggers; ignore the result.
    Promise.allSettled(triggers).catch(() => {})

    const durationMs = Date.now() - startTime
    console.log(
      JSON.stringify({
        event: "nylas_webhook_complete",
        deltas: deltas.length,
        processed,
        skipped,
        duration_ms: durationMs,
      }),
    )

    return new Response(JSON.stringify({ ok: true, processed, skipped }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("webhook handler exception", err)
    // Return 200 — letting Nylas retry doesn't help if our own code is buggy.
    // The error is logged; we'll fix and the next event will succeed.
    return new Response("ok", { status: 200 })
  }
})

// ----- Signature verification ----------------------------------------------

async function verifySignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
    const sigHex = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
    // Constant-time comparison to avoid timing attacks.
    if (sigHex.length !== signature.length) return false
    let mismatch = 0
    for (let i = 0; i < sigHex.length; i++) {
      mismatch |= sigHex.charCodeAt(i) ^ signature.charCodeAt(i)
    }
    return mismatch === 0
  } catch (e) {
    console.error("sig verify error", e)
    return false
  }
}

// ----- Delta routing -------------------------------------------------------

interface NylasDelta {
  type: string
  object: {
    id: string
    grant_id: string
    [k: string]: unknown
  }
  date?: number
}

type DeltaResult = "processed" | "duplicate" | "skipped"

// Normalise a webhook body into the internal `{type, object, date}` shape.
// Nylas v3 sends one CloudEvent per webhook (`{specversion,type,data:{object}}`)
// — the original handler expected the v2 batched `{deltas:[...]}` shape and
// silently dropped every real event. Both shapes are handled here so we don't
// have to redeploy if Nylas changes the format on a project flag.
function extractDeltas(payload: Record<string, unknown>): NylasDelta[] {
  if (!payload || typeof payload !== "object") return []

  const deltas = payload.deltas
  if (Array.isArray(deltas)) return deltas as NylasDelta[]

  if (typeof payload.type === "string" && payload.data && typeof payload.data === "object") {
    const data = payload.data as { object?: NylasDelta["object"] }
    if (data.object && typeof data.object === "object") {
      return [
        {
          type: payload.type,
          object: data.object,
          date: typeof payload.time === "number" ? payload.time : undefined,
        },
      ]
    }
  }

  return []
}

async function handleDelta(delta: NylasDelta): Promise<DeltaResult> {
  // Fast skip: if the grant isn't one we recognize, ignore. This guards
  // against webhook leakage if someone else points their Nylas app at our
  // URL by mistake.
  const { data: grant } = await sb
    .from("nylas_grants")
    .select("id, user_id, team_id, sync_state")
    .eq("nylas_grant_id", delta.object.grant_id)
    .maybeSingle()
  if (!grant) {
    console.log("unknown grant, skipping", delta.object.grant_id)
    return "skipped"
  }

  // If grant is revoked locally, skip processing but don't error.
  if (grant.sync_state === "revoked") {
    console.log("revoked grant, skipping", delta.object.grant_id, delta.type)
    return "skipped"
  }

  // Touch the grant's last_seen_at so we know it's alive.
  await sb
    .from("nylas_grants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("nylas_grant_id", delta.object.grant_id)

  switch (delta.type) {
    case "message.created":
    case "message.updated":
      return await handleMessage(delta, grant)
    case "event.created":
    case "event.updated":
      return await handleEvent(delta, grant)
    case "event.deleted":
      return await handleEventDeleted(delta)
    case "notetaker.media":
    case "notetaker.meeting_state":
      return await handleNotetaker(delta, grant)
    case "grant.expired":
      await sb
        .from("nylas_grants")
        .update({ sync_state: "expired", last_error: "grant expired" })
        .eq("nylas_grant_id", delta.object.grant_id)
      return "processed"
    case "grant.deleted":
      await sb
        .from("nylas_grants")
        .update({ sync_state: "revoked" })
        .eq("nylas_grant_id", delta.object.grant_id)
      return "processed"
    default:
      console.log("unhandled delta type", delta.type)
      return "skipped"
  }
}

// ----- Message (email) ------------------------------------------------------

async function handleMessage(
  delta: NylasDelta,
  _grant: { user_id: string; team_id: string | null },
): Promise<DeltaResult> {
  const msg = delta.object as Record<string, unknown> & {
    id: string
    grant_id: string
    thread_id?: string
    from?: Array<{ name?: string; email: string }>
    to?: Array<{ name?: string; email: string }>
    cc?: Array<{ name?: string; email: string }>
    subject?: string
    snippet?: string
    date?: number
  }

  const fromAddr = msg.from?.[0]?.email ?? null
  const receivedAt = msg.date
    ? new Date(msg.date * 1000).toISOString()
    : new Date().toISOString()

  // Upsert by (grant_id, message_id) — handles message.updated firing after
  // message.created without creating duplicates.
  const { error } = await sb.from("email_events").upsert(
    {
      nylas_grant_id: msg.grant_id,
      nylas_message_id: msg.id,
      thread_id: msg.thread_id ?? null,
      from_addr: fromAddr,
      to_addrs: msg.to ?? [],
      cc_addrs: msg.cc ?? [],
      subject: msg.subject ?? null,
      snippet: msg.snippet ?? null,
      received_at: receivedAt,
      raw_event: delta,
    },
    { onConflict: "nylas_grant_id,nylas_message_id" },
  )

  if (error) {
    console.error("email_events upsert failed", error)
    throw error
  }
  return "processed"
}

// ----- Event (calendar) -----------------------------------------------------

async function handleEvent(
  delta: NylasDelta,
  _grant: { user_id: string; team_id: string | null },
): Promise<DeltaResult> {
  const evt = delta.object as Record<string, unknown> & {
    id: string
    grant_id: string
    title?: string
    participants?: Array<{ name?: string; email: string }>
    when?: { start_time: number; end_time: number; object: string }
    conferencing?: { provider?: string; details?: { url?: string } }
  }

  if (!evt.when || evt.when.object !== "timespan") {
    // All-day events and recurring masters don't have notetaker capture.
    return "skipped"
  }

  const startsAt = new Date(evt.when.start_time * 1000).toISOString()
  const endsAt = new Date(evt.when.end_time * 1000).toISOString()

  const meetingUrl = evt.conferencing?.details?.url ?? null
  const meetingProvider = detectProvider(meetingUrl)

  const { error } = await sb.from("meeting_events").upsert(
    {
      nylas_grant_id: evt.grant_id,
      nylas_event_id: evt.id,
      title: evt.title ?? null,
      participants: evt.participants ?? [],
      starts_at: startsAt,
      ends_at: endsAt,
      meeting_url: meetingUrl,
      meeting_provider: meetingProvider,
      updated_at: new Date().toISOString(),
      raw_event: delta,
    },
    { onConflict: "nylas_grant_id,nylas_event_id" },
  )

  if (error) {
    console.error("meeting_events upsert failed", error)
    throw error
  }
  return "processed"
}

async function handleEventDeleted(delta: NylasDelta): Promise<DeltaResult> {
  // Don't hard-delete — keep the row + the chat pill so the user has a record
  // that the meeting was cancelled. nylas-process-meeting will flip the pill
  // content to a [CANCELLED] prefix on the downstream invoke.
  await sb
    .from("meeting_events")
    .update({
      notetaker_state: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("nylas_event_id", delta.object.id)
    .eq("nylas_grant_id", delta.object.grant_id)
  return "processed"
}

// ----- Notetaker -----------------------------------------------------------

async function handleNotetaker(
  delta: NylasDelta,
  _grant: { user_id: string; team_id: string | null },
): Promise<DeltaResult> {
  const nt = delta.object as Record<string, unknown> & {
    id: string
    grant_id: string
    event_id?: string
    state?: string
    media?: { transcript_url?: string; recording_url?: string }
  }

  const updates: Record<string, unknown> = {
    nylas_notetaker_id: nt.id,
    updated_at: new Date().toISOString(),
  }

  if (delta.type === "notetaker.meeting_state") {
    const state = (nt.state ?? "").toLowerCase()
    console.log("notetaker.meeting_state", { id: nt.id, state, raw_state: nt.state })
    // Map Nylas notetaker states to our enum.
    // Nylas v3 lifecycle: connecting -> attempting_join -> waiting_for_admission
    //   -> joining -> joined -> recording -> concluding -> concluded
    //   -> media_uploading -> media_uploaded. Failure -> failed.
    const stateMap: Record<string, string> = {
      scheduled: "scheduled",
      connecting: "scheduled",
      attempting_join: "scheduled",
      waiting_for_admission: "scheduled",
      joining: "scheduled",
      joined: "joined",
      in_meeting: "joined",
      recording: "recording",
      concluding: "media_processing",
      concluded: "media_processing",
      processing: "media_processing",
      media_uploading: "media_processing",
      media_uploaded: "ready",
      completed: "ready",
      failed: "failed",
    }
    if (stateMap[state]) updates.notetaker_state = stateMap[state]
  }

  if (delta.type === "notetaker.media") {
    console.log("notetaker.media", {
      id: nt.id,
      has_transcript: !!nt.media?.transcript_url,
      has_recording: !!nt.media?.recording_url,
    })
    if (nt.media?.transcript_url) {
      updates.transcript_url = nt.media.transcript_url
      updates.notetaker_state = "ready"
    }
  }

  // Find the meeting_event row this notetaker belongs to. Match on event_id
  // if present; otherwise we update by notetaker_id (sprint 06 sets this when
  // dispatching).
  const matchKey = nt.event_id
    ? { nylas_event_id: nt.event_id, nylas_grant_id: nt.grant_id }
    : { nylas_notetaker_id: nt.id }

  const { error } = await sb.from("meeting_events").update(updates).match(matchKey)

  if (error) {
    console.error("meeting_events notetaker update failed", error, matchKey)
    throw error
  }
  return "processed"
}

// ----- Helpers --------------------------------------------------------------

function detectProvider(url: string | null): string | null {
  if (!url) return null
  if (url.includes("zoom.us")) return "zoom"
  if (url.includes("meet.google.com")) return "meet"
  if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) return "teams"
  return "other"
}

// ----- Trigger downstream processors ---------------------------------------

async function triggerProcessor(delta: NylasDelta): Promise<void> {
  const isEmail = delta.type === "message.created" || delta.type === "message.updated"
  const isMeeting = delta.type.startsWith("event.") || delta.type.startsWith("notetaker.")

  if (!isEmail && !isMeeting) return

  const fnName = isEmail ? "nylas-process-email" : "nylas-process-meeting"
  const body = isEmail
    ? { nylas_grant_id: delta.object.grant_id, nylas_message_id: delta.object.id }
    : {
        nylas_grant_id: delta.object.grant_id,
        nylas_event_or_notetaker_id: delta.object.id,
        type: delta.type,
      }

  // Fire the function async. We don't await the response.
  await sb.functions.invoke(fnName, { body }).catch((err) => {
    console.warn(`trigger ${fnName} failed:`, err)
  })
}
