// Phase 8 — buyer-friendly history feed. Newest at top.

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function BuyerRecentMomentsFeed({
  moments,
  title = 'Recent moments',
  emptyCopy = 'No moments yet — Klo records the milestones that matter as the deal develops.',
}) {
  const items = (moments ?? []).slice().reverse()
  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-5 text-sm text-navy/55">{emptyCopy}</div>
      ) : (
        <ul className="divide-y divide-navy/5">
          {items.map((m, idx) => (
            <li key={`${m?.date ?? 'm'}-${idx}`} className="flex gap-4 px-5 py-3">
              <span className="text-[11px] text-navy/45 w-16 shrink-0 mt-0.5">
                {formatDate(m?.date)}
              </span>
              <p className="text-[13px] text-navy/85 leading-snug">{m?.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
