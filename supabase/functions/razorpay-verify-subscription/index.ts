// =============================================================================
// razorpay-verify-subscription — Phase 12.3 (Chunk 5)
// =============================================================================
// Authenticated POST that verifies the caller's Razorpay subscription against
// Razorpay's API and writes paid state to Supabase. Called by the frontend
// immediately after the Razorpay checkout modal returns success — closes the
// gap where the webhook is the only writer of paid state and a misconfigured
// webhook (URL, secret, --no-verify-jwt) leaves users stuck on trial despite
// having paid.
//
// The webhook remains the source of truth for renewals, halts, and
// cancellations; this function only handles the synchronous
// "user just authorised the mandate" case.
//
// Lookup precedence (mirrors razorpay-cancel-subscription):
//   1. user.razorpay_subscription_id   (solo plans)
//   2. owned team's razorpay_subscription_id  (team plans)
// We never accept a subscription_id from the client — derive from the JWT so
// a caller can't verify someone else's subscription.
//
// Deploy:
//   supabase functions deploy razorpay-verify-subscription
//
// Required Supabase secrets (already set in Chunk 2):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import {
  mapStatus,
  resolvePlanSlug,
  periodEndFromSubscription,
  type SubscriptionEntity,
} from "../_shared/razorpay.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? ""
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    // 1. Auth.
    const authHeader = req.headers.get("Authorization") ?? ""
    if (!authHeader.startsWith("Bearer ")) {
      return json({ ok: false, error: "not_authenticated" }, 401)
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return json({ ok: false, error: "not_authenticated" }, 401)
    }
    const userId = userData.user.id

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // 2. Locate the subscription belonging to this caller. User row first,
    //    then owned team — same precedence as razorpay-cancel-subscription.
    const { data: userRow } = await sb
      .from("users")
      .select("razorpay_subscription_id")
      .eq("id", userId)
      .maybeSingle()

    let subscriptionId: string | null = userRow?.razorpay_subscription_id ?? null

    if (!subscriptionId) {
      const { data: team } = await sb
        .from("teams")
        .select("razorpay_subscription_id")
        .eq("owner_id", userId)
        .maybeSingle()
      subscriptionId = team?.razorpay_subscription_id ?? null
    }

    if (!subscriptionId) {
      return json({ ok: false, error: "no_subscription" }, 404)
    }

    // 3. Fetch live state from Razorpay. This is the trust boundary — we
    //    don't take the user's word for "I paid", we ask Razorpay.
    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)
    const rzpRes = await fetch(
      `https://api.razorpay.com/v1/subscriptions/${subscriptionId}`,
      {
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
      },
    )
    const rzpText = await rzpRes.text()
    let subscription: SubscriptionEntity
    try {
      subscription = JSON.parse(rzpText)
    } catch {
      console.error("razorpay subscription fetch — bad json", rzpText)
      return json({ ok: false, error: "razorpay_bad_response" }, 502)
    }
    if (!rzpRes.ok) {
      console.error("razorpay subscription fetch failed", rzpRes.status, subscription)
      return json({ ok: false, error: "razorpay_fetch_failed", detail: subscription }, 502)
    }

    // 4. Translate. mapStatus returns null for unknown statuses (e.g. created,
    //    expired) — we ack without writing so the polling/webhook fallback
    //    can pick it up later.
    const status = mapStatus(subscription.status ?? "")
    if (!status) {
      return json({
        ok: true,
        ignored: `unknown_status:${subscription.status}`,
        subscription_id: subscriptionId,
      })
    }

    // Active/pending events MUST have a resolvable plan slug — otherwise the
    // RPC would no-op the plan column and we'd return ok:true while silently
    // failing to actually set the user to pro/team_*.
    const planSlug = resolvePlanSlug(subscription)
    if ((status === "active" || status === "pending") && !planSlug) {
      console.error("verify: unresolved plan", subscription.plan_id, subscription.notes)
      return json(
        { ok: false, error: "unresolved_plan", plan_id: subscription.plan_id ?? null },
        500,
      )
    }

    const periodEnd = periodEndFromSubscription(subscription)

    // 5. Write paid state via the same RPC the webhook calls. Idempotent —
    //    safe to race with a webhook for the same subscription.
    const { data: rpcResult, error: rpcErr } = await sb.rpc("update_subscription_state", {
      p_subscription_id: subscriptionId,
      p_plan_slug: planSlug || "",
      p_status: status,
      p_period_end: periodEnd,
    })

    if (rpcErr) {
      console.error("update_subscription_state failed", rpcErr)
      return json({ ok: false, error: "rpc_failed", detail: rpcErr.message }, 500)
    }

    const ok = (rpcResult as { ok?: boolean } | null)?.ok ?? false
    if (!ok) {
      // find_subscription_owner came up empty — the subscription_id we read
      // off the user/team row doesn't match either users or teams. Shouldn't
      // happen in normal flow, but log it.
      console.warn("verify: subscription_not_found", subscriptionId)
      return json({ ok: false, error: "subscription_not_found", subscription_id: subscriptionId }, 404)
    }

    // 6. Best-effort invoice email. We grab the most recent captured payment
    //    on the subscription and call send-invoice. Idempotency lives in the
    //    invoices_sent table, so a webhook firing the same payment_id later
    //    is a no-op. Failure here doesn't block the verify response — the
    //    user's account is already paid.
    let invoiceEmailed = false
    if (status === "active" || status === "pending") {
      try {
        const paymentId = await fetchLatestCapturedPaymentId(subscriptionId)
        if (paymentId) {
          const sendRes = await fetch(
            `${SUPABASE_URL}/functions/v1/send-invoice`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                payment_id: paymentId,
                subscription_id: subscriptionId,
              }),
            },
          )
          invoiceEmailed = sendRes.ok
        }
      } catch (err) {
        console.warn("verify: invoice email dispatch failed", err)
      }
    }

    return json({
      ok: true,
      subscription_id: subscriptionId,
      status,
      plan: planSlug,
      invoice_emailed: invoiceEmailed,
    })
  } catch (err) {
    console.error("razorpay-verify-subscription error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

// Fetch the latest captured payment on a subscription. Used to hand a
// payment_id to send-invoice when verifying right after checkout — the
// authorisation charge has fired by the time the user lands on /billing/return.
async function fetchLatestCapturedPaymentId(
  subscriptionId: string,
): Promise<string | null> {
  try {
    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)
    const res = await fetch(
      `https://api.razorpay.com/v1/subscriptions/${subscriptionId}/invoices?count=1`,
      { method: "GET", headers: { Authorization: `Basic ${auth}` } },
    )
    if (!res.ok) return null
    const body = (await res.json()) as {
      items?: Array<{ payment_id?: string | null; status?: string }>
    }
    const inv = body.items?.[0]
    return inv?.payment_id ?? null
  } catch (err) {
    console.warn("fetchLatestCapturedPaymentId error", err)
    return null
  }
}
