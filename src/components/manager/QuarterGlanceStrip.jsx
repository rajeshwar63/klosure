// Phase 6 step 14 — compact bucket strip on the manager home. Reuses the
// Phase 5 bucketDeals math; mirrors the seller PipelineGlanceStrip but with
// commit / stretch numbers in the header (managers think in commits).

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

const TONE = {
  good: { bg: '#EAF3DE', label: '#3B6D11', text: '#173404' },
  caution: { bg: '#FAEEDA', label: '#854F0B', text: '#412402' },
  muted: { bg: '#F1F0EC', label: '#6B6A64', text: '#3A3A36' },
}

function BucketCard({ label, amount, count, tone }) {
  const c = TONE[tone] || TONE.muted
  return (
    <div className="rounded-md p-3" style={{ background: c.bg }}>
      <div
        className="text-[10px] uppercase tracking-wider mb-1"
        style={{ color: c.label }}
      >
        {label}
      </div>
      <div
        className="text-lg font-medium leading-tight"
        style={{ color: c.text }}
      >
        {compactCurrency(amount)}
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: c.label }}>
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
    <section>
      <div className="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
        <span className="text-[10px] font-semibold tracking-wider text-navy/45">
          QUARTER AT A GLANCE
        </span>
        <span className="text-[11px] text-navy/55">
          Commit {compactCurrency(commit)} · stretch {compactCurrency(stretch)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
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
    </section>
  )
}
