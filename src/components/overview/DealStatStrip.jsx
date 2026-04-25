import { formatCurrency } from '../../lib/format.js'

// Four-cell summary at the top of the Overview. 4-up on desktop, 2x2 on
// mobile (≤640px). Renders only what we actually have in the schema —
// no fabricated "/yr" or "Confirmed" badges (Phase 3.5 §"Data sourcing").
export default function DealStatStrip({ stats }) {
  const blockerTone = (() => {
    if (stats.overdueCount === 0) return 'text-emerald-600'
    if (stats.overdueCount === 1) return 'text-amber-600'
    return 'text-red-600'
  })()

  const blockerSub = (() => {
    if (stats.overdueCount === 0) return 'None right now'
    const joined = stats.overdueTasks.join(' · ')
    if (joined.length <= 40) return joined
    return joined.slice(0, 38).trimEnd() + '…'
  })()

  // gap-px over a tinted bg gives a single 1px hairline between cells in
  // both 2-col and 4-col layouts, with no nth-child gymnastics.
  return (
    <div className="rounded-xl overflow-hidden border border-navy/10 bg-navy/10">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px">
        <Cell label="Deal stage" value={stats.stageLabel} sub={`Stage ${stats.stageIndex + 1} of ${stats.stageCount}`} />
        <Cell
          label="Value"
          value={formatCurrency(stats.value)}
          sub={stats.value ? 'Per the deal record' : 'Not set'}
        />
        <Cell
          label="Commitments"
          value={`${stats.doneCount} of ${stats.totalCount} done`}
          sub={stats.pendingCount === 0 ? 'Nothing pending' : `${stats.pendingCount} pending`}
        />
        <Cell
          label="Open blockers"
          value={
            <span className={blockerTone}>
              {stats.overdueCount === 0 ? 'None' : `${stats.overdueCount} open`}
            </span>
          }
          sub={blockerSub}
        />
      </div>
    </div>
  )
}

function Cell({ label, value, sub }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-0.5">
        {label}
      </div>
      <div className="text-[15px] font-semibold text-navy leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-navy/50 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}
