// Phase 6.1 step 05 — Overview tab assembly. Layout, top to bottom:
//   1. DealContextStrip             cream banner with klo_state.summary
//   2. KloRecommendsCard            Klo's primary recommendation
//   3. ConfidenceCompactStrip       collapsible single-line confidence bar
//   4. KloFullReadCollapsed         expandable rationale + all factors
//   5. DealStatStripWide            5-column Stage / Value / Deadline / Health / Stuck
//   6. Two-column row               BlockersPanel | StakeholdersPanel

import KloRecommendsCard from './KloRecommendsCard.jsx'
import ConfidenceCompactStrip from './ConfidenceCompactStrip.jsx'
import DealContextStrip from './DealContextStrip.jsx'
import KloFullReadCollapsed from './KloFullReadCollapsed.jsx'
import DealStatStripWide from './DealStatStripWide.jsx'
import BlockersPanel from './BlockersPanel.jsx'
import StakeholdersPanel from './StakeholdersPanel.jsx'
import RecencyStrip from './RecencyStrip.jsx'
import PendingTasksTwoCol from '../shared/PendingTasksTwoCol.jsx'
import { useStuckFor } from '../../hooks/useStuckFor.js'

export default function OverviewTab({
  deal,
  viewerRole = 'seller',
  onSwitchToChat,
}) {
  const ks = deal?.klo_state ?? {}
  const stuckFor = useStuckFor(deal?.id, ks?.confidence)

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
      <DealContextStrip klo_state={ks} />

      <RecencyStrip dealId={deal?.id} klo_state={ks} />

      <KloRecommendsCard
        klo_state={ks}
        viewerRole={viewerRole}
        onSwitchToChat={onSwitchToChat}
      />

      <div className="my-4">
        <PendingTasksTwoCol kloState={ks} perspective={viewerRole === 'buyer' ? 'buyer' : 'seller'} />
      </div>

      <ConfidenceCompactStrip klo_state={ks} viewerRole={viewerRole} />

      <KloFullReadCollapsed klo_state={ks} viewerRole={viewerRole} />

      <DealStatStripWide deal={deal} klo_state={ks} stuckFor={stuckFor} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <BlockersPanel
          klo_state={ks}
          viewerRole={viewerRole}
          dealId={deal?.id}
        />
        <StakeholdersPanel
          klo_state={ks}
          viewerRole={viewerRole}
          dealId={deal?.id}
          deal={deal}
        />
      </div>
    </div>
  )
}
