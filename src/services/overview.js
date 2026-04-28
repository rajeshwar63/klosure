// =============================================================================
// Overview derivations — Phase 4.5
// =============================================================================
// Pure functions that turn the deal state already held by the DealRoom shell
// into the shapes the Overview sections need. The shell owns the realtime
// subscription on messages/deals and passes live values down.
//
// Phase 4.5 adds `getOverviewData(dealId)` for callers that want to load the
// living deal record (klo_state) directly, plus `deriveHealthFromState`
// which derives the green/amber/red dot from klo_state confidence.
// =============================================================================

import { daysUntil } from '../lib/format.js'
import { supabase } from '../lib/supabase.js'

export async function getOverviewData(dealId) {
  const dealRes = await supabase.from('deals').select('*').eq('id', dealId).single()
  if (dealRes.error) throw dealRes.error
  return {
    deal: dealRes.data,
    kloState: dealRes.data?.klo_state ?? null,
  }
}

// Phase 4.5 + Phase 9: health derived from living state. Tentative confidence
// on date/value pushes amber.
export function deriveHealthFromState(state) {
  if (!state) return 'green'
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

// Phase 5.5 step 06: short summaries used by collapsed-section headers so
// the user can glance at "People (3) · Nina, Ahmed, +1" without expanding.
export function summarizePeople(people) {
  if (!people || people.length === 0) return null
  const names = people.map((p) =>
    !p.name || p.name === 'Unknown' ? '+1 unknown' : p.name,
  )
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')}, +${names.length - 2}`
}

export function summarizeBlockers(blockers) {
  if (!blockers || blockers.length === 0) return null
  return blockers
    .slice(0, 2)
    .map((b) => (b.text?.length > 40 ? b.text.slice(0, 37) + '…' : b.text))
    .filter(Boolean)
    .join(', ')
}

export function compactDeadline(deadlineISO) {
  if (!deadlineISO) return '—'
  const d = daysUntil(deadlineISO)
  if (d === null) return '—'
  if (d < 0) return `${Math.abs(d)}d overdue`
  if (d === 0) return 'today'
  if (d < 60) return `${d}d`
  return `${Math.round(d / 30)}mo`
}

export function healthLabel(health) {
  if (health === 'red') return 'At risk'
  if (health === 'amber') return 'Stuck'
  return 'On track'
}

// Due-date pill tone: red if past, amber if within 7 days, neutral else.
export function dueTone(dueDate) {
  const d = daysUntil(dueDate)
  if (d === null) return 'neutral'
  if (d < 0) return 'red'
  if (d <= 7) return 'amber'
  return 'neutral'
}

// Timeline entries from existing data only.
export function deriveTimeline(deal) {
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
