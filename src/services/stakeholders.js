// Phase 6.1 step 06 — derive last-contact for each stakeholder. v1 uses
// per-side attribution: the latest buyer message is "last spoke" for every
// buyer-side person, the latest seller message likewise. Per-person
// attribution on the buyer side is later work — buyer messages share a
// single deal-level identity today.

import { supabase } from '../lib/supabase.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function normalizeCompany(value) {
  return (value ?? '').trim().toLowerCase()
}

export function isBuyerPerson(person, deal) {
  if (!person || !deal) return false
  const personCompany = normalizeCompany(person.company)
  const buyerCompany = normalizeCompany(deal.buyer_company)
  if (!personCompany || !buyerCompany) return false
  return personCompany === buyerCompany
}

export async function loadLatestMessageBySide(dealId) {
  if (!dealId) return { buyer: null, seller: null }
  const { data, error } = await supabase
    .from('messages')
    .select('created_at, sender_type')
    .eq('deal_id', dealId)
    .in('sender_type', ['buyer', 'seller'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !data) return { buyer: null, seller: null }

  let buyer = null
  let seller = null
  for (const row of data) {
    if (row.sender_type === 'buyer' && !buyer) buyer = row.created_at
    if (row.sender_type === 'seller' && !seller) seller = row.created_at
    if (buyer && seller) break
  }
  return { buyer, seller }
}

export function formatLastContact(iso) {
  if (!iso) return 'No recent contact'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'No recent contact'
  const days = Math.floor((Date.now() - t) / MS_PER_DAY)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 7) return `${days} days ago`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  }
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}
