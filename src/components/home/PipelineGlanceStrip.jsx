// Phase 6 step 07 — three bucket cards (Likely close / In play / Long shot)
// at the bottom of the seller home. Glance, not focal point — no charts, no
// drill-down. Buckets reuse the Phase 5 cutoffs (>=65 likely, 30-64 in play,
// <30 or null long shot).

import { useMemo } from 'react'

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

export function bucketSellerDeals(deals) {
  const buckets = {
    likely: { count: 0, weighted: 0 },
    in_play: { count: 0, weighted: 0 },
    long_shot: { count: 0, weighted: 0 },
  }
  for (const deal of deals || []) {
    if (deal.status !== 'active') continue
    const value = deal.klo_state?.deal_value?.amount ?? (Number(deal.value) || 0)
    const confidence = deal.klo_state?.confidence?.value
    const weighted =
      confidence != null ? Math.round((value * confidence) / 100) : 0
    let key
    if (confidence == null || confidence < 30) key = 'long_shot'
    else if (confidence < 65) key = 'in_play'
    else key = 'likely'
    buckets[key].count += 1
    buckets[key].weighted += weighted
  }
  return buckets
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
        className="text-[10px] mb-1 uppercase tracking-wider"
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

function SkeletonStrip() {
  return (
    <section>
      <div className="text-[10px] font-semibold tracking-wider text-navy/45 mb-2">
        PIPELINE AT A GLANCE
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-md p-3 animate-pulse"
            style={{ background: '#F1F0EC' }}
          >
            <div className="h-2 w-1/2 bg-navy/10 rounded mb-2" />
            <div className="h-5 w-2/3 bg-navy/15 rounded mb-1" />
            <div className="h-2 w-1/3 bg-navy/10 rounded" />
          </div>
        ))}
      </div>
    </section>
  )
}

export default function PipelineGlanceStrip({ deals, loading }) {
  const buckets = useMemo(() => bucketSellerDeals(deals || []), [deals])

  if (loading) return <SkeletonStrip />

  const activeCount =
    buckets.likely.count + buckets.in_play.count + buckets.long_shot.count
  const totalWeighted =
    buckets.likely.weighted + buckets.in_play.weighted + buckets.long_shot.weighted

  if (activeCount === 0) return null

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] font-semibold tracking-wider text-navy/45">
          PIPELINE AT A GLANCE
        </span>
        <span className="text-[11px] text-navy/55">
          Weighted {compactCurrency(totalWeighted)} · {activeCount} deal
          {activeCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <BucketCard
          label="Likely close"
          amount={buckets.likely.weighted}
          count={buckets.likely.count}
          tone="good"
        />
        <BucketCard
          label="In play"
          amount={buckets.in_play.weighted}
          count={buckets.in_play.count}
          tone="caution"
        />
        <BucketCard
          label="Long shot"
          amount={buckets.long_shot.weighted}
          count={buckets.long_shot.count}
          tone="muted"
        />
      </div>
    </section>
  )
}
