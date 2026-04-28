// Phase 8 — buyer-facing risks. Framed as "things to act on", not deal-
// dying language. Each risk has a label chip, a why_it_matters paragraph,
// and a mitigation callout.

export default function BuyerRisksList({ risks }) {
  const items = risks ?? []
  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">Risks Klo is watching</h3>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-5 text-sm text-navy/55">
          No risks identified — Klo will flag concerns here as the deal progresses.
        </div>
      ) : (
        <ul className="divide-y divide-navy/5">
          {items.map((r, idx) => (
            <li key={`${r?.label ?? 'r'}-${idx}`} className="px-5 py-4">
              <span className="inline-block bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-md">
                {r?.label || 'Risk'}
              </span>
              {r?.why_it_matters && (
                <p className="text-[13px] text-navy/75 leading-snug mt-2">
                  {r.why_it_matters}
                </p>
              )}
              {r?.mitigation && (
                <p className="text-[12px] text-klo mt-2 leading-snug">
                  → {r.mitigation}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
