// Phase 6 step 10 — Overview tab assembly.
//
// Layout, top to bottom:
//   1. DealContextStrip             cream banner with klo_state.summary
//   2. Two-column row               KloRecommendsCard | ConfidenceSidePanel
//   3. KloFullReadCollapsed         expandable rationale + all factors
//   4. DealStatStripWide            5-column Stage / Value / Deadline / Health / Stuck
//   5. Two-column row               BlockersPanel | CommitmentsPanel
//
// Two-column rows collapse to single-column below 1024px (lg:) so they
// stack readably on phones and small laptops.

import KloRecommendsCard from './KloRecommendsCard.jsx'
import ConfidenceSidePanel from './ConfidenceSidePanel.jsx'
import DealContextStrip from './DealContextStrip.jsx'
import KloFullReadCollapsed from './KloFullReadCollapsed.jsx'
import DealStatStripWide from './DealStatStripWide.jsx'
import BlockersPanel from './BlockersPanel.jsx'
import CommitmentsPanel from './CommitmentsPanel.jsx'
import { useStuckFor } from '../../hooks/useStuckFor.js'

export default function OverviewTab({
  deal,
  viewerRole = 'seller',
  commitments,
  onSwitchToChat,
  onCommitmentJump,
}) {
  const ks = deal?.klo_state ?? {}
  const stuckFor = useStuckFor(deal?.id, ks?.confidence)

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
      <DealContextStrip klo_state={ks} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 mb-4">
        <KloRecommendsCard
          klo_state={ks}
          viewerRole={viewerRole}
          onSwitchToChat={onSwitchToChat}
        />
        {viewerRole === 'seller' && (
          <ConfidenceSidePanel klo_state={ks} />
        )}
      </div>

      <KloFullReadCollapsed klo_state={ks} viewerRole={viewerRole} />

      <DealStatStripWide deal={deal} klo_state={ks} stuckFor={stuckFor} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <BlockersPanel
          klo_state={ks}
          viewerRole={viewerRole}
          dealId={deal?.id}
        />
        <CommitmentsPanel
          commitments={commitments}
          viewerRole={viewerRole}
          onCommitmentJump={onCommitmentJump}
        />
      </div>
    </div>
  )
}
