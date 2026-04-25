// =============================================================================
// Dashboard service — Phase 4 (Week 7)
// =============================================================================
// Loads everything the seller dashboard needs in one round-trip and turns it
// into the shapes the page renders. The DealsListPage was Phase-1-thin (a
// flat list) — Phase 4 sorts by health and urgency, surfaces commitment
// counts per row, and rolls up pipeline-level stats.
//
// Why aggregate client-side instead of a SQL view: Supabase RLS already scopes
// every row to the seller, the data set is small (a working seller has dozens
// of deals, not thousands), and keeping the math here lets us share helpers
// with the manager view (which reads many sellers at once).
// =============================================================================

import { supabase } from '../lib/supabase.js'
import { daysUntil } from '../lib/format.js'

const HEALTH_RANK = { red: 0, amber: 1, green: 2 }

export async function loadSellerDashboard(sellerId) {
  if (!sellerId) return { deals: [], stats: emptyStats() }

  const [dealRes, commitRes] = await Promise.all([
    supabase
      .from('deals')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false }),
    // commitments only for that seller's deals — RLS handles the join.
    supabase.from('commitments').select('id, deal_id, status, due_date, task'),
  ])

  if (dealRes.error) {
    return { error: dealRes.error.message, deals: [], stats: emptyStats() }
  }

  const deals = dealRes.data ?? []
  const commitments = commitRes.data ?? []

  const enriched = deals.map((d) => enrichDeal(d, commitments))
  const sorted = sortDeals(enriched)

  return {
    deals: sorted,
    stats: rollUpStats(sorted),
  }
}

// Grafted onto each deal so the row can show "3 overdue · proposal due in 4d"
// without further fetches. Pure read of already-loaded state.
export function enrichDeal(deal, allCommitments) {
  const own = allCommitments.filter((c) => c.deal_id === deal.id)
  const overdue = own.filter((c) => c.status === 'overdue')
  const open = own.filter((c) => c.status === 'confirmed' || c.status === 'proposed')
  const done = own.filter((c) => c.status === 'done')
  const days = daysUntil(deal.deadline)

  // Urgency score: lower is more urgent. Used as the secondary sort.
  // Overdue deals dominate; then deadline proximity; then nothing.
  let urgency = 9999
  if (overdue.length > 0) urgency = -overdue.length * 1000
  else if (days !== null && days < 0) urgency = days
  else if (days !== null) urgency = days

  return {
    ...deal,
    overdueCount: overdue.length,
    openCount: open.length,
    doneCount: done.length,
    daysToDeadline: days,
    urgency,
  }
}

export function sortDeals(deals) {
  const active = []
  const archived = []
  for (const d of deals) {
    if (d.status === 'active') active.push(d)
    else archived.push(d)
  }

  // Active: red first, then amber, then green. Within each tier the most
  // urgent (lowest urgency score) comes first; ties break on created_at desc
  // so newer deals don't hide under stale ones.
  active.sort((a, b) => {
    const h = (HEALTH_RANK[a.health] ?? 3) - (HEALTH_RANK[b.health] ?? 3)
    if (h !== 0) return h
    if (a.urgency !== b.urgency) return a.urgency - b.urgency
    return new Date(b.created_at) - new Date(a.created_at)
  })

  // Archive: most-recently archived first (or created if archived_at is null).
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
    overdueCount: 0,
    pipelineValue: 0,
    valueAtRisk: 0,
    wonCount: 0,
    lostCount: 0,
  }
}

function rollUpStats({ active, archived }) {
  const stats = emptyStats()
  for (const d of active) {
    stats.activeCount += 1
    if (d.health === 'red') stats.redCount += 1
    else if (d.health === 'amber') stats.amberCount += 1
    else stats.greenCount += 1
    stats.overdueCount += d.overdueCount
    const v = Number(d.value) || 0
    stats.pipelineValue += v
    if (d.health === 'red') stats.valueAtRisk += v
  }
  for (const d of archived) {
    stats.archivedCount += 1
    if (d.status === 'won') stats.wonCount += 1
    else if (d.status === 'lost') stats.lostCount += 1
  }
  return stats
}
