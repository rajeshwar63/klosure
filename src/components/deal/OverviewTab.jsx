// Phase 6 step 08 — placeholder Overview tab. The real two-column layout
// with KloRecommendsCard, ConfidenceSidePanel, and the rest lands in steps
// 09-11.

export default function OverviewTab({ deal }) {
  return (
    <div className="p-6 md:p-8 max-w-[900px] mx-auto text-sm text-navy/55">
      <p className="mb-2">Overview is being rebuilt for Phase 6.</p>
      <p>
        For now, switch to the Chat tab — it's unchanged from Phase 5.5.
      </p>
      <p className="mt-4 text-[12px] text-navy/40">
        Deal: {deal?.title}
      </p>
    </div>
  )
}
