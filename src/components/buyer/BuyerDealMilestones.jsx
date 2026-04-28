function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function normalizeMoment(moment) {
  const title = `${moment?.text || ''}`.trim()
  const dateIso = moment?.date || null
  const date = dateIso ? new Date(dateIso) : null
  if (!title || !date || Number.isNaN(date.getTime())) return null
  if (date.getTime() > Date.now()) return null
  return {
    title,
    dateIso,
    dateLabel: formatDate(dateIso),
  }
}

function deriveMilestones(moments) {
  const normalized = (moments ?? [])
    .map(normalizeMoment)
    .filter(Boolean)
    .sort((a, b) => new Date(a.dateIso).getTime() - new Date(b.dateIso).getTime())

  const unique = []
  for (const item of normalized) {
    const key = `${item.title.toLowerCase()}::${item.dateIso}`
    if (unique.some((x) => `${x.title.toLowerCase()}::${x.dateIso}` === key)) continue
    unique.push(item)
  }

  return unique.slice(-5)
}

export default function BuyerDealMilestones({ moments }) {
  const milestones = deriveMilestones(moments)

  if (milestones.length === 0) {
    return (
      <div className="bg-white border border-navy/10 rounded-2xl px-5 py-5">
        <h3 className="text-sm font-semibold text-navy mb-2">Deal milestones</h3>
        <p className="text-xs text-navy/55">No completed milestones yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-navy/10 rounded-2xl px-5 py-5">
      <h3 className="text-sm font-semibold text-navy mb-3">Deal milestones</h3>
      <ol className="divide-y divide-navy/10">
        {milestones.map((milestone, idx) => (
          <li key={`${milestone.dateIso}-${idx}`} className="py-2.5 flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-navy truncate" title={milestone.title}>
              {milestone.title}
            </p>
            <span className="shrink-0 text-[11px] text-navy/60">{milestone.dateLabel}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
