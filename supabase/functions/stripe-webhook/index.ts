// =============================================================================
// Klosure.ai — Phase 4 (Week 9) "Stripe webhook"
// =============================================================================
// Receives Stripe lifecycle events and patches public.users / public.teams to
// reflect the live subscription state. We treat Stripe as the source of truth
// for plan + period_end and never write `users.plan` from anywhere else.
//
// Events we care about:
//   checkout.session.completed         — first purchase, link customer to user
//   customer.subscription.created      — initial subscription metadata
//   customer.subscription.updated      — plan change, renewal
//   customer.subscription.deleted      — cancelled, drop back to free
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET     whsec_…
//   STRIPE_PRICE_PRO          (used to detect which plan a sub belongs to)
//   STRIPE_PRICE_TEAM
//
// Deploy with --no-verify-jwt because Stripe doesn't send a Supabase JWT:
//   supabase functions deploy stripe-webhook --no-verify-jwt
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? ""
const STRIPE_PRICE_PRO = Deno.env.get("STRIPE_PRICE_PRO") ?? ""
const STRIPE_PRICE_TEAM = Deno.env.get("STRIPE_PRICE_TEAM") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "use POST" }), { status: 405 })
  }
  const sig = req.headers.get("stripe-signature") || ""
  const raw = await req.text()
  if (!STRIPE_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "no webhook secret" }), { status: 500 })
  }

  const verified = await verifyStripeSignature(raw, sig, STRIPE_WEBHOOK_SECRET)
  if (!verified) {
    return new Response(JSON.stringify({ error: "bad signature" }), { status: 400 })
  }

  const event = JSON.parse(raw)
  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(service, event.data.object)
        break
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(service, event.data.object)
        break
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(service, event.data.object)
        break
      default:
        // Acknowledge anything else without action.
        break
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})

async function handleCheckoutCompleted(service: ReturnType<typeof createClient>, session: Record<string, unknown>) {
  const userId = (session.client_reference_id as string) || ((session.metadata as { user_id?: string })?.user_id ?? "")
  const customerId = session.customer as string | null
  if (userId && customerId) {
    await service.from("users").update({ stripe_customer_id: customerId }).eq("id", userId)
  }
}

async function handleSubscriptionUpsert(service: ReturnType<typeof createClient>, sub: Record<string, unknown>) {
  const customerId = sub.customer as string
  const status = sub.status as string
  const items = (sub.items as { data?: Array<{ price?: { id?: string } }> })?.data ?? []
  const priceId = items[0]?.price?.id || ""
  const plan = priceId === STRIPE_PRICE_TEAM ? "team" : priceId === STRIPE_PRICE_PRO ? "pro" : "free"
  const currentPeriodEnd = sub.current_period_end
    ? new Date((sub.current_period_end as number) * 1000).toISOString()
    : null
  const subscriptionId = sub.id as string

  // Active states: 'trialing', 'active'. Anything else falls to free.
  const effectivePlan = status === "active" || status === "trialing" ? plan : "free"

  // Locate the user by stripe_customer_id.
  const { data: user } = await service
    .from("users")
    .select("id, team_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle()
  if (!user) return

  await service
    .from("users")
    .update({
      plan: effectivePlan,
      stripe_subscription_id: subscriptionId,
      current_period_end: currentPeriodEnd,
    })
    .eq("id", user.id)

  // Team plans cascade to the team row (if the user owns one).
  if (effectivePlan === "team") {
    const { data: team } = await service
      .from("teams")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle()
    if (team) {
      await service
        .from("teams")
        .update({
          plan: "team",
          stripe_subscription_id: subscriptionId,
          current_period_end: currentPeriodEnd,
        })
        .eq("id", team.id)
    }
  }
}

async function handleSubscriptionDeleted(service: ReturnType<typeof createClient>, sub: Record<string, unknown>) {
  const customerId = sub.customer as string
  const { data: user } = await service
    .from("users")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle()
  if (!user) return
  await service
    .from("users")
    .update({ plan: "free", stripe_subscription_id: null, current_period_end: null })
    .eq("id", user.id)
  await service
    .from("teams")
    .update({ plan: "free", stripe_subscription_id: null, current_period_end: null })
    .eq("owner_id", user.id)
}

// Stripe webhook signing — HMAC-SHA256 over `${timestamp}.${payload}` with the
// signing secret. We accept the first valid v1 sig from the comma-separated
// header. Reimplemented here to avoid a Stripe SDK dependency in the function.
async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",").reduce<Record<string, string[]>>((acc, kv) => {
    const [k, v] = kv.split("=")
    if (!k || !v) return acc
    acc[k] = acc[k] || []
    acc[k].push(v)
    return acc
  }, {})
  const t = parts["t"]?.[0]
  const sigs = parts["v1"] || []
  if (!t || sigs.length === 0) return false

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const data = enc.encode(`${t}.${payload}`)
  const sigBuf = await crypto.subtle.sign("HMAC", key, data)
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return sigs.some((s) => timingSafeEqual(s, expected))
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}
