// =============================================================================
// aurinko-webhook — Phase B
// =============================================================================
// Single endpoint for all Aurinko subscription events.
//
// Behavior:
//   1. Verify HMAC-SHA256 signature against AURINKO_SIGNING_KEY
//   2. Parse the event — Aurinko sends one event per webhook
//   3. Persist email or calendar deltas idempotently
//   4. Trigger the appropriate downstream processor
//   5. Return 200 fast (Aurinko retries on non-2xx)
//
// Deploy:
//   supabase functions deploy aurinko-webhook --no-verify-jwt
// (--no-verify-jwt because Aurinko obviously doesn't send a Supabase JWT)
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const AURINKO_SIGNING_KEY = Deno.env.get("AURINKO_SIGNING_KEY") ?? ""

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  // Aurinko verifies the endpoint by sending a validation token at registration.
  if (req.method === "GET") {
    const url = new URL(req.url)
    const token = url.searchParams.get("validationToken")
    if (token) {
      return new Response(token, { status: 200, headers: { "Content-Type": "text/plain" } })
    }
    return new Response("ok", { status: 200 })
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 })
  }

  const startTime = Date.now()

  try {
    const rawBody = await req.text()
    const signature = req.headers.get("X-Aurinko-Signature") ?? ""

    const valid = await verifySignature(rawBody, signature, AURINKO_SIGNING_KEY)
    if (!valid) {
      console.warn("invalid aurinko webhook signature", { signature: signature.slice(0, 16) })
      // Return 200 anyway — invalid signatures are likely abuse/scans.
      return new Response("ok", { status: 200 })
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>
    const result = await handleEvent(payload)

    const durationMs = Date.now() - startTime
    console.log(JSON.stringify({
      event: "aurinko_webhook_complete",
      type: payload.subscription ?? payload.changeType ?? "unknown",
      result,
      duration_ms: durationMs,
    }))

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("aurinko webhook exception", err)
    // 200 anyway — letting Aurinko retry doesn't help if our own code is buggy.
    return new Response("ok", { status: 200 })
  }
})

// ----- Signature verification ---------------------------------------------

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

// ----- Event routing -------------------------------------------------------

interface AurinkoEvent {
  subscription?: string         // 'messages' | 'events' (calendar) | ...
  changeType?: string           // 'created' | 'updated' | 'deleted'
  resource?: string             // resource ID (messageId / eventId)
  accountId?: number
  // Some payloads nest under 'data'.
  data?: Record<string, unknown>
}

async function handleEvent(payload: Record<string, unknown>): Promise<string> {
  const evt = normalize(payload)
  if (!evt.accountId) {
    console.warn("aurinko event missing accountId", payload)
    return "skipped_no_account"
  }

  // Filter on grants we know about. If we don't recognize the account, the
  // event isn't for us — drop it. Guards against webhook leakage.
  const { data: grant } = await sb
    .from("aurinko_grants")
    .select("user_id, team_id, sync_state")
    .eq("aurinko_account_id", evt.accountId)
    .maybeSingle()
  if (!grant) return "skipped_unknown_account"
  if (grant.sync_state === "revoked") return "skipped_revoked_grant"

  // Refresh the grant's last_seen_at — useful liveness signal for the UI.
  await sb
    .from("aurinko_grants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("aurinko_account_id", evt.accountId)

  const subscription = (evt.subscription ?? "").toLowerCase()
  if (subscription.includes("message") || subscription === "mail") {
    return await handleMessageEvent(evt)
  }
  if (subscription.includes("event") || subscription === "calendar") {
    return await handleCalendarEvent(evt)
  }
  console.log("unhandled aurinko subscription", subscription, payload)
  return "skipped_unknown_subscription"
}

function normalize(payload: Record<string, unknown>): AurinkoEvent {
  // Aurinko's webhook envelope varies slightly by subscription type. Pull the
  // common fields out into one shape for downstream code.
  const root = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : payload
  return {
    subscription: String(payload.subscription ?? root.subscription ?? ""),
    changeType: String(payload.changeType ?? root.changeType ?? root.type ?? ""),
    resource: String(payload.resource ?? root.resource ?? root.resourceId ?? root.id ?? ""),
    accountId: Number(payload.accountId ?? root.accountId ?? 0) || undefined,
    data: root,
  }
}

// ----- Email --------------------------------------------------------------

async function handleMessageEvent(evt: AurinkoEvent): Promise<string> {
  if (!evt.resource || !evt.accountId) return "skipped_missing_fields"

  // 'deleted' is harmless to record but doesn't drive coaching.
  if (evt.changeType === "deleted") return "skipped_deleted"

  // Stub-row insert: aurinko-process-email fetches the full message body from
  // Aurinko's API. We dedupe via the partial-unique index on
  // (aurinko_account_id, aurinko_message_id).
  const { error } = await sb.from("email_events").upsert(
    {
      aurinko_account_id: evt.accountId,
      aurinko_message_id: evt.resource,
      received_at: new Date().toISOString(),
      raw_event: evt,
    },
    { onConflict: "aurinko_account_id,aurinko_message_id" },
  )
  if (error) {
    console.error("email_events upsert failed", error)
    return "error"
  }
  triggerProcessor("aurinko-process-email", {
    aurinko_account_id: evt.accountId,
    aurinko_message_id: evt.resource,
  })
  return "processed_message"
}

// ----- Calendar -----------------------------------------------------------

async function handleCalendarEvent(evt: AurinkoEvent): Promise<string> {
  if (!evt.resource || !evt.accountId) return "skipped_missing_fields"

  if (evt.changeType === "deleted") {
    triggerProcessor("aurinko-process-calendar", {
      aurinko_account_id: evt.accountId,
      aurinko_event_id: evt.resource,
      change_type: "deleted",
    })
    return "processed_calendar_deleted"
  }

  // Stub-row insert; the processor fetches details from Aurinko and decides
  // whether to dispatch a Recall bot.
  const { error } = await sb.from("meeting_events").upsert(
    {
      aurinko_account_id: evt.accountId,
      aurinko_event_id: evt.resource,
      // starts_at/ends_at are filled in by the processor after the GET.
      starts_at: new Date().toISOString(),
      ends_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      raw_event: evt,
    },
    { onConflict: "aurinko_account_id,aurinko_event_id" },
  )
  if (error) {
    console.error("meeting_events upsert failed", error)
    return "error"
  }
  triggerProcessor("aurinko-process-calendar", {
    aurinko_account_id: evt.accountId,
    aurinko_event_id: evt.resource,
    change_type: evt.changeType ?? "created",
  })
  return "processed_calendar"
}

// ----- Trigger downstream processors --------------------------------------

function triggerProcessor(fnName: string, body: Record<string, unknown>): void {
  // Fire-and-forget. The webhook must return fast; the processor runs async.
  sb.functions.invoke(fnName, { body }).catch((err) => {
    console.warn(`trigger ${fnName} failed:`, err)
  })
}
