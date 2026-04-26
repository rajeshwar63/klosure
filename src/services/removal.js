// Phase 4.5: client wrapper for the klo-removal Edge Function. The function
// only accepts seller JWTs (verified inside the function) — passing the
// session bearer is enough authorization.

import { supabase } from '../lib/supabase.js'

export async function requestRemoval({ dealId, kind, match, reason }) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('not signed in')

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  if (!baseUrl) throw new Error('VITE_SUPABASE_URL not configured')

  const res = await fetch(`${baseUrl}/functions/v1/klo-removal`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ deal_id: dealId, kind, match, reason }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Removal failed (${res.status})`)
  }
  return res.json()
}
