// =============================================================================
// razorpay-webhook — Phase 12.3 (Chunk 3)
// =============================================================================
// Razorpay POSTs subscription lifecycle events here. The webhook is the source
// of truth for paid state — razorpay-create-subscription only opens the door
// (creates the subscription + redirects the user into the checkout modal); a
// successful mandate auth fires `subscription.activated` here, which is what
// flips the user/team to paid_active.
//
// Required Supabase secrets:
//   RAZORPAY_WEBHOOK_SECRET   (generated at https://dashboard.razorpay.com →
//                              Settings → Webhooks → set whatever string here
//                              and paste it back into supabase secrets)
//
// Deploy with --no-verify-jwt because Razorpay doesn't send a Supabase JWT:
//   supabase functions deploy razorpay-webhook --no-verify-jwt
//
// Subscribe in the Razorpay dashboard to (at minimum) these events:
//   subscription.activated
//   subscription.charged
//   subscription.pending
//   subscription.halted
//   subscription.cancelled
//   subscription.completed
//
// Webhook URL (test + live both point at this same function — secret differs):
//   https://<project-ref>.supabase.co/functions/v1/razorpay-webhook
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? ""

// Server-side Razorpay plan_id → klosure plan slug. Mirrors the maps in
// src/lib/razorpay-plans.ts. Keep them in sync; the webhook prefers the
// klosure_plan_slug value stored on the subscription's notes (set at create
// time) and only falls back to this map.
const PLAN_ID_TO_SLUG: Record<string, string> = {
  // Test mode
  "plan_SjJt4hH14l4xTF": "pro",
  "plan_SjJtU4Ic9gMKQT": "team_starter",
  "plan_SjJtqGy7KxXBv1": "team_growth",
  "plan_SjJu9eaMjFv92Y": "team_scale",
  // Live mode
  "plan_SjJAkRxX87ZYuz": "pro",
  "plan_SjJi8s6ORnUzxb": "team_starter",
  "plan_SjJikkUK5hjVVw": "team_growth",
  "plan_SjJjCRGcjI8Os1": "team_scale",
}

// Razorpay subscription statuses → the four buckets update_subscription_state
// understands. Anything we don't recognise is treated as a no-op state-wise
// (still logged in payment_events).
function mapStatus(rzpStatus: string): "active" | "pending" | "halted" | "cancelled" | "completed" | null {
  switch (rzpStatus) {
    case "active":
    case "authenticated":   // mandate authorised, first charge imminent — treat as active so UI unblocks
      return "active"
    case "pending":         // payment retry window; not yet read-only
      return "pending"
    case "halted":
      return "halted"
    case "cancelled":
      return "cancelled"
    case "completed":
      return "completed"
    default:
      return null
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "use POST" }), { status: 405 })
  }
  if (!WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "no_webhook_secret" }), { status: 500 })
  }

  const sig = req.headers.get("x-razorpay-signature") ?? ""
  const raw = await req.text()

  const verified = await verifyRazorpaySignature(raw, sig, WEBHOOK_SECRET)
  if (!verified) {
    // Always return 400 — never 200 — so Razorpay retries instead of marking
    // the event delivered. (Don't 200 silently here even if you're tempted to
    // hide the failure; it loses the signal.)
    return new Response(JSON.stringify({ error: "bad_signature" }), { status: 400 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(raw)
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 })
  }

  const eventId = String(event.id ?? "")
  const eventType = String(event.event ?? "")
  if (!eventId || !eventType) {
    return new Response(JSON.stringify({ error: "missing_event_fields" }), { status: 400 })
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // --- Idempotency: insert into payment_events with the unique
  //     (provider, event_id) constraint. A duplicate insert returns null
  //     row and we ack immediately so Razorpay stops retrying.
  const subscription = extractSubscription(event)
  const subscriptionId = subscription?.id ?? null

  const { data: inserted, error: insertErr } = await sb
    .from("payment_events")
    .insert({
      provider: "razorpay",
      event_id: eventId,
      event_type: eventType,
      payload: event,
      signature: sig,
      signature_verified: true,
      subscription_id: subscriptionId,
    })
    .select("id")
    .maybeSingle()

  if (insertErr) {
    // 23505 = unique_violation → duplicate event, already processed earlier.
    // Anything that looks like a unique conflict is treated as a benign
    // replay; ack 200 so Razorpay marks delivered.
    if (
      insertErr.code === "23505" ||
      /duplicate key|unique constraint/i.test(insertErr.message ?? "")
    ) {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 })
    }
    console.error("payment_events insert failed", insertErr)
    return new Response(JSON.stringify({ error: "log_failed", detail: insertErr.message }), { status: 500 })
  }

  const eventRowId = inserted?.id ?? null

  // --- Process the event. If anything below throws or returns an error,
  //     stamp processing_error on the row so we have an audit trail; still
  //     return non-200 so Razorpay retries.
  try {
    if (!subscription || !subscriptionId) {
      // Some Razorpay events (e.g. payment.* without a sub) don't carry a
      // subscription. Ack — we just logged it.
      await markProcessed(sb, eventRowId, null)
      return new Response(JSON.stringify({ ok: true, ignored: "no_subscription" }), { status: 200 })
    }

    // Resolve the klosure plan slug. Prefer notes (set by us at create time);
    // fall back to plan_id lookup; default to whatever is currently on the
    // owner row (handled inside the RPC by leaving plan unchanged).
    const notes = (subscription.notes ?? {}) as Record<string, unknown>
    const slugFromNotes = typeof notes.klosure_plan_slug === "string" ? notes.klosure_plan_slug : ""
    const planSlug =
      slugFromNotes || PLAN_ID_TO_SLUG[subscription.plan_id ?? ""] || ""

    const status = mapStatus(subscription.status ?? "")
    if (!status) {
      // Unknown status — ack but don't update state.
      await markProcessed(sb, eventRowId, `unknown_status:${subscription.status}`)
      return new Response(
        JSON.stringify({ ok: true, ignored: `unknown_status:${subscription.status}` }),
        { status: 200 },
      )
    }

    // Active/pending events MUST have a resolvable plan slug, otherwise we'd
    // overwrite the user's real plan with a placeholder. Halted/cancelled/
    // completed paths don't write the plan column (RPC keeps existing), so
    // an empty slug is harmless on those.
    if ((status === "active" || status === "pending") && !planSlug) {
      await markProcessed(sb, eventRowId, `unresolved_plan:${subscription.plan_id ?? ""}`)
      return new Response(
        JSON.stringify({ ok: false, error: "unresolved_plan", plan_id: subscription.plan_id ?? null }),
        { status: 500 },
      )
    }

    // Razorpay sends current_end as a Unix timestamp (seconds). Translate to
    // ISO; null if absent (RPC keeps existing period_end on null).
    const periodEnd = subscription.current_end
      ? new Date(subscription.current_end * 1000).toISOString()
      : subscription.end_at
        ? new Date(subscription.end_at * 1000).toISOString()
        : null

    const { data: rpcResult, error: rpcErr } = await sb.rpc("update_subscription_state", {
      p_subscription_id: subscriptionId,
      // For halted/cancelled/completed the RPC ignores plan; pass current slug
      // (or empty) — the case-when in the RPC keeps the existing plan column.
      p_plan_slug: planSlug || "",
      p_status: status,
      p_period_end: periodEnd,
    })

    if (rpcErr) {
      await markProcessed(sb, eventRowId, `rpc_error:${rpcErr.message}`)
      console.error("update_subscription_state failed", rpcErr)
      return new Response(JSON.stringify({ error: "rpc_failed", detail: rpcErr.message }), { status: 500 })
    }

    // The RPC returns a jsonb; ok=false means subscription_not_found.
    const ok = (rpcResult as { ok?: boolean } | null)?.ok ?? false
    if (!ok) {
      // Subscription unknown to us. This can happen if Razorpay replays an
      // event for a sub we created and then deleted, or for a manual sub
      // created in the dashboard. Log it and ack.
      await markProcessed(sb, eventRowId, "subscription_not_found")
      return new Response(JSON.stringify({ ok: true, warning: "subscription_not_found" }), { status: 200 })
    }

    // Backfill user_id / team_id on the event row so it's queryable by owner.
    const { data: owner } = await sb.rpc("find_subscription_owner", {
      p_subscription_id: subscriptionId,
    })
    const ownerRow = Array.isArray(owner) ? owner[0] : owner
    await sb
      .from("payment_events")
      .update({
        user_id: ownerRow?.user_id ?? null,
        team_id: ownerRow?.team_id ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventRowId)

    return new Response(
      JSON.stringify({ ok: true, subscription_id: subscriptionId, status, plan: planSlug }),
      { status: 200 },
    )
  } catch (err) {
    const msg = String(err)
    await markProcessed(sb, eventRowId, `exception:${msg}`).catch(() => {})
    console.error("razorpay-webhook handler error", err)
    return new Response(JSON.stringify({ error: "exception", detail: msg }), { status: 500 })
  }
})

async function markProcessed(
  sb: ReturnType<typeof createClient>,
  rowId: string | null,
  error: string | null,
) {
  if (!rowId) return
  await sb
    .from("payment_events")
    .update({
      processed_at: new Date().toISOString(),
      processing_error: error,
    })
    .eq("id", rowId)
}

// Razorpay subscription event payload shape:
//   payload.subscription.entity = { id, plan_id, status, current_start,
//                                   current_end, charge_at, end_at, notes, ... }
// payment.* events also carry payload.payment.entity but we don't act on
// them directly — subscription.charged is the canonical "renewal" signal and
// it includes the updated subscription entity alongside the payment entity.
type SubscriptionEntity = {
  id: string
  plan_id?: string
  status?: string
  current_end?: number
  end_at?: number
  notes?: Record<string, unknown>
}

function extractSubscription(event: Record<string, unknown>): SubscriptionEntity | null {
  const payload = event.payload as { subscription?: { entity?: SubscriptionEntity } } | undefined
  return payload?.subscription?.entity ?? null
}

// Razorpay webhook signing — HMAC-SHA256 over the raw request body using the
// webhook secret. Compared against the hex digest in x-razorpay-signature.
async function verifyRazorpaySignature(payload: string, header: string, secret: string) {
  if (!header) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payload))
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return timingSafeEqual(header, expected)
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}
