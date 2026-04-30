// =============================================================================
// Email service — client-side helpers for transactional emails
// =============================================================================
// All sending happens in Supabase edge functions; this module is just the
// thin authenticated-fetch wrapper. Each helper is fire-and-forget by
// default — callers should not block the UI on email delivery.
// =============================================================================

import { supabase } from '../lib/supabase.js'

async function callEdge(fnName, body) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) return { ok: false, error: 'not_signed_in' }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  let res
  try {
    res = await fetch(`${baseUrl}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
    })
  } catch (err) {
    return { ok: false, error: err?.message || 'network_error' }
  }

  let parsed = null
  try {
    parsed = await res.json()
  } catch {
    parsed = null
  }

  if (!res.ok) {
    return {
      ok: false,
      error: parsed?.error || `request_failed_${res.status}`,
      detail: parsed?.detail,
    }
  }
  return { ok: true, ...parsed }
}

// Triggered immediately after signup. The edge function gates on
// users.welcome_email_sent_at so multiple calls are safe.
export async function sendWelcomeEmail() {
  return callEdge('send-welcome-email', {})
}

// Sends the buyer the deal-room link by email. The seller can attach a short
// message that ships in the body.
export async function shareDealWithBuyerByEmail({ dealId, buyerEmail, message }) {
  if (!dealId || !buyerEmail) {
    return { ok: false, error: 'missing_fields' }
  }
  return callEdge('send-buyer-share', {
    deal_id: dealId,
    buyer_email: buyerEmail,
    message: message || '',
  })
}
