// Phase 6 step 08 — dark header at the top of the deal page.
//
// Title + health dot + optional "Stuck · Nw" chip + Share + "Open in chat".
// Subtitle line: company · stage · value · deadline.

import { Link } from 'react-router-dom'
import { formatCurrency, formatDeadline } from '../../lib/format.js'

const STAGE_LABEL = {
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  legal: 'Legal',
  closed: 'Closed',
}

const HEALTH_DOT = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

function weeksAt(deal) {
  // Treat the last update as the closest signal we have for "how long this
  // deal has been at this state". Phase 7 will replace with a real
  // stage_changed_at timestamp.
  const ts = deal?.updated_at || deal?.created_at
  if (!ts) return 0
  const t = new Date(ts).getTime()
  if (Number.isNaN(t)) return 0
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24 * 7))
}

export default function DealHeader({
  deal,
  viewerRole = 'seller',
  canShare = false,
  onShare,
  onOpenChat,
}) {
  const stuck = weeksAt(deal)
  const showStuck = stuck >= 2 && deal?.health !== 'green'
  const stage = STAGE_LABEL[deal?.klo_state?.stage ?? deal?.stage] ?? '—'
  const value =
    deal?.klo_state?.deal_value?.amount ?? deal?.value ?? null

  return (
    <header
      className="text-white px-4 md:px-5 py-3 shrink-0"
      style={{ background: '#2C2C2A' }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${HEALTH_DOT[deal?.health] ?? 'bg-emerald-500'}`}
          aria-hidden
        />
        <h1 className="text-base font-medium truncate min-w-0">{deal?.title}</h1>

        {showStuck && (
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
            style={{ background: '#FAC775', color: '#412402' }}
          >
            ⚠ Stuck · {stuck}w
          </span>
        )}

        <div className="ml-auto flex gap-2 shrink-0">
          {viewerRole === 'seller' && canShare && (
            <button
              type="button"
              onClick={onShare}
              className="px-3 py-1 rounded-md text-xs border border-white/30 bg-transparent text-white hover:bg-white/10"
            >
              Share
            </button>
          )}
          {viewerRole === 'seller' && !canShare && (
            <Link
              to="/billing"
              className="px-3 py-1 rounded-md text-xs border border-white/30 bg-transparent text-white/80 hover:bg-white/10"
              title="Upgrade to share with buyers"
            >
              Share · Pro
            </Link>
          )}
          <button
            type="button"
            onClick={onOpenChat}
            className="px-3 py-1 rounded-md text-xs font-medium"
            style={{ background: '#FFFFFF', color: '#2C2C2A' }}
          >
            Open in chat
          </button>
        </div>
      </div>

      <p className="text-xs text-white/60 mt-1 truncate">
        {[
          deal?.buyer_company,
          stage,
          formatCurrency(value),
          deal?.deadline ? `Deadline ${formatDeadline(deal.deadline)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </header>
  )
}
