// Phase 8 — the centerpiece card. Klo's brief, written TO the buyer.
// Premium card style; this is the visual anchor of the dashboard.

function relativeTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const diff = Math.round((Date.now() - d.getTime()) / 1000)
  if (diff < 30) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / 86400)
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export default function BuyerKloBriefHero({ buyerView }) {
  const text = buyerView?.klo_brief_for_buyer
  if (!text) return null
  const updated = relativeTime(buyerView?.generated_at)

  return (
    <div className="relative bg-white border border-navy/10 rounded-2xl px-6 md:px-10 py-6 md:py-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full bg-klo/60" aria-hidden />
      <div className="flex items-center gap-2 mb-3">
        <span className="text-klo text-base leading-none" aria-hidden>◆</span>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-navy/45">
          Klo · Your deal advisor
        </span>
      </div>
      <p className="text-[16px] md:text-[17px] leading-relaxed text-navy">
        {text}
      </p>
      {updated && (
        <p className="mt-4 text-[11px] text-navy/35 text-right">
          Updated {updated}
        </p>
      )}
    </div>
  )
}
