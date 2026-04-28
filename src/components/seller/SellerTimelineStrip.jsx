function titleCase(text) {
  return String(text || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function deriveMilestones(kloState) {
  const fromActions = (kloState?.next_actions ?? [])
    .map((a) => a?.action)
    .filter(Boolean)
  const fromDecisions = (kloState?.decisions ?? [])
    .map((d) => d?.what)
    .filter(Boolean)
  const fromQuestions = (kloState?.open_questions ?? [])
    .map((q) => q?.text)
    .filter(Boolean)
    .map((q) => `Clarify: ${q}`)
  const fromBlockers = (kloState?.blockers ?? [])
    .map((b) => b?.text)
    .filter(Boolean)
    .map((b) => `Resolve: ${b}`)

  const stageLabel = kloState?.stage ? titleCase(kloState.stage) : null
  const fromSignals = [stageLabel, ...fromActions, ...fromDecisions, ...fromQuestions, ...fromBlockers]
  const unique = []
  for (const signal of fromSignals) {
    if (!signal) continue
    const trimmed = signal.trim()
    if (!trimmed) continue
    if (unique.some((s) => s.toLowerCase() === trimmed.toLowerCase())) continue
    unique.push(trimmed)
  }

  const slotCount = 4
  const filled = Array.from({ length: slotCount }, () => null)
  for (let i = 0; i < Math.min(slotCount, unique.length); i += 1) {
    filled[i] = unique[i]
  }
  return filled
}

function goLiveDate(deadline) {
  if (!deadline?.date) return null
  const d = new Date(deadline.date)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function SellerTimelineStrip({ kloState }) {
  const milestones = deriveMilestones(kloState)
  const activeIdx = milestones.findIndex((m) => !m)
  const currentIdx = activeIdx === -1 ? milestones.length - 1 : Math.max(0, activeIdx - 1)
  const liveDate = goLiveDate(kloState?.deadline)

  return (
    <div className="bg-white border border-navy/10 rounded-2xl px-5 py-5">
      <h3 className="text-sm font-semibold text-navy mb-4">Deal milestones</h3>
      <div className="overflow-x-auto -mx-1 px-1">
        <ol className="flex items-center min-w-[640px] md:min-w-0 gap-1.5">
          {milestones.map((label, idx) => {
            const isPast = idx < currentIdx && Boolean(milestones[idx])
            const isCurrent = idx === currentIdx && Boolean(label)
            const isEmpty = !label
            const segmentClass = isCurrent
              ? 'bg-klo text-white border-klo'
              : isPast
                ? 'bg-klo/15 text-klo border-klo/20'
                : isEmpty
                  ? 'bg-navy/[0.02] text-navy/30 border-dashed border-navy/20'
                  : 'bg-white text-navy/60 border-navy/15'
            return (
              <li key={`milestone-${idx}`} className="flex-1 min-w-0 flex flex-col gap-1">
                <div
                  className={`text-[11px] uppercase tracking-wider font-semibold border rounded-md px-2 py-1.5 truncate text-center ${segmentClass}`}
                >
                  {label || 'Open milestone'}
                </div>
                <div className="text-[10px] text-center text-navy/35">
                  {label ? `Step ${idx + 1}` : ''}
                </div>
              </li>
            )
          })}
          <li className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold border rounded-md px-2 py-1.5 truncate text-center bg-white text-navy/70 border-navy/20">
              Go-live
            </div>
            <div className="text-[10px] text-center text-navy/40">
              {liveDate ?? ''}
            </div>
          </li>
        </ol>
      </div>
    </div>
  )
}
