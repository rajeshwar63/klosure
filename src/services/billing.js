// =============================================================================
// Billing service — Phase 12.3 (Razorpay)
// =============================================================================
// Razorpay is the only payment provider. `startUpgrade` opens checkout,
// `verifySubscription` syncs paid state to Supabase right after the user
// authorises the mandate (closing the gap where the webhook is the only
// writer), and `cancelSubscription` schedules cancel-at-cycle-end.
// =============================================================================

import { supabase } from '../lib/supabase.js'
import { getRazorpayPlanId, getRazorpaySeatPlanId } from '../lib/razorpay-plans.ts'

export async function startUpgrade({ planSlug, currency, extraSeats = 0 }) {
  const razorpayPlanId = getRazorpayPlanId(planSlug, currency)
  if (!razorpayPlanId) {
    return { ok: false, error: 'unsupported_currency_for_plan' }
  }
  // Add-on subscription is only attempted when the buyer asked for >0 extras
  // *and* the per-seat plan id is configured for this (tier, currency). With
  // extras=0 we skip even sending the seat plan id, so the edge function
  // creates only the base subscription.
  const razorpaySeatPlanId =
    extraSeats > 0 ? getRazorpaySeatPlanId(planSlug, currency) : null

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) return { ok: false, error: 'not_signed_in' }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const res = await fetch(`${baseUrl}/functions/v1/razorpay-create-subscription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_slug: planSlug,
      razorpay_plan_id: razorpayPlanId,
      extra_seats: extraSeats,
      razorpay_seat_plan_id: razorpaySeatPlanId,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { ok: false, error: text || `request failed (${res.status})` }
  }
  return res.json()
}

// Called immediately after Razorpay checkout returns success. Server fetches
// the live subscription state from Razorpay and writes it via the same RPC
// the webhook uses — so the user is paid_active without waiting for the
// webhook to land.
export async function verifySubscription() {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) return { ok: false, error: 'not_signed_in' }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const res = await fetch(`${baseUrl}/functions/v1/razorpay-verify-subscription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const text = await res.text()
    return { ok: false, error: text || `request failed (${res.status})` }
  }
  return res.json()
}

// Schedules cancellation at cycle end. The webhook is what actually flips the
// user/team to read-only when subscription.cancelled fires (at period end);
// this just tells Razorpay to stop renewing.
export async function cancelSubscription() {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) return { ok: false, error: 'not_signed_in' }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const res = await fetch(`${baseUrl}/functions/v1/razorpay-cancel-subscription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const text = await res.text()
    return { ok: false, error: text || `request failed (${res.status})` }
  }
  return res.json()
}
