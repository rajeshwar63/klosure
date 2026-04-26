// =============================================================================
// Overview derivations — Phase 3.5 + Phase 4.5
// =============================================================================
// Pure functions that turn the deal + commitments state already held by the
// DealRoom shell into the shapes the Overview sections need. The shell owns
// the realtime subscription on messages/commitments/deals and passes live
// values down — these helpers just slice that data.
//
// Phase 4.5 adds `getOverviewData(dealId)` for callers that want to load the
// living deal record (klo_state + commitments) directly, plus
// `deriveHealthFromState` which derives the green/amber/red dot from
// klo_state confidence + commitments.
// =============================================================================

import { daysUntil } from '../lib/format.js'
import { supabase } from '../lib/supabase.js'

// Phase 4.5: load deal + klo_state + commitments in one call. The shell
// (DealRoom) usually owns this state; this helper exists for components that
// want to render the Overview standalone or for tests.
export async function getOverviewData(dealId) {
  const [dealRes, commitmentsRes] = await Promise.all([
    supabase.from('deals').select('*').eq('id', dealId).single(),
    supabase.from('commitments').select('*').eq('deal_id', dealId)
  ])
  if (dealRes.error) throw dealRes.error
  return {
    deal: dealRes.data,
    kloState: dealRes.data?.klo_state ?? null,
    commitments: commitmentsRes.data ?? []
  }
}

// Phase 4.5: health is no longer a column read — it's derived from the
// living state + commitments. Tentative confidence on date/value pushes
// amber; overdue commitments + deadline within 14d pushes red.
export function deriveHealthFromState(state, commitments) {
  if (!state) return 'green'
  const list = commitments ?? []
  const overdue = list.filter((c) => c.status === 'overdue')
  const days = state.deadline?.date ? daysUntil(state.deadline.date) : null

  if (overdue.length > 0 && days !== null && days <= 14) return 'red'
  if (overdue.length > 0) return 'amber'
  if (state.deadline?.confidence === 'tentative') return 'amber'
  if (state.deal_value?.confidence === 'tentative') return 'amber'
  return 'green'
}

const STAGE_ORDER = ['discovery', 'proposal', 'negotiation', 'legal', 'closed']

const STAGE_LABEL = {
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  legal: 'Legal',
  closed: 'Closed'
}

export function getStageOrder() {
  return STAGE_ORDER
}

export function getStageLabel(stage) {
  return STAGE_LABEL[stage] ?? '—'
}

export function getStageIndex(stage) {
  const idx = STAGE_ORDER.indexOf(stage)
  return idx === -1 ? 0 : idx
}

// Stat strip: what the four cells at the top of the overview render.
//   stage       — current stage label + "Stage N of 5"
//   value       — raw deal.value (formatting happens in the component)
//   commitments — "X done of Y", with Y excluding declined rows
//   blockers    — count of overdue + their truncated task names for the sub-text
export function deriveStats(deal, commitments) {
  const list = commitments ?? []
  const active = list.filter((c) => c.status !== 'declined')
  const done = active.filter((c) => c.status === 'done')
  const overdue = active.filter((c) => c.status === 'overdue')
  const pending = active.filter((c) => c.status === 'proposed' || c.status === 'confirmed')

  return {
    stage: deal?.stage ?? 'discovery',
    stageIndex: getStageIndex(deal?.stage),
    stageLabel: getStageLabel(deal?.stage),
    stageCount: STAGE_ORDER.length,
    value: deal?.value ?? null,
    doneCount: done.length,
    totalCount: active.length,
    pendingCount: pending.length,
    overdueCount: overdue.length,
    overdueTasks: overdue.map((c) => c.task).filter(Boolean),
  }
}

// Split commitments into the two action zones. Done items are returned
// separately so each panel can hide them behind a "Show N completed" toggle.
// Inside each zone: overdue first (oldest overdue at top), then by due_date
// ascending, then by created_at ascending as a stable tiebreaker.
export function splitActionZones(commitments) {
  const list = commitments ?? []
  const open = list.filter((c) =>
    c.status === 'proposed' || c.status === 'confirmed' || c.status === 'overdue'
  )
  const done = list.filter((c) => c.status === 'done')

  const sortOpen = (arr) =>
    [...arr].sort((a, b) => {
      const ao = a.status === 'overdue'
      const bo = b.status === 'overdue'
      if (ao !== bo) return ao ? -1 : 1
      // Both overdue: oldest due_date first (most overdue at top).
      if (ao && bo) {
        return cmpDate(a.due_date, b.due_date)
      }
      // Otherwise: earliest due_date first; nulls last.
      const d = cmpDate(a.due_date, b.due_date)
      if (d !== 0) return d
      return cmpDate(a.created_at, b.created_at)
    })

  const sortDone = (arr) =>
    [...arr].sort((a, b) => cmpDate(b.confirmed_at || b.created_at, a.confirmed_at || a.created_at))

  return {
    buyer: {
      open: sortOpen(open.filter((c) => c.owner === 'buyer')),
      done: sortDone(done.filter((c) => c.owner === 'buyer')),
    },
    seller: {
      open: sortOpen(open.filter((c) => c.owner === 'seller')),
      done: sortDone(done.filter((c) => c.owner === 'seller')),
    },
  }
}

function cmpDate(a, b) {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return new Date(a) - new Date(b)
}

// Due-date pill tone: red if overdue, amber if within 7 days, neutral else.
export function dueTone(dueDate, status) {
  if (status === 'overdue') return 'red'
  const d = daysUntil(dueDate)
  if (d === null) return 'neutral'
  if (d < 0) return 'red'
  if (d <= 7) return 'amber'
  return 'neutral'
}

// Timeline entries sourced from existing data only — no fabricated stage
// transitions (we don't have a stage history table). Returns a flat list,
// past events first then future, sorted by date ascending.
export function deriveTimeline(deal, commitments) {
  if (!deal) return []
  const events = []

  if (deal.created_at) {
    events.push({
      key: 'deal-created',
      date: deal.created_at,
      label: 'Deal created',
      status: 'past',
      tone: 'muted',
    })
  }

  for (const c of commitments ?? []) {
    if (c.created_at) {
      events.push({
        key: `c-prop-${c.id}`,
        date: c.created_at,
        label: `${c.task} — proposed`,
        status: 'past',
        tone: c.status === 'declined' ? 'muted' : 'past',
      })
    }
    if (c.status === 'done' && c.confirmed_at) {
      events.push({
        key: `c-done-${c.id}`,
        date: c.confirmed_at,
        label: `${c.task} — completed`,
        status: 'past',
        tone: 'done',
      })
    }
  }

  if (deal.deadline) {
    events.push({
      key: 'deal-deadline',
      date: deal.deadline,
      label: 'Target go-live',
      status: 'future',
      tone: 'critical',
    })
  }

  events.sort((a, b) => new Date(a.date) - new Date(b.date))
  return events
}
