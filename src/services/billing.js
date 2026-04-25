// =============================================================================
// Billing service — Phase 4 (Week 9)
// =============================================================================
// Thin client over the `stripe-checkout` and `stripe-portal` edge functions.
// We don't ever call Stripe directly from the browser — secret keys live in
// Supabase secrets, and webhook updates flow through `stripe-webhook` which
// patches public.users.plan / public.teams.plan.
// =============================================================================

import { supabase } from '../lib/supabase.js'

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
