// =============================================================================
// razorpay-update-subscription — Phase A sprint 09
// =============================================================================
// Adds or removes seats on the team's active Razorpay subscription.
//
//   - Add seats (new_qty > current_qty): apply IMMEDIATELY via Razorpay's
//     Update Subscription API with `schedule_change_at: 'now'`. Razorpay
//     prorates the additional seats for the remainder of the current cycle
//     and bills on the next renewal.
//
//   - Remove seats (new_qty < current_qty): industry standard — schedule the
//     change at the END of the current billing cycle. We persist the target
//     count to teams.pending_seat_cap so the UI can surface "you'll drop to N
//     seats on <date>" without contacting Razorpay each time. The webhook
//     applies pending_seat_cap → seat_cap when subscription.charged fires
//     for the new cycle.
//
// Only team owners (admin) may call this. Permission check is enforced via
// the team_members.role column.
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

    // 2. Parse + validate.
    const body = await req.json().catch(() => ({}))
    const requested = Number(body.seat_count ?? 0)
    if (!Number.isFinite(requested) || requested < 1 || requested > 200) {
      return json({ ok: false, error: "invalid_seat_count" }, 400)
    }
    const targetSeats = Math.floor(requested)

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // 3. Resolve user's team and verify they're the team owner.
    const { data: userRow } = await sb
      .from("users").select("id, team_id").eq("id", userId).maybeSingle()
    if (!userRow?.team_id) {
      return json({ ok: false, error: "no_team" }, 400)
    }
    const teamId = userRow.team_id as string

    // Seat changes require manager-level access. Klosure uses 'manager' /
    // 'seller' roles on team_members; only managers can alter the
    // subscription. (Older deployments may use 'owner' / 'admin' — both are
    // accepted for forward-compat.)
    const { data: membership } = await sb
      .from("team_members")
      .select("role").eq("team_id", teamId).eq("user_id", userId).maybeSingle()
    const role = membership?.role ?? ""
    const canManage = role === "manager" || role === "owner" || role === "admin"
    if (!canManage) {
      return json({ ok: false, error: "not_team_manager" }, 403)
    }

    const { data: team } = await sb
      .from("teams").select("*").eq("id", teamId).maybeSingle()
    if (!team) {
      return json({ ok: false, error: "team_not_found" }, 404)
    }
    const subscriptionId: string | null = team.razorpay_subscription_id ?? null
    if (!subscriptionId) {
      return json({ ok: false, error: "no_active_subscription" }, 400)
    }
    const currentSeats: number = team.seat_cap ?? 1

    // No-op: requested matches current AND no scheduled downsize pending.
    if (targetSeats === currentSeats && team.pending_seat_cap == null) {
      return json({ ok: true, seat_cap: currentSeats, change: "noop" })
    }

    // 4a. Reduction below current head-count is forbidden — admin must remove
    // members first. Defense-in-depth (the UI also blocks).
    if (targetSeats < currentSeats) {
      const { count: memberCount } = await sb
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .eq("team_id", teamId)
      if ((memberCount ?? 0) > targetSeats) {
        return json(
          { ok: false, error: "seats_below_member_count", member_count: memberCount },
          400,
        )
      }
    }

    // 4b. Apply the change.
    if (targetSeats > currentSeats) {
      // Increase — apply immediately. Razorpay prorates the new seats.
      const updateRes = await rzpFetch(
        `/subscriptions/${subscriptionId}`,
        "PATCH",
        { quantity: targetSeats, schedule_change_at: "now" },
      )
      if (updateRes.status !== 200) {
        console.error("razorpay update (increase) failed", updateRes)
        return json(
          { ok: false, error: "razorpay_update_failed", detail: updateRes.body },
          500,
        )
      }
      await sb.from("teams").update({
        seat_cap: targetSeats,
        pending_seat_cap: null,
      }).eq("id", teamId)
      return json({ ok: true, seat_cap: targetSeats, change: "increased_immediately" })
    } else {
      // Decrease — schedule at cycle end. seat_cap stays at currentSeats so
      // the team keeps full capacity for the rest of the cycle they paid for.
      const updateRes = await rzpFetch(
        `/subscriptions/${subscriptionId}`,
        "PATCH",
        { quantity: targetSeats, schedule_change_at: "cycle_end" },
      )
      if (updateRes.status !== 200) {
        console.error("razorpay update (decrease) failed", updateRes)
        return json(
          { ok: false, error: "razorpay_update_failed", detail: updateRes.body },
          500,
        )
      }
      await sb.from("teams").update({
        pending_seat_cap: targetSeats,
      }).eq("id", teamId)
      return json({
        ok: true,
        seat_cap: currentSeats,
        pending_seat_cap: targetSeats,
        change: "decrease_scheduled_at_cycle_end",
      })
    }
  } catch (err) {
    console.error("razorpay-update-subscription error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

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
