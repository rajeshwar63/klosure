// Three-row layout for the dealroom: top breadcrumb bar, then a two-column
// body (scrolling canvas + persistent right rail). On screens < 1180px the
// right rail collapses to a tab toggle in the breadcrumb bar.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import HeroBlock from './HeroBlock.jsx'
import KloReadBlock from './KloReadBlock.jsx'
import RiskStrip from './RiskStrip.jsx'
import CommitmentsBlock from './CommitmentsBlock.jsx'
import StakeholdersBlock from './StakeholdersBlock.jsx'
import GroundCoveredBlock from './GroundCoveredBlock.jsx'
import ActivityLogBlock from './ActivityLogBlock.jsx'
import ContextBlock from './ContextBlock.jsx'
import RightRail from './RightRail.jsx'

function isWideViewport() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(min-width: 1180px)').matches
}

export default function DealroomLayout({
  deal,
  dealContext,
  messages,
  setMessages,
  commitments,
  kloThinking,
  setKloThinking,
  sellerName,
  canShare,
  onShare,
  onOpenBuyerChat,
}) {
  const [wide, setWide] = useState(isWideViewport)
  const [showRailMobile, setShowRailMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 1180px)')
    const handler = (e) => setWide(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const railVisible = wide || showRailMobile

  return (
    <div className="dealroom h-full flex flex-col" style={{ background: 'var(--dr-bg)' }}>
      {/* Breadcrumb / action bar */}
      <div
        className="flex items-center gap-2.5 px-5 md:px-8 py-2.5 shrink-0"
        style={{
          borderBottom: '1px solid var(--dr-line)',
          background: 'rgba(250, 250, 249, 0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <Link
          to="/deals"
          className="dr-mono text-[12px]"
          style={{ color: 'var(--dr-ink-3)', textDecoration: 'none' }}
        >
          Deals
        </Link>
        <span style={{ color: 'var(--dr-ink-4)', fontSize: 10 }}>/</span>
        <span
          className="dr-mono text-[12px] truncate font-medium"
          style={{ color: 'var(--dr-ink)' }}
          title={deal?.title}
        >
          {deal?.title}
        </span>
        <div className="flex-1" />
        {!wide && (
          <button
            type="button"
            className="dr-btn"
            onClick={() => setShowRailMobile((v) => !v)}
          >
            {showRailMobile ? 'Hide Klo' : 'Klo'}
          </button>
        )}
        <button
          type="button"
          className="dr-btn"
          onClick={() => onOpenBuyerChat()}
        >
          Chat with buyer
        </button>
        {canShare ? (
          <button type="button" className="dr-btn" onClick={onShare}>
            Share
          </button>
        ) : (
          <Link to="/billing" className="dr-btn" title="Upgrade to share with buyers">
            Share · Pro
          </Link>
        )}
        <button type="button" className="dr-btn dr-btn--primary">
          Mark won
        </button>
      </div>

      {/* Body: canvas + (optional) right rail */}
      <div
        className="flex-1 min-h-0 grid"
        style={{
          gridTemplateColumns: railVisible
            ? wide
              ? '1fr 340px'
              : '1fr 320px'
            : '1fr',
        }}
      >
        <main className="overflow-y-auto" style={{ background: 'var(--dr-bg)' }}>
          <div className="max-w-[760px] mx-auto px-5 md:px-8 pt-7 pb-20">
            <HeroBlock deal={deal} messages={messages} />

            <KloReadBlock
              deal={deal}
              onDraftMessage={onOpenBuyerChat}
            />

            <RiskStrip deal={deal} commitments={commitments} />

            <CommitmentsBlock
              deal={deal}
              commitments={commitments}
            />

            <StakeholdersBlock
              deal={deal}
              dealContext={dealContext}
              sellerName={sellerName}
            />

            <GroundCoveredBlock
              deal={deal}
              commitments={commitments}
            />

            <ActivityLogBlock
              deal={deal}
              commitments={commitments}
              messages={messages}
            />

            <ContextBlock deal={deal} dealContext={dealContext} />
          </div>
        </main>

        {railVisible && (
          <aside
            className="overflow-y-auto"
            style={{
              background: 'var(--dr-rail)',
              borderLeft: '1px solid var(--dr-line)',
            }}
          >
            <RightRail
              deal={deal}
              messages={messages}
              setMessages={setMessages}
              commitments={commitments}
              kloThinking={kloThinking}
              setKloThinking={setKloThinking}
            />
          </aside>
        )}
      </div>
    </div>
  )
}
