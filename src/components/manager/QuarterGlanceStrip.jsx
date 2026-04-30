// Manager-home quarter buckets — three colourful cards, mirroring the
// landing-page hero so the in-app surface feels like the marketing demo.

import { useMemo } from 'react'
import {
  bucketDeals,
  computeQuarterCommit,
  computeQuarterStretch,
} from '../../services/teamForecast.js'

function compactCurrency(amount) {
  const n = Number(amount) || 0
  if (n === 0) return '$0'
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000
    const fixed = m >= 10 ? m.toFixed(0) : m.toFixed(2)
    return `$${fixed.replace(/\.?0+$/, '')}M`
  }
  if (Math.abs(n) >= 1_000) {
    return `$${Math.round(n / 1000)}k`
  }
  return `$${Math.round(n)}`
}

const TONES = {
  good: { bg: '#EAF3DE', label: '#3B6D11', amount: '#173404', deals: '#3B6D11' },
  caution: { bg: '#FAEEDA', label: '#854F0B', amount: '#412402', deals: '#854F0B' },
  muted: { bg: '#F1F0EC', label: '#6B6A64', amount: '#3A3A36', deals: '#6B6A64' },
}

function BucketCard({ label, amount, count, tone }) {
  const c = TONES[tone] || TONES.muted
  return (
    <div className="rounded-xl px-5 py-4" style={{ background: c.bg }}>
      <div
        className="text-[10px] font-semibold uppercase tracking-wider mb-2"
        style={{ color: c.label, letterSpacing: '0.1em' }}
      >
        {label}
      </div>
      <div
        className="text-[26px] font-semibold leading-none tabular-nums"
        style={{ color: c.amount, letterSpacing: '-0.02em' }}
      >
        {compactCurrency(amount)}
      </div>
      <div
        className="text-[11px] mt-2 kl-mono"
        style={{ color: c.deals, letterSpacing: '0.04em' }}
      >
        {count} deal{count === 1 ? '' : 's'}
      </div>
    </div>
  )
}

export default function QuarterGlanceStrip({ deals }) {
  const buckets = useMemo(() => bucketDeals(deals || []), [deals])
  const commit = computeQuarterCommit(buckets)
  const stretch = computeQuarterStretch(buckets)
  const activeCount =
    buckets.likely.deals.length +
    buckets.in_play.deals.length +
    buckets.long_shot.deals.length

  if (activeCount === 0) return null

  return (
    <section className="mb-7">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BucketCard
          label="Likely close"
          amount={buckets.likely.weighted}
          count={buckets.likely.deals.length}
          tone="good"
        />
        <BucketCard
          label="In play"
          amount={buckets.in_play.weighted}
          count={buckets.in_play.deals.length}
          tone="caution"
        />
        <BucketCard
          label="Long shot"
          amount={buckets.long_shot.weighted}
          count={buckets.long_shot.deals.length}
          tone="muted"
        />
      </div>
      <div
        className="mt-3 text-[11px] kl-mono text-right"
        style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.04em' }}
      >
        Commit{' '}
        <span style={{ color: 'var(--klo-text-dim)' }}>{compactCurrency(commit)}</span>
        {' · '}stretch{' '}
        <span style={{ color: 'var(--klo-text-dim)' }}>{compactCurrency(stretch)}</span>
      </div>
    </section>
  )
}
