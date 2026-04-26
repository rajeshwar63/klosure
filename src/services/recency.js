// Phase 6.1 step 07 — recency signals for the deal page header strip.
// Buyer last spoke, seller last sent, and last meeting (if Klo has
// extracted one). Silence is the story on stuck deals.

import { supabase } from '../lib/supabase.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function formatAgoCompact(iso) {
  if (!iso) return 'never'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'never'
  const days = Math.floor((Date.now() - t) / MS_PER_DAY)
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function daysSince(iso) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / MS_PER_DAY)
}

export async function computeRecency(dealId, klo_state) {
  if (!dealId) {
    return {
      buyerLastSpoke: 'never',
      sellerLastSent: 'never',
      lastMeeting: 'never',
      buyerSilenceDays: null,
    }
  }

  const { data, error } = await supabase
    .from('messages')
    .select('created_at, sender_type')
    .eq('deal_id', dealId)
    .in('sender_type', ['buyer', 'seller'])
    .order('created_at', { ascending: false })
    .limit(50)

  let buyerISO = null
  let sellerISO = null
  if (!error && data) {
    for (const row of data) {
      if (row.sender_type === 'buyer' && !buyerISO) buyerISO = row.created_at
      if (row.sender_type === 'seller' && !sellerISO) sellerISO = row.created_at
      if (buyerISO && sellerISO) break
    }
  }

  const lastMeetingISO = klo_state?.last_meeting?.date ?? null

  return {
    buyerLastSpoke: formatAgoCompact(buyerISO),
    sellerLastSent: formatAgoCompact(sellerISO),
    lastMeeting: lastMeetingISO ? formatAgoCompact(lastMeetingISO) : 'never',
    buyerSilenceDays: daysSince(buyerISO),
  }
}
