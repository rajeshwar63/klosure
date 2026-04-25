import { useMemo } from 'react'
import {
  deriveStats,
  splitActionZones,
  deriveTimeline,
} from '../services/overview.js'
import DealStatStrip from './overview/DealStatStrip.jsx'
import StageTracker from './overview/StageTracker.jsx'
import ActionZones from './overview/ActionZones.jsx'
import PeopleGrid from './overview/PeopleGrid.jsx'
import DealTimeline from './overview/DealTimeline.jsx'

// Overview half of the deal room — a structured rendering of the same data
// the chat already exposes, for sellers who want a "deal command center"
// view rather than scrolling chat. Read-mostly: every action still happens
// in the Chat tab. Sections fill in across steps 4-8 of Phase 3.5.
export default function OverviewView({
  deal,
  dealContext,
  role,
  commitments,
  onSwitchToChat,
  onCommitmentClick,
}) {
  const stats = useMemo(() => deriveStats(deal, commitments), [deal, commitments])
  const zones = useMemo(() => splitActionZones(commitments), [commitments])
  const timeline = useMemo(() => deriveTimeline(deal, commitments), [deal, commitments])

  return (
    <main className="flex-1 overflow-y-auto bg-chat-bg/40 px-3 py-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <DealStatStrip stats={stats} />
        <StageTracker deal={deal} />
        <ActionZones deal={deal} zones={zones} onItemClick={onCommitmentClick} />
        <PeopleGrid stakeholders={dealContext?.stakeholders} onSwitchToChat={onSwitchToChat} />
        <DealTimeline events={timeline} />
      </div>
    </main>
  )
}
