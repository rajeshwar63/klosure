// =============================================================================
// Klosure.ai — Phase 4 (Week 9) "Stripe customer portal"
// =============================================================================
// Opens the Stripe-hosted billing portal so the user can update their card,
// cancel, or download invoices. We just create a portal session and return
// the URL — the actual UI lives on Stripe.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? ""
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
    const returnUrl = body?.return_url || ""

    const { data: profile } = await service
      .from("users")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle()
    const customerId = profile?.stripe_customer_id
    if (!customerId) return json({ error: "no stripe customer yet" }, 400)

    const params = new URLSearchParams()
    params.set("customer", customerId)
    params.set("return_url", returnUrl)

    const stripeRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    })
    const session = await stripeRes.json()
    if (!stripeRes.ok) return json({ error: "stripe error", detail: session }, 502)
    return json({ ok: true, url: session.url })
  } catch (err) {
    return json({ error: "stripe-portal crashed", detail: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}
