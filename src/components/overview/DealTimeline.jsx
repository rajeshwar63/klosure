// Vertical chronological list: deal-created, commitment proposes/completions,
// and the deadline as a "Target go-live" entry. We deliberately don't render
// stage transitions because there's no stage history table (spec §"Data
// sourcing" caveat — phase 3.6 candidate). Past rows are muted, the
// deadline gets a "Critical" red pill.
export default function DealTimeline({ events }) {
  return (
    <div className="bg-white border border-navy/10 rounded-xl px-4 py-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-3">
        Timeline to go-live
      </div>
      {events.length === 0 ? (
        <div className="text-[13px] text-navy/40 italic">
          Nothing on the timeline yet.
        </div>
      ) : (
        <ol className="divide-y divide-navy/5">
          {events.map((e) => (
            <Row key={e.key} event={e} />
          ))}
        </ol>
      )}
    </div>
  )
}

function Row({ event }) {
  const date = new Date(event.date)
  const dateLabel = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const future = event.status === 'future'
  const labelTone = (() => {
    if (event.tone === 'critical') return 'text-red-600 font-semibold'
    if (event.tone === 'done') return 'text-emerald-700'
    if (event.tone === 'muted') return 'text-navy/40'
    if (future) return 'text-navy'
    return 'text-navy/60'
  })()
  const pill = (() => {
    if (event.tone === 'critical') return { text: 'Critical', cls: 'bg-red-100 text-red-700' }
    if (event.tone === 'done') return { text: 'Done', cls: 'bg-emerald-100 text-emerald-700' }
    if (future) return { text: 'Upcoming', cls: 'bg-klo/15 text-klo' }
    return null
  })()

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-14 shrink-0 text-[11px] font-semibold text-navy/40 tabular-nums">
        {dateLabel}
      </span>
      <span className={`flex-1 min-w-0 text-[13px] truncate ${labelTone}`}>
        {event.label}
      </span>
      {pill && (
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${pill.cls}`}>
          {pill.text}
        </span>
      )}
    </li>
  )
}
