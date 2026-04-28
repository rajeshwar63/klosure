// Phase 8 — horizontal timeline of stages. Maps klo_state.stage to the
// nearest segment; security review is a sub-stage flag (not a real stage).

const STAGES = [
  { key: 'discovery', label: 'Discovery' },
  { key: 'proposal', label: 'Demo & Proposal' },
  { key: 'security_review', label: 'Security Review' },
  { key: 'negotiation', label: 'Procurement' },
  { key: 'legal', label: 'Contract' },
  { key: 'closed', label: 'Go-live' },
]

const ORDER_FOR = {
  discovery: 0,
  proposal: 1,
  negotiation: 3,
  legal: 4,
  closed: 5,
}

function blockersMentionSecurity(blockers) {
  return (blockers || []).some((b) => {
    const text = (b?.text || '').toLowerCase()
    return text.includes('security') || text.includes('infosec') || text.includes('soc 2') || text.includes('soc2')
  })
}

export default function BuyerTimelineStrip({ stage, deadline, blockers }) {
  const activeIdx = ORDER_FOR[stage] ?? -1
  const securityActive = blockersMentionSecurity(blockers) && activeIdx <= 2

  const goLiveLabel = (() => {
    if (!deadline?.date) return null
    const d = new Date(deadline.date)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })()

  return (
    <div className="bg-white border border-navy/10 rounded-2xl px-5 py-5">
      <h3 className="text-sm font-semibold text-navy mb-4">Path to signature</h3>
      <div className="overflow-x-auto -mx-1 px-1">
        <ol className="flex items-center min-w-[640px] md:min-w-0 gap-1.5">
          {STAGES.map((s, idx) => {
            const isSecurity = s.key === 'security_review'
            const isPast = !isSecurity && idx < activeIdx
            const isActive = !isSecurity && idx === activeIdx
            const securityIsActive = isSecurity && securityActive
            const segmentClass = isActive
              ? 'bg-klo text-white border-klo'
              : isPast
                ? 'bg-klo/15 text-klo border-klo/20'
                : securityIsActive
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-white text-navy/55 border-navy/15'
            const isLast = idx === STAGES.length - 1
            return (
              <li key={s.key} className="flex-1 min-w-0 flex flex-col gap-1">
                <div
                  className={`text-[11px] uppercase tracking-wider font-semibold border rounded-md px-2 py-1.5 truncate text-center ${segmentClass}`}
                >
                  {s.label}
                </div>
                <div className="text-[10px] text-navy/40 text-center truncate">
                  {isLast ? goLiveLabel ?? '' : ''}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
