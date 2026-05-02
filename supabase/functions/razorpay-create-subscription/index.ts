// =============================================================================
// razorpay-create-subscription — Phase 12.3
// =============================================================================
// Called by frontend when user clicks "Upgrade" on a paid plan card.
// 1. Verifies user is authenticated.
// 2. Cancels any existing active subscription (plan switch).
// 3. Creates a Razorpay customer if user doesn't have one yet.
// 4. Creates a Razorpay subscription on the requested plan.
// 5. Stores subscription_id on user (or team if team plan).
// 6. Returns the short_url for frontend to redirect/popup.
//
// NOTE: This function does NOT mark the user as paid. The webhook handler
// does that when subscription.activated arrives. The frontend should re-fetch
// account status after the user returns from Razorpay.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? ""
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? ""
// Optional Razorpay Offer applied to every new subscription while the launch
// promo is running. Configure the offer in the Razorpay dashboard (e.g. 30%
// off) and set the resulting offer_id here. Empty/unset = no offer attached.
const RAZORPAY_LAUNCH_OFFER_ID = Deno.env.get("RAZORPAY_LAUNCH_OFFER_ID") ?? ""

// Phase A sprint 08: pricing collapsed to one plan. Every paid checkout is a
// team plan; we auto-create a single-seat team for solo users via the
// ensure_team_for_user RPC.
const PAID_PLANS = new Set(["klosure"])

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    // 1. Auth: extract user from JWT.
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
    const userEmail = userData.user.email ?? ""

    // 2. Parse request body.
    const body = await req.json().catch(() => ({}))
    const planSlug = String(body.plan_slug ?? "")
    const razorpayPlanId = String(body.razorpay_plan_id ?? "")
    if (!planSlug || !razorpayPlanId) {
      return json({ ok: false, error: "missing_plan" }, 400)
    }
    if (!razorpayPlanId.startsWith("plan_")) {
      return json({ ok: false, error: "invalid_plan_id" }, 400)
    }

    if (!PAID_PLANS.has(planSlug)) {
      return json({ ok: false, error: "invalid_plan_for_checkout" }, 400)
    }
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Pull the user record up-front for name/phone.
    const { data: userRow } = await sb.from("users").select("*").eq("id", userId).maybeSingle()
    if (!userRow) {
      return json({ ok: false, error: "user_not_found" }, 404)
    }
    const userName = userRow.name ?? ""
    const userPhone = (userRow.phone ?? null) as string | null

    // Phase A sprint 08: ensure the user has a team (auto-creates if missing).
    const { data: ensuredTeamId, error: teamErr } = await sb.rpc("ensure_team_for_user", {
      p_user_id: userId,
    })
    if (teamErr || !ensuredTeamId) {
      console.error("ensure_team_for_user failed", teamErr)
      return json(
        { ok: false, error: "team_setup_failed", detail: teamErr?.message },
        500,
      )
    }
    const teamId: string = ensuredTeamId as string

    const { data: team } = await sb.from("teams").select("*").eq("id", teamId).maybeSingle()
    let existingSubscriptionId: string | null = team?.razorpay_subscription_id ?? null
    let razorpayCustomerId: string | null = team?.razorpay_customer_id ?? null
    const isTeamPlan = true

    // 4. Cancel existing active subscription (plan switch case).
    if (existingSubscriptionId) {
      try {
        const cancelRes = await rzpFetch(
          `/subscriptions/${existingSubscriptionId}/cancel`,
          "POST",
          { cancel_at_cycle_end: 0 },
        )
        console.log("cancelled prev sub", existingSubscriptionId, cancelRes.status)
      } catch (err) {
        // Log but don't fail — the subscription may already be in a terminal state.
        console.warn("cancel prev sub failed", err)
      }
    }

    // 5. Create or reuse Razorpay customer.
    if (!razorpayCustomerId) {
      const custRes = await rzpFetch("/customers", "POST", {
        name: userName || userEmail,
        email: userEmail,
        contact: userPhone || undefined,
        // Razorpay expects fail_existing as a STRING. Numeric 0 is silently
        // ignored, falling back to the default (1 = throw "Customer already
        // exists"). With "0" the API returns the existing customer instead.
        fail_existing: "0",
      })
      if (custRes.status === 200 || custRes.status === 201) {
        razorpayCustomerId = custRes.body.id
        // Persist customer_id NOW, before we try the subscription. If the
        // subscription create fails further down, we don't want to orphan
        // the customer (Razorpay won't let us recreate by email anyway).
        if (isTeamPlan && teamId) {
          await sb.from("teams")
            .update({ razorpay_customer_id: razorpayCustomerId })
            .eq("id", teamId)
        } else {
          await sb.from("users")
            .update({ razorpay_customer_id: razorpayCustomerId })
            .eq("id", userId)
        }
      } else {
        console.error("create customer failed", custRes)
        return json({ ok: false, error: "razorpay_customer_failed", detail: custRes.body }, 500)
      }
    }

    // 6. Create the subscription.
    const subRes = await rzpFetch("/subscriptions", "POST", {
      plan_id: razorpayPlanId,
      customer_id: razorpayCustomerId,
      total_count: 60,           // 5 years of monthly cycles; user can cancel anytime
      customer_notify: 1,
      // Razorpay validates offer_id only when present, so omit the key
      // entirely when the launch offer isn't configured.
      ...(RAZORPAY_LAUNCH_OFFER_ID ? { offer_id: RAZORPAY_LAUNCH_OFFER_ID } : {}),
      notes: {
        klosure_user_id: userId,
        klosure_team_id: teamId ?? "",
        klosure_plan_slug: planSlug,
      },
    })
    if (subRes.status !== 200 && subRes.status !== 201) {
      console.error("create subscription failed", subRes)
      return json({ ok: false, error: "razorpay_subscription_failed", detail: subRes.body }, 500)
    }
    const subscription = subRes.body
    const subscriptionId: string = subscription.id
    const shortUrl: string = subscription.short_url

    // 7. Store subscription_id + customer_id on user/team.
    if (isTeamPlan && teamId) {
      await sb.from("teams").update({
        razorpay_customer_id: razorpayCustomerId,
        razorpay_subscription_id: subscriptionId,
      }).eq("id", teamId)
    } else {
      await sb.from("users").update({
        razorpay_customer_id: razorpayCustomerId,
        razorpay_subscription_id: subscriptionId,
      }).eq("id", userId)
    }

    return json({
      ok: true,
      subscription_id: subscriptionId,
      short_url: shortUrl,
      key_id: RAZORPAY_KEY_ID,    // for client-side checkout SDK if used
    })
  } catch (err) {
    console.error("razorpay-create-subscription error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

// --- Razorpay HTTP helper ---------------------------------------------------
async function rzpFetch(path: string, method: string, body?: unknown) {
  const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  // deno-lint-ignore no-explicit-any
  let parsed: any
  try { parsed = JSON.parse(text) } catch { parsed = { raw: text } }
  return { status: res.status, body: parsed }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}
