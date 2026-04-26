// =============================================================================
// Team forecast service — Phase 5 (manager view)
// =============================================================================
// Pure aggregation over already-loaded team deals: bucket by Klo's confidence
// (Likely close / In play / Long shots), compute weighted dollar amounts, and
// roll up by rep with a "strong / at_risk / silent" flag.
//
// Loading is split out so callers that already have the team's deals (e.g. the
// existing manager Team page) don't need to re-fetch — pass deals + members.
// =============================================================================

import { supabase } from '../lib/supabase.js'

const SILENT_DAYS = 5

// ----- Buckets --------------------------------------------------------------
export function bucketDeals(deals) {
  const active = deals.filter((d) => d.status === 'active')

  const buckets = {
    likely: { deals: [], total: 0, weighted: 0 },
    in_play: { deals: [], total: 0, weighted: 0 },
    long_shot: { deals: [], total: 0, weighted: 0 },
  }

  for (const deal of active) {
    const value = deal.klo_state?.deal_value?.amount ?? deal.value ?? 0
    const confidence = deal.klo_state?.confidence?.value
    const weighted = confidence != null ? Math.round((value * confidence) / 100) : 0

    let key
    if (confidence == null) key = 'long_shot'
    else if (confidence >= 65) key = 'likely'
    else if (confidence >= 30) key = 'in_play'
    else key = 'long_shot'

    buckets[key].deals.push(deal)
    buckets[key].total += value
    buckets[key].weighted += weighted
  }

  return buckets
}

// Conservative: only the likely-close bucket weighted.
export function computeQuarterCommit(buckets) {
  return buckets.likely.weighted
}

// Stretch: likely weighted + 60% of in-play weighted (treat in-play as roughly
// half-likely on average, slightly biased toward upside).
export function computeQuarterStretch(buckets) {
  return buckets.likely.weighted + Math.round(buckets.in_play.weighted * 0.6)
}

// ----- By-rep rollup --------------------------------------------------------
export function rollupByRep(deals, members) {
  const reps = new Map()

  for (const member of members) {
    reps.set(member.user_id, {
      user_id: member.user_id,
      name: member.users?.name || member.users?.email || 'Member',
      role: member.role,
      active_count: 0,
      slipping_count: 0,
      silent_count: 0,
      weighted: 0,
      flag: null,
    })
  }

  const now = Date.now()
  for (const deal of deals) {
    if (deal.status !== 'active') continue
    const rep = reps.get(deal.seller_id)
    if (!rep) continue

    rep.active_count += 1

    const confidence = deal.klo_state?.confidence
    const value = deal.klo_state?.deal_value?.amount ?? deal.value ?? 0
    if (confidence?.value != null) {
      rep.weighted += Math.round((value * confidence.value) / 100)
    }

    if (confidence?.trend === 'down' && (confidence?.delta ?? 0) <= -10) {
      rep.slipping_count += 1
    }

    const lastMsgAt = deal.last_message_at
    if (lastMsgAt) {
      const days = (now - new Date(lastMsgAt).getTime()) / (24 * 3.6e6)
      if (days >= SILENT_DAYS) rep.silent_count += 1
    }
  }

  for (const rep of reps.values()) {
    if (rep.slipping_count > 0) rep.flag = 'at_risk'
    else if (rep.silent_count > 0) rep.flag = 'silent'
    else if (rep.active_count > 0 && rep.weighted >= rep.active_count * 30000) {
      rep.flag = 'strong'
    }
  }

  return Array.from(reps.values()).sort((a, b) => b.weighted - a.weighted)
}

// ----- Loader ---------------------------------------------------------------
// Loads the team's active deals and members, attaches each deal's most recent
// message timestamp so silent-rep detection works. RLS already restricts the
// reads to teams the caller manages.
export async function getTeamForecast(teamId) {
  if (!teamId) return { deals: [], members: [] }

  const { data: members, error: memberErr } = await supabase
    .from('team_members')
    .select('id, user_id, role, users:users(id, name, email)')
    .eq('team_id', teamId)
  if (memberErr) return { error: memberErr.message, deals: [], members: [] }

  const memberIds = (members ?? []).map((m) => m.user_id)
  if (memberIds.length === 0) return { deals: [], members: members ?? [] }

  const { data: deals, error: dealErr } = await supabase
    .from('deals')
    .select('*')
    .in('seller_id', memberIds)
    .eq('status', 'active')
  if (dealErr) return { error: dealErr.message, deals: [], members: members ?? [] }

  const dealIds = (deals ?? []).map((d) => d.id)
  const lastByDeal = await fetchLastMessageByDeal(dealIds)

  const enriched = (deals ?? []).map((d) => ({
    ...d,
    last_message_at: lastByDeal.get(d.id) ?? null,
  }))

  return { deals: enriched, members: members ?? [] }
}

async function fetchLastMessageByDeal(dealIds) {
  const map = new Map()
  if (!dealIds || dealIds.length === 0) return map

  const { data, error } = await supabase
    .from('messages')
    .select('deal_id, created_at')
    .in('deal_id', dealIds)
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('[teamForecast] last-message lookup failed', error.message)
    return map
  }
  for (const row of data ?? []) {
    if (!map.has(row.deal_id)) map.set(row.deal_id, row.created_at)
  }
  return map
}
