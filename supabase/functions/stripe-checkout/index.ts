// =============================================================================
// Klosure.ai — Phase 4 (Week 9) "Stripe checkout"
// =============================================================================
// Creates a Stripe Checkout Session for a Pro or Team subscription. Called
// from /billing in the client. The webhook function (`stripe-webhook`) is the
// thing that actually flips users.plan / teams.plan after payment succeeds —
// this function only opens the hosted checkout page.
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY            sk_live_… (or sk_test_… in dev)
//   STRIPE_PRICE_PRO             price_…   (Pro recurring price ID)
//   STRIPE_PRICE_TEAM            price_…   (Team recurring price ID)
//
// Deploy:
//   supabase functions deploy stripe-checkout
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? ""
const STRIPE_PRICE_PRO = Deno.env.get("STRIPE_PRICE_PRO") ?? ""
const STRIPE_PRICE_TEAM = Deno.env.get("STRIPE_PRICE_TEAM") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "use POST" }, 405)

  try {
    if (!STRIPE_SECRET_KEY) return json({ error: "STRIPE_SECRET_KEY not set" }, 500)

    const auth = req.headers.get("Authorization")
    if (!auth) return json({ error: "auth required" }, 401)

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    })
    const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: "not signed in" }, 401)

    const body = await req.json().catch(() => ({}))
    const plan = body?.plan
    const successUrl = body?.success_url || ""
    const cancelUrl = body?.cancel_url || ""
    if (!["pro", "team"].includes(plan)) return json({ error: "plan must be pro or team" }, 400)

    const priceId = plan === "pro" ? STRIPE_PRICE_PRO : STRIPE_PRICE_TEAM
    if (!priceId) return json({ error: `STRIPE_PRICE_${plan.toUpperCase()} not set` }, 500)

    // Re-use a Stripe customer if one exists. Otherwise let Checkout make one.
    const { data: profile } = await service
      .from("users")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .maybeSingle()
    const customerId = profile?.stripe_customer_id || ""
    const email = profile?.email || user.email || ""

    const params = new URLSearchParams()
    params.set("mode", "subscription")
    params.set("line_items[0][price]", priceId)
    params.set("line_items[0][quantity]", "1")
    params.set("success_url", successUrl)
    params.set("cancel_url", cancelUrl)
    params.set("client_reference_id", user.id)
    params.set("metadata[user_id]", user.id)
    params.set("metadata[plan]", plan)
    if (customerId) {
      params.set("customer", customerId)
    } else if (email) {
      params.set("customer_email", email)
    }
    params.set("allow_promotion_codes", "true")
    params.set("subscription_data[metadata][user_id]", user.id)
    params.set("subscription_data[metadata][plan]", plan)

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    })
    const session = await stripeRes.json()
    if (!stripeRes.ok) {
      return json({ error: "stripe error", detail: session }, 502)
    }

    return json({ ok: true, url: session.url, id: session.id })
  } catch (err) {
    return json({ error: "stripe-checkout crashed", detail: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}
