// Phase 8 — buyer dashboard empty state. Shown when klo_state.buyer_view
// hasn't been generated yet (deal is brand new, or not enough chat to
// produce something useful).

export default function BuyerEmptyState() {
  return (
    <div className="px-6 py-20 max-w-md mx-auto text-center">
      <div className="text-klo text-3xl mb-4" aria-hidden>◆</div>
      <h2 className="text-xl font-semibold text-navy mb-3">
        Building your dashboard…
      </h2>
      <p className="text-sm text-navy/60 leading-relaxed">
        Klo creates this dashboard from your conversations with the vendor.
        As the deal develops, this page fills in with your action items,
        stakeholder map, and timeline.
      </p>
      <p className="text-xs text-navy/40 mt-6">
        Check back in a few minutes.
      </p>
    </div>
  )
}
