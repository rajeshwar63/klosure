// =============================================================================
// Billing service — Phase 4 (Stripe), Phase 12.3 (Razorpay)
// =============================================================================
// Phase 4 left behind a Stripe checkout/portal client below; it's unused
// since the Phase 12.1 BillingPage rewrite. Phase 12.3 replaces the upgrade
// flow with Razorpay (`startUpgrade`). The Stripe helpers stay until the
// stripe-* edge functions are decommissioned.
// =============================================================================

import { supabase } from '../lib/supabase.js'
import { getRazorpayPlanId } from '../lib/razorpay-plans.ts'

// --- Razorpay (Phase 12.3) -------------------------------------------------

export async function startUpgrade({ planSlug, currency }) {
  const razorpayPlanId = getRazorpayPlanId(planSlug, currency)
  if (!razorpayPlanId) {
    return { ok: false, error: 'unsupported_currency_for_plan' }
  }

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
    body: JSON.stringify({ plan_slug: planSlug, razorpay_plan_id: razorpayPlanId }),
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

// --- Stripe (Phase 4, retained but unused) ---------------------------------

export async function startCheckout({ plan, successUrl, cancelUrl }) {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: {
      plan,
      success_url: successUrl,
      cancel_url: cancelUrl,
    },
  })
  if (error) return { ok: false, error: error.message }
  if (!data?.url) return { ok: false, error: 'no checkout url' }
  return { ok: true, url: data.url }
}

export async function openCustomerPortal({ returnUrl }) {
  const { data, error } = await supabase.functions.invoke('stripe-portal', {
    body: { return_url: returnUrl },
  })
  if (error) return { ok: false, error: error.message }
  if (!data?.url) return { ok: false, error: 'no portal url' }
  return { ok: true, url: data.url }
}
