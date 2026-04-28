// Phase 8 — buyer-side internal stakeholder map. The "wow" component:
// no CRM does this for the buyer.

const ENGAGEMENT = {
  aligned: { label: 'Aligned', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  engaged: { label: 'Engaged', dot: 'bg-sky-500', text: 'text-sky-700' },
  quiet: { label: 'Quiet', dot: 'bg-amber-500', text: 'text-amber-700' },
  blocker: { label: 'Blocker', dot: 'bg-red-500', text: 'text-red-700' },
  unknown: { label: 'Not yet engaged', dot: 'bg-navy/30', text: 'text-navy/55' },
}

function StakeholderCard({ stakeholder }) {
  const engagement = ENGAGEMENT[stakeholder?.engagement] || ENGAGEMENT.unknown
  return (
    <div className="rounded-xl border border-navy/10 bg-white px-4 py-3 flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-navy truncate">
          {stakeholder?.name || 'Unnamed'}
        </p>
      </div>
      <p className="text-[12px] text-navy/55 truncate">{stakeholder?.role || '—'}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className={`w-1.5 h-1.5 rounded-full ${engagement.dot}`} aria-hidden />
        <span className={`text-[11px] font-medium ${engagement.text}`}>
          {engagement.label}
        </span>
      </div>
      {stakeholder?.klo_note && (
        <p
          className="text-[12px] text-navy/65 italic mt-1 leading-snug line-clamp-2"
          title={stakeholder.klo_note}
        >
          {stakeholder.klo_note}
        </p>
      )}
    </div>
  )
}

export default function BuyerStakeholderMap({
  stakeholders,
  title = 'Your team on this deal',
  emptyCopy = 'Klo will identify your internal stakeholders as they appear in your conversations with the vendor.',
}) {
  const items = stakeholders ?? []
  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
      </div>
      <div className="p-5">
        {items.length === 0 ? (
          <p className="text-sm text-navy/55">{emptyCopy}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((s, idx) => (
              <StakeholderCard key={`${s?.name ?? 'x'}-${idx}`} stakeholder={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
