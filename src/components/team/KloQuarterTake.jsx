// Phase 5: top-of-forecast quarter framing. Shows the realistic commit
// (likely-bucket weighted) and stretch number (likely + 60% of in-play).
// The narrated paragraph from klo-manager arrives in a later step — until
// then this is a static numbers card.

import { formatCurrency } from '../../lib/format.js'

export default function KloQuarterTake({ commit, stretch, dealCount }) {
  return (
    <div className="bg-klo-bg border border-klo/20 rounded-xl px-4 py-3 mb-4">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-klo mb-2">
        ◆ Klo · this quarter
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-2 mb-2">
        <Number label="Realistic commit" value={commit} tone="text-emerald-700" />
        <Number label="Stretch" value={stretch} tone="text-navy" />
      </div>
      <p className="text-[12px] text-navy/60 leading-snug">
        Weighted by Klo's read of each deal — not a calibrated forecast.
        {dealCount > 0 && ` Across ${dealCount} active ${dealCount === 1 ? 'deal' : 'deals'}.`}
      </p>
    </div>
  )
}

function Number({ label, value, tone }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-navy/50">
        {label}
      </p>
      <p className={`text-xl font-semibold leading-tight ${tone}`}>
        {formatCurrency(value)}
      </p>
    </div>
  )
}
