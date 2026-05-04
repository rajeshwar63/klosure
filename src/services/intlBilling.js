// =============================================================================
// International billing concierge — Phase A sprint 09
// =============================================================================
// USD / AED visitors can't auto-debit through Razorpay until international
// card processing activates (ticket #18895606). This service captures their
// intent into a Supabase `intl_billing_leads` row and notifies the founder
// so a manual Razorpay payment link can be sent within 24 hours.
//
// The edge function `intl-billing-lead` does the DB insert + Resend email.
// =============================================================================

import { supabase } from '../lib/supabase.js'

export async function requestIntlBillingLead({
  email,
  planSlug,
  currency,
  seats = 1,
  notes = '',
}) {
  if (!email) return { ok: false, error: 'email_required' }
  if (!planSlug) return { ok: false, error: 'plan_required' }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  // Anonymous submissions are allowed (lead capture happens before signup
  // sometimes). The edge function uses the anon key for unauth'd inserts and
  // the user JWT for authenticated ones.

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const res = await fetch(`${baseUrl}/functions/v1/intl-billing-lead`, {
    method: 'POST',
    headers: {
      Authorization: token
        ? `Bearer ${token}`
        : `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      plan_slug: planSlug,
      currency,
      seats: Math.max(1, Math.min(500, Math.floor(Number(seats) || 1))),
      notes: notes.slice(0, 1000),
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { ok: false, error: text || `request failed (${res.status})` }
  }
  return res.json()
}
