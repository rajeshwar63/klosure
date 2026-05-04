// =============================================================================
// Billing service — Phase 12.3 (Razorpay)
// =============================================================================
// Razorpay is the only payment provider. `startUpgrade` opens checkout,
// `verifySubscription` syncs paid state to Supabase right after the user
// authorises the mandate (closing the gap where the webhook is the only
// writer), and `cancelSubscription` schedules cancel-at-cycle-end.
// =============================================================================

import { supabase } from '../lib/supabase.js'
import { getRazorpayPlanId } from '../lib/razorpay-plans.ts'

export async function startUpgrade({ planSlug, currency, seatCount = 1 }) {
  const razorpayPlanId = getRazorpayPlanId(planSlug, currency)
  if (!razorpayPlanId) {
    return { ok: false, error: 'unsupported_currency_for_plan' }
  }
  const seats = Math.max(1, Math.min(200, Math.floor(Number(seatCount) || 1)))

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
      seat_count: seats,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { ok: false, error: text || `request failed (${res.status})` }
  }
  return res.json()
}

// Update subscription quantity (add or remove seats). Add-seats applies
// immediately and creates a prorated addon for the remaining days; remove-
// seats schedules at next cycle (industry standard, no mid-cycle refund).
export async function updateSubscriptionSeats({ seatCount }) {
  const seats = Math.max(1, Math.min(200, Math.floor(Number(seatCount) || 1)))
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) return { ok: false, error: 'not_signed_in' }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const res = await fetch(`${baseUrl}/functions/v1/razorpay-update-subscription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ seat_count: seats }),
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
