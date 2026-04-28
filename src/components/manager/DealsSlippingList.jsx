// Phase 6 step 14 — list of deals that need manager attention this week.
//
// A deal counts as "slipping" if any of these are true:
//   - confidence trend is down with delta <= -5
//   - health is amber
//   - the deal has been at the same stage for >= 4 weeks
// Items sort by composite severity score; cap at 5.

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

function weeksAtStage(deal) {
  // Use updated_at as the closest signal we have for "no movement". Phase 7
  // can replace with a real stage_changed_at timestamp.
  const ts = deal?.updated_at || deal?.created_at
  if (!ts) return 0
  const t = new Date(ts).getTime()
  if (Number.isNaN(t)) return 0
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24 * 7))
}

function severityScore(deal) {
  let score = 0
  const c = deal?.klo_state?.confidence
  if (c?.trend === 'down' && typeof c?.delta === 'number') {
    score += Math.abs(c.delta)
  }
  if (deal?.health === 'amber') score += 5
  if (deal?.health === 'red') score += 15
  if (weeksAtStage(deal) >= 4) score += 8
  return score
}

function buildSummary(deal) {
  const parts = []
  const w = weeksAtStage(deal)
  if (w >= 2) parts.push(`Stuck ${w}w`)
  const topBlocker = deal?.klo_state?.blockers?.[0]?.text
  if (topBlocker && parts.length < 3) {
    parts.push(
      topBlocker.length > 30 ? `${topBlocker.slice(0, 27)}…` : topBlocker,
    )
  }
  return parts.join(' · ')
}

export function computeDealsSlipping(deals) {
  return (deals || [])
    .filter((d) => d?.status === 'active')
    .map((d) => ({ deal: d, severity: severityScore(d) }))
    .filter((x) => x.severity > 0)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 5)
}

function toneFor(value) {
  if (value == null) return 'muted'
  if (value < 30) return 'risk'
  if (value < 60) return 'caution'
  return 'good'
}

const TONE_COLOR = {
  good: '#3B6D11',
  caution: '#BA7517',
  risk: '#A32D2D',
  muted: '#6B6A64',
}

function DealSlippingRow({ deal, onOpen }) {
  const c = deal.klo_state?.confidence
  const value = c?.value
  const tone = toneFor(value)
  const toneColor = TONE_COLOR[tone]
  const summary = buildSummary(deal)
  const repName = deal.seller_name || '—'

  return (
    <div
      className="bg-white rounded-md px-4 py-3 flex items-center gap-3"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <div className="flex flex-col items-center min-w-[40px] shrink-0">
        <span
          className="text-sm font-medium tabular-nums"
          style={{ color: toneColor }}
        >
          {value != null ? Math.round(value) : '—'}
        </span>
        {c?.trend === 'down' && c?.delta != null && (
          <span className="text-[9px]" style={{ color: '#A32D2D' }}>
            ↓ {Math.abs(c.delta)}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-navy truncate">
          {deal.title} · {repName}
        </div>
        {summary && (
          <div className="text-xs text-navy/55 truncate">{summary}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="px-3 py-1 rounded-md text-xs text-navy/80 shrink-0"
        style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.18)' }}
      >
        Open
      </button>
    </div>
  )
}

export default function DealsSlippingList({ deals }) {
  const navigate = useNavigate()
  const items = useMemo(() => computeDealsSlipping(deals || []), [deals])

  if (items.length === 0) {
    return (
      <section className="mb-6">
        <div className="text-[10px] font-semibold tracking-wider text-navy/45 mb-2">
          DEALS SLIPPING THIS WEEK · 0
        </div>
        <div
          className="bg-white rounded-md px-4 py-3 text-sm text-navy/60"
          style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.10)' }}
        >
          No deals slipping this week. The team's pipeline is healthy.
        </div>
      </section>
    )
  }

  return (
    <section className="mb-6">
      <div className="text-[10px] font-semibold tracking-wider text-navy/45 mb-2">
        DEALS SLIPPING THIS WEEK · {items.length}
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map(({ deal }) => (
          <DealSlippingRow
            key={deal.id}
            deal={deal}
            onOpen={() => navigate(`/deals/${deal.id}`)}
          />
        ))}
      </div>
    </section>
  )
}
