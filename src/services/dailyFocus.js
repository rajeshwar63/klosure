// Phase 5: client wrapper for the klo-daily-focus Edge Function. The function
// only serves the authenticated seller — passing the session bearer is enough
// authorization. Pass forceRefresh=true to bypass the server-side cache.

import { supabase } from '../lib/supabase.js'

export async function fetchDailyFocus(forceRefresh = false) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('not signed in')

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  if (!baseUrl) throw new Error('VITE_SUPABASE_URL not configured')

  const url = `${baseUrl}/functions/v1/klo-daily-focus${forceRefresh ? '?refresh=1' : ''}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Daily focus failed (${res.status})`)
  }
  return res.json()
}

// Phase 5.5 step 01: pulls a single headline sentence out of the full focus
// paragraph for the collapsed banner state. Strips markdown bold, takes the
// first sentence, and truncates at a word boundary if it's too long.
export function extractHeadline(focusText) {
  if (!focusText) return ''
  const clean = focusText.replace(/\*\*/g, '').trim()
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] ?? clean
  if (firstSentence.length <= 80) return firstSentence
  const truncated = firstSentence.slice(0, 80)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '…'
}
