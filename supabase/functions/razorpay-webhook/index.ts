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
//   subscription.updated      (Phase A sprint 09 — needed for seat changes;
//                              fires when quantity is changed via the Update
//                              Subscription API)
//
// Webhook URL (test + live both point at this same function — secret differs):
//   https://<project-ref>.supabase.co/functions/v1/razorpay-webhook
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import {
  mapStatus,
  resolvePlanSlug,
  periodEndFromSubscription,
  type SubscriptionEntity,
} from "../_shared/razorpay.ts"
import { sendEmail } from "../_shared/send-email.ts"
import {
  subscriptionStartedEmail,
  subscriptionCancelledEmail,
  subscriptionHaltedEmail,
} from "../_shared/email-templates.ts"

const APP_URL = Deno.env.get("APP_URL") ?? "https://klosure.ai"
const PLAN_LABELS: Record<string, string> = {
  coach: "Klosure Coach",
  closer: "Klosure Closer",
  command: "Klosure Command",
  // Legacy slugs (pre-Phase-A-sprint-09) preserved for historical events.
  klosure: "Klosure Closer",
  enterprise: "Klosure Command",
  pro: "Klosure",
  team_starter: "Klosure",
  team_growth: "Klosure",
  team_scale: "Klosure",
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? ""

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
    const planSlug = resolvePlanSlug(subscription)

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

    const periodEnd = periodEndFromSubscription(subscription)

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

    // Sync teams.seat_cap from the Razorpay subscription quantity. This is
    // the source-of-truth path for seat changes:
    //   - subscription.activated  → first-time set
    //   - subscription.updated    → admin added/removed seats mid-cycle
    //   - subscription.charged    → renewal cycle; apply pending downsize if any
    // For terminal events (halted/cancelled/completed) we leave seat_cap alone
    // — the team is going read-only via update_subscription_state anyway.
    if (
      ownerRow?.team_id &&
      typeof subscription.quantity === "number" &&
      subscription.quantity >= 1 &&
      (status === "active" || status === "pending")
    ) {
      const updates: Record<string, unknown> = { seat_cap: subscription.quantity }
      // On charge events (renewal), if a downsize was scheduled and Razorpay
      // has now applied it (quantity == pending_seat_cap), clear the pending
      // marker. This is best-effort — the next "updated" event would do the
      // same.
      if (eventType === "subscription.charged") {
        updates.pending_seat_cap = null
      }
      await sb.from("teams").update(updates).eq("id", ownerRow.team_id)
    }

    // Fire transactional emails based on the event type. Best-effort — never
    // block the 200 ack on email send failures (Razorpay would otherwise
    // retry the whole event chain).
    try {
      await dispatchLifecycleEmails(sb, eventType, event, subscription, ownerRow)
    } catch (err) {
      console.warn("razorpay-webhook: email dispatch failed", err)
    }

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

// Map a Razorpay subscription event to the right transactional email. Each
// arm is best-effort; failures are logged but never thrown out.
async function dispatchLifecycleEmails(
  sb: ReturnType<typeof createClient>,
  eventType: string,
  rawEvent: Record<string, unknown>,
  subscription: SubscriptionEntity,
  ownerRow: { user_id?: string | null; team_id?: string | null } | null,
) {
  // Resolve recipient email + name from the owner row.
  const recipient = await resolveOwnerRecipient(sb, ownerRow)
  if (!recipient?.email) return

  const planSlug = resolvePlanSlug(subscription)
  const planLabel = PLAN_LABELS[planSlug] ?? "Klosure subscription"

  switch (eventType) {
    case "subscription.activated": {
      // First mandate auth completed — celebratory email. Use the user row
      // flag so the customer doesn't receive this twice if Razorpay replays
      // the event after the same subscription is cancelled and resubscribed
      // (rare, but possible in test mode).
      const alreadySent = await checkActivatedAlreadySent(sb, subscription.id)
      if (alreadySent) return
      const { subject, html } = subscriptionStartedEmail({
        userEmail: recipient.email,
        userName: recipient.name ?? "",
        planLabel,
        appUrl: APP_URL,
      })
      const res = await sendEmail({
        to: recipient.email,
        subject,
        html,
        tags: [
          { name: "type", value: "subscription_activated" },
          { name: "subscription_id", value: subscription.id },
        ],
      })
      if (res.ok && !res.skipped) {
        await markActivatedSent(sb, subscription.id)
      }
      return
    }

    case "subscription.charged": {
      // Each successful charge → invoice email. send-invoice is idempotent
      // by payment_id so retries on this event are safe.
      const payment = (rawEvent.payload as
        | { payment?: { entity?: { id?: string } } }
        | undefined)?.payment?.entity
      if (!payment?.id) return
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-invoice`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_id: payment.id,
          subscription_id: subscription.id,
        }),
      })
      return
    }

    case "subscription.halted": {
      const { subject, html } = subscriptionHaltedEmail({
        userEmail: recipient.email,
        userName: recipient.name ?? "",
        planLabel,
        appUrl: APP_URL,
      })
      await sendEmail({
        to: recipient.email,
        subject,
        html,
        tags: [
          { name: "type", value: "subscription_halted" },
          { name: "subscription_id", value: subscription.id },
        ],
      })
      return
    }

    case "subscription.cancelled": {
      const periodEnd = periodEndFromSubscription(subscription)
      const endsAtLabel = periodEnd
        ? new Date(periodEnd).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        : null
      const { subject, html } = subscriptionCancelledEmail({
        userEmail: recipient.email,
        userName: recipient.name ?? "",
        planLabel,
        endsAt: endsAtLabel,
        appUrl: APP_URL,
      })
      await sendEmail({
        to: recipient.email,
        subject,
        html,
        tags: [
          { name: "type", value: "subscription_cancelled" },
          { name: "subscription_id", value: subscription.id },
        ],
      })
      return
    }

    default:
      // Other events (e.g. subscription.pending, completed) are silent —
      // we already write read-only state; an email there would be noise.
      return
  }
}

async function resolveOwnerRecipient(
  sb: ReturnType<typeof createClient>,
  ownerRow: { user_id?: string | null; team_id?: string | null } | null,
): Promise<{ email: string; name: string | null } | null> {
  if (!ownerRow) return null
  if (ownerRow.user_id) {
    const { data } = await sb
      .from("users")
      .select("email, name")
      .eq("id", ownerRow.user_id)
      .maybeSingle()
    if (data?.email) return { email: data.email, name: data.name }
  }
  if (ownerRow.team_id) {
    const { data: team } = await sb
      .from("teams")
      .select("owner_id")
      .eq("id", ownerRow.team_id)
      .maybeSingle()
    if (team?.owner_id) {
      const { data: ownerUser } = await sb
        .from("users")
        .select("email, name")
        .eq("id", team.owner_id)
        .maybeSingle()
      if (ownerUser?.email) return { email: ownerUser.email, name: ownerUser.name }
    }
  }
  return null
}

// We piggy-back on the payment_events log to gate the activation email so we
// don't send it twice for a single subscription. A row tagged
// type="activation_email" with subscription_id acts as the sentinel.
async function checkActivatedAlreadySent(
  sb: ReturnType<typeof createClient>,
  subscriptionId: string,
): Promise<boolean> {
  const { data } = await sb
    .from("payment_events")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .eq("event_type", "klosure.activation_email")
    .limit(1)
  return !!(data && data.length > 0)
}

async function markActivatedSent(
  sb: ReturnType<typeof createClient>,
  subscriptionId: string,
) {
  // Insert a synthetic row. The (provider, event_id) unique constraint forces
  // us to vary event_id per insert — use the subscription id as the suffix.
  await sb.from("payment_events").insert({
    provider: "klosure",
    event_id: `activation_email:${subscriptionId}`,
    event_type: "klosure.activation_email",
    payload: { subscription_id: subscriptionId },
    signature: null,
    signature_verified: false,
    subscription_id: subscriptionId,
    processed_at: new Date().toISOString(),
  })
}
