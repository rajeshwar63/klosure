// =============================================================================
// Dashboard service — Phase 4 (Week 7)
// =============================================================================
// Loads everything the seller dashboard needs in one round-trip and turns it
// into the shapes the page renders. The DealsListPage was Phase-1-thin (a
// flat list) — Phase 4 sorts by health and urgency, surfaces deal counts per
// row, and rolls up pipeline-level stats.
//
// Why aggregate client-side instead of a SQL view: Supabase RLS already scopes
// every row to the seller, the data set is small (a working seller has dozens
// of deals, not thousands), and keeping the math here lets us share helpers
// with the manager view (which reads many sellers at once).
// =============================================================================

import { supabase } from '../lib/supabase.js'
import { daysUntil } from '../lib/format.js'

// Phase 5: a deal "slips" when Klo's confidence dropped meaningfully on the
// last turn — these get an amber row background so the seller sees them first
// when scanning the list.
export function isSlipping(deal) {
  const c = deal?.klo_state?.confidence
  if (!c) return false
  return c.trend === 'down' && c.delta <= -10
}

// Sum of (deal_value * confidence/100) across active deals that have both.
// "Weighted pipeline" — Klo's read of how much money is realistically in play.
export function weightedPipeline(deals) {
  return deals
    .filter(
      (d) =>
        d.status === 'active' &&
        d.klo_state?.confidence &&
        d.klo_state?.deal_value,
    )
    .reduce(
      (sum, d) =>
        sum + (d.klo_state.deal_value.amount * d.klo_state.confidence.value) / 100,
      0,
    )
}

export function highConfidenceCount(deals) {
  return deals.filter(
    (d) => d.status === 'active' && (d.klo_state?.confidence?.value ?? 0) >= 60,
  ).length
}

export function activeCount(deals) {
  return deals.filter((d) => d.status === 'active').length
}

export function slippingCount(deals) {
  return deals.filter((d) => d.status === 'active' && isSlipping(d)).length
}

export async function loadSellerDashboard(sellerId) {
  if (!sellerId) return { deals: [], stats: emptyStats() }

  const dealRes = await supabase
    .from('deals')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })

  if (dealRes.error) {
    return { error: dealRes.error.message, deals: [], stats: emptyStats() }
  }

  const deals = dealRes.data ?? []

  const enriched = deals.map((d) => enrichDeal(d))
  const sorted = sortDeals(enriched)

  return {
    deals: sorted,
    stats: rollUpStats(sorted),
  }
}

// Grafted onto each deal so the row can show its urgency without further
// fetches. Pure read of already-loaded state.
export function enrichDeal(deal) {
  const days = daysUntil(deal.deadline)

  // Urgency score: lower is more urgent. Used as the secondary sort.
  let urgency = 9999
  if (days !== null && days < 0) urgency = days
  else if (days !== null) urgency = days

  return {
    ...deal,
    daysToDeadline: days,
    urgency,
    slipping: isSlipping(deal),
  }
}

export function sortDeals(deals) {
  const active = []
  const archived = []
  for (const d of deals) {
    if (d.status === 'active') active.push(d)
    else archived.push(d)
  }

  // Phase 5: confidence is the primary order. Highest-confidence deals first;
  // deals without a confidence yet (no Klo turn since Phase 5 deployed) sink
  // to the bottom of the active list. Ties break on most-recent activity so
  // freshly-touched deals stay near the top.
  active.sort((a, b) => {
    const ac = a.klo_state?.confidence?.value ?? -1
    const bc = b.klo_state?.confidence?.value ?? -1
    if (ac !== bc) return bc - ac
    const at = new Date(a.updated_at || a.created_at)
    const bt = new Date(b.updated_at || b.created_at)
    return bt - at
  })

  archived.sort((a, b) => {
    const at = new Date(a.archived_at || a.created_at)
    const bt = new Date(b.archived_at || b.created_at)
    return bt - at
  })

  return { active, archived }
}

function emptyStats() {
  return {
    activeCount: 0,
    archivedCount: 0,
    redCount: 0,
    amberCount: 0,
    greenCount: 0,
    pipelineValue: 0,
    valueAtRisk: 0,
    wonCount: 0,
    lostCount: 0,
    weightedPipeline: 0,
    highConfidenceCount: 0,
    slippingCount: 0,
  }
}

function rollUpStats({ active, archived }) {
  const stats = emptyStats()
  for (const d of active) {
    stats.activeCount += 1
    if (d.health === 'red') stats.redCount += 1
    else if (d.health === 'amber') stats.amberCount += 1
    else stats.greenCount += 1
    const v = Number(d.value) || 0
    stats.pipelineValue += v
    if (d.health === 'red') stats.valueAtRisk += v

    const confidence = d.klo_state?.confidence?.value
    const dealAmount = d.klo_state?.deal_value?.amount ?? v
    if (confidence != null && dealAmount) {
      stats.weightedPipeline += (dealAmount * confidence) / 100
    }
    if ((confidence ?? 0) >= 60) stats.highConfidenceCount += 1
    if (d.slipping) stats.slippingCount += 1
  }
  for (const d of archived) {
    stats.archivedCount += 1
    if (d.status === 'won') stats.wonCount += 1
    else if (d.status === 'lost') stats.lostCount += 1
  }
  return stats
}
