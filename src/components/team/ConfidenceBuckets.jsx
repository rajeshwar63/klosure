// Phase 5: three confidence buckets for the manager forecast tab.
// Likely close (≥65) / In play (30-64) / Long shots (<30 or unknown).
// Weighted dollar amounts come from teamForecast.bucketDeals.

import { formatCurrency } from '../../lib/format.js'

const BUCKET_TONE = {
  likely: 'border-emerald-200 bg-emerald-50',
  in_play: 'border-amber-200 bg-amber-50',
  long_shot: 'border-navy/15 bg-navy/5',
}

const BUCKET_TEXT = {
  likely: 'text-emerald-700',
  in_play: 'text-amber-700',
  long_shot: 'text-navy/70',
}

export default function ConfidenceBuckets({ buckets }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
      <Bucket
        tone="likely"
        label="Likely close"
        amount={buckets.likely.weighted}
        count={buckets.likely.deals.length}
        meta="≥ 65%"
      />
      <Bucket
        tone="in_play"
        label="In play"
        amount={buckets.in_play.weighted}
        count={buckets.in_play.deals.length}
        meta="30–64%"
      />
      <Bucket
        tone="long_shot"
        label="Long shots"
        amount={buckets.long_shot.weighted}
        count={buckets.long_shot.deals.length}
        meta="< 30%"
      />
    </div>
  )
}

function Bucket({ tone, label, amount, count, meta }) {
  return (
    <div className={`border rounded-xl px-4 py-3 ${BUCKET_TONE[tone]}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-navy/50">
        {label}
      </p>
      <p className={`text-2xl font-semibold leading-tight mt-0.5 ${BUCKET_TEXT[tone]}`}>
        {formatCurrency(amount)}
      </p>
      <p className="text-[11px] text-navy/55 mt-1">
        {count} {count === 1 ? 'deal' : 'deals'} · {meta}
      </p>
    </div>
  )
}
