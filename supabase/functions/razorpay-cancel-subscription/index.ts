// =============================================================================
// razorpay-cancel-subscription — Phase 12.3 (Chunk 4)
// =============================================================================
// Authenticated POST that cancels the caller's active Razorpay subscription
// AT CYCLE END — so the user keeps paid access until current_period_end and
// then transitions to read-only when Razorpay fires subscription.cancelled
// (the webhook does the read-only flip; this function only schedules).
//
// Lookup precedence:
//   1. user.razorpay_subscription_id  (solo plans live here)
//   2. owned team's razorpay_subscription_id (team plans live on the team)
// We try users first because solo subs are way more common, and the user row
// is already cached by the time we get here.
//
// Deploy:
//   supabase functions deploy razorpay-cancel-subscription
//
// Required Supabase secrets (already set in Chunk 2):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

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

    // 2. Locate the active subscription. User row first, then owned team.
    const { data: userRow } = await sb
      .from("users")
      .select("razorpay_subscription_id, team_id")
      .eq("id", userId)
      .maybeSingle()

    let subscriptionId: string | null = userRow?.razorpay_subscription_id ?? null
    let isTeamSub = false

    if (!subscriptionId) {
      // No solo sub — check whether they own a team that has one. We use
      // owner_id rather than the user's team_id because a non-owner team
      // member shouldn't be able to cancel the team's subscription.
      const { data: team } = await sb
        .from("teams")
        .select("razorpay_subscription_id")
        .eq("owner_id", userId)
        .maybeSingle()
      subscriptionId = team?.razorpay_subscription_id ?? null
      isTeamSub = !!subscriptionId
    }

    if (!subscriptionId) {
      return json({ ok: false, error: "no_active_subscription" }, 404)
    }

    // 3. Schedule cancellation at cycle end so the user keeps paid access for
    //    the remainder of the current period. cancel_at_cycle_end MUST be 1
    //    (numeric) per Razorpay's API; "1" as string also works but the
    //    docs example is numeric.
    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)
    const rzpRes = await fetch(
      `https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cancel_at_cycle_end: 1 }),
      },
    )
    const rzpText = await rzpRes.text()
    let rzpBody: Record<string, unknown> = {}
    try { rzpBody = JSON.parse(rzpText) } catch { rzpBody = { raw: rzpText } }

    if (!rzpRes.ok) {
      console.error("razorpay cancel failed", rzpRes.status, rzpBody)
      return json(
        { ok: false, error: "razorpay_cancel_failed", detail: rzpBody },
        502,
      )
    }

    // We don't update users/teams here — the webhook is the single writer of
    // paid state. Razorpay will fire subscription.cancelled at cycle end,
    // and update_subscription_state flips read_only_since then.
    //
    // For UX, surface the scheduled end timestamp the client can render
    // ("access until <date>"). Razorpay returns it as `current_end` (or
    // `end_at` if the sub already had an end date). Both are unix seconds.
    const currentEnd = (rzpBody as { current_end?: number }).current_end
    const endAt = (rzpBody as { end_at?: number }).end_at
    const scheduledEnd = currentEnd ?? endAt ?? null

    return json({
      ok: true,
      subscription_id: subscriptionId,
      is_team: isTeamSub,
      scheduled_end: scheduledEnd
        ? new Date(scheduledEnd * 1000).toISOString()
        : null,
      status: (rzpBody as { status?: string }).status ?? null,
    })
  } catch (err) {
    console.error("razorpay-cancel-subscription error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}
