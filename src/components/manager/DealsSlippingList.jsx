// "Klo flagged this morning" — the slipping deals on the manager home,
// styled to match the landing-page mock (coloured dot, who · what, click-
// through to the deal).
//
// A deal counts as "slipping" if any of these are true:
//   - confidence trend is down with delta <= -5
//   - health is amber/red
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

function flagToneFor(deal) {
  if (deal?.health === 'red') return 'bad'
  if (deal?.health === 'amber') return 'warn'
  const c = deal?.klo_state?.confidence
  if (c?.value != null && c.value < 30) return 'bad'
  return 'warn'
}

function buildSummary(deal) {
  const parts = []
  const w = weeksAtStage(deal)
  if (w >= 2) parts.push(`Stuck ${w}w`)
  const topBlocker = deal?.klo_state?.blockers?.[0]?.text
  if (topBlocker && parts.length < 3) {
    parts.push(
      topBlocker.length > 60 ? `${topBlocker.slice(0, 57)}…` : topBlocker,
    )
  }
  const c = deal?.klo_state?.confidence
  if (c?.trend === 'down' && c?.delta != null && parts.length < 3) {
    parts.push(`confidence ↓ ${Math.abs(c.delta)}`)
  }
  if (parts.length === 0) parts.push('Needs a manager nudge')
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

const DOT_COLOR = {
  bad: 'var(--klo-danger)',
  warn: 'var(--klo-warn)',
}

function FlagRow({ deal, onOpen }) {
  const tone = flagToneFor(deal)
  const repName = deal.seller_name || '—'
  const buyer = deal.buyer_company || deal.title
  const who = `${repName} · ${buyer}`
  const what = buildSummary(deal)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-lg px-4 py-3 flex items-center gap-3 transition-colors hover:bg-navy/[0.03]"
      style={{
        background: 'var(--klo-bg-elev)',
        border: '1px solid var(--klo-line)',
      }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: DOT_COLOR[tone] || DOT_COLOR.warn }}
        aria-hidden
      />
      <span
        className="text-[13px] font-semibold shrink-0"
        style={{ color: 'var(--klo-text)' }}
      >
        {who}
      </span>
      <span className="text-[13px]" style={{ color: 'var(--klo-text-mute)' }}>
        ·
      </span>
      <span
        className="text-[13px] flex-1 min-w-0 truncate"
        style={{ color: 'var(--klo-text-dim)' }}
      >
        {what}
      </span>
      <span className="text-navy/30 shrink-0" aria-hidden>
        ›
      </span>
    </button>
  )
}

export default function DealsSlippingList({ deals }) {
  const navigate = useNavigate()
  const items = useMemo(() => computeDealsSlipping(deals || []), [deals])

  if (items.length === 0) {
    return (
      <section className="mb-6">
        <div
          className="text-[11px] font-semibold uppercase mb-2 kl-mono"
          style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.1em' }}
        >
          Klo flagged this morning · 0
        </div>
        <div
          className="rounded-lg px-4 py-3 text-[13px]"
          style={{
            background: 'var(--klo-bg-elev)',
            border: '1px solid var(--klo-line)',
            color: 'var(--klo-text-dim)',
          }}
        >
          No deals slipping this week. The team's pipeline is healthy.
        </div>
      </section>
    )
  }

  return (
    <section className="mb-6">
      <div
        className="text-[11px] font-semibold uppercase mb-2 kl-mono"
        style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.1em' }}
      >
        Klo flagged this morning · {items.length}
      </div>
      <div className="flex flex-col gap-2">
        {items.map(({ deal }) => (
          <FlagRow
            key={deal.id}
            deal={deal}
            onOpen={() => navigate(`/deals/${deal.id}`)}
          />
        ))}
      </div>
    </section>
  )
}
