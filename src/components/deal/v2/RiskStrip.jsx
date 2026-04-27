// Risk strip — bullet items showing what's putting the deal at risk.
// Reads klo_state.risks if the edge function emits it; otherwise derives
// from heuristics (overdue commitments, missing decision-maker, deadline math).

import { useMemo } from 'react'
import { daysUntil } from '../../../lib/format.js'

function deriveRisks({ deal, commitments }) {
  const risks = []
  const ks = deal?.klo_state ?? {}

  const overdue = (commitments ?? []).filter(
    (c) => c.status === 'overdue' || (c.due_date && new Date(c.due_date) < new Date() && c.status !== 'done' && c.status !== 'declined'),
  )
  if (overdue.length === 1) {
    risks.push('1 commitment is overdue')
  } else if (overdue.length > 1) {
    risks.push(`${overdue.length} commitments are overdue`)
  }

  const people = ks.people ?? []
  const hasDM = people.some((p) => {
    const c = (p.classification ?? p.role ?? '').toLowerCase()
    return c.includes('decision') || c === 'dm' || c.includes('economic') || c.includes('cfo') || c.includes('vp')
  })
  if (people.length > 0 && !hasDM) {
    risks.push('Decision-maker not in the room')
  }

  const days = daysUntil(deal?.deadline)
  if (days !== null && days < 0) {
    risks.push('Deadline has passed')
  } else if (days !== null && days <= 14 && deal?.stage && !['legal', 'closed'].includes(deal.stage)) {
    risks.push("Budget window doesn't fit deadline")
  }

  if (deal?.health === 'red') {
    risks.push('Health is red')
  }

  return risks
}

export default function RiskStrip({ deal, commitments }) {
  const explicit = deal?.klo_state?.risks
  const risks = useMemo(() => {
    if (Array.isArray(explicit) && explicit.length > 0) return explicit
    return deriveRisks({ deal, commitments })
  }, [explicit, deal, commitments])

  if (!risks.length) return null

  return (
    <div
      className="flex items-stretch rounded-lg mb-4 overflow-hidden"
      style={{
        background: 'var(--dr-bad-soft)',
        border: '1px solid rgba(179, 58, 47, 0.15)',
      }}
    >
      <div style={{ width: 3, background: 'var(--dr-bad)', flexShrink: 0 }} />
      <div className="flex-1 px-4 py-3 flex flex-wrap items-center" style={{ gap: '8px 24px' }}>
        <span
          className="dr-mono font-medium"
          style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dr-bad)' }}
        >
          Why it's at risk
        </span>
        {risks.map((r, i) => (
          <span
            key={i}
            className="flex items-center gap-1.5"
            style={{ fontSize: 12.5, color: 'var(--dr-bad)' }}
          >
            <span
              className="inline-block rounded-full"
              style={{ width: 3, height: 3, background: 'var(--dr-bad)' }}
            />
            {r}
          </span>
        ))}
      </div>
    </div>
  )
}
