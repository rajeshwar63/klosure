// Phase 6 — single deal row in the sidebar deal list.
//
// Inactive: ● Title                         42
// Active:   ● Title                         42
//             Stuck · 5w · 1 overdue
//
// Health dot color encodes the at-a-glance read of the deal:
//   green  = on track (confidence >= 60)
//   amber  = stuck / slipping (confidence 30-59 OR slipping >= 10pts)
//   red    = at risk (confidence < 30 OR multiple overdue commitments)
//   gray   = unknown (no klo_state.confidence yet)
// "Worse" wins when multiple conditions match.

import Tooltip from '../Tooltip.jsx'

const STAGE_LABEL = {
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  legal: 'Legal',
  closed: 'Closed',
}

export function dealHealth(deal) {
  const c = deal?.klo_state?.confidence
  const v = c?.value
  const slipping =
    c?.trend === 'down' && typeof c?.delta === 'number' && c.delta <= -10
  const overdue = deal?.overdueCount ?? 0
  if (v == null) return 'gray'
  if (v < 30 || overdue > 1) return 'red'
  if (v < 60 || slipping) return 'amber'
  return 'green'
}

const DOT_COLOR = {
  green: 'var(--color-health-green)',
  amber: 'var(--color-health-amber)',
  red: 'var(--color-health-red)',
  gray: 'var(--color-health-gray)',
}

function confidenceColor(value, isActive) {
  if (value == null) return 'text-navy/40'
  if (isActive) return 'text-navy/60'
  if (value >= 60) return 'text-[color:var(--color-health-green)]'
  if (value >= 30) return 'text-[color:var(--color-health-amber)]'
  return 'text-[color:var(--color-health-red)]'
}

function weeksSince(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const weeks = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24 * 7))
  return weeks > 0 ? weeks : null
}

function activeSubtitle(deal, health) {
  const parts = []
  const stage = deal?.klo_state?.stage
  if (stage && STAGE_LABEL[stage]) {
    parts.push(STAGE_LABEL[stage])
  } else if (health === 'amber') {
    parts.push('Stuck')
  } else if (health === 'red') {
    parts.push('At risk')
  }

  const weeks = weeksSince(deal?.updated_at || deal?.created_at)
  if (weeks != null) parts.push(`${weeks}w`)

  const overdue = deal?.overdueCount ?? 0
  if (overdue > 0) parts.push(`${overdue} overdue`)

  return parts.join(' · ')
}

export default function SidebarDealRow({
  deal,
  isActive = false,
  showSubtitle = false,
  collapsed = false,
  onClick,
}) {
  const health = dealHealth(deal)
  const dotStyle = { background: DOT_COLOR[health] }
  const v = deal?.klo_state?.confidence?.value

  if (collapsed) {
    return (
      <Tooltip content={deal.title}>
        <button
          type="button"
          onClick={onClick}
          aria-label={deal.title}
          className={`w-full flex items-center justify-center py-1.5 rounded-md ${
            isActive ? 'bg-white' : 'hover:bg-navy/5'
          }`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={dotStyle}
            aria-hidden
          />
        </button>
      </Tooltip>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-md px-2 py-1.5 transition-colors ${
        isActive ? 'bg-white' : 'hover:bg-navy/5'
      }`}
      style={
        isActive
          ? { boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.18)' }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={dotStyle}
          aria-hidden
        />
        <span
          className={`flex-1 min-w-0 truncate text-[13px] ${
            isActive ? 'text-navy font-semibold' : 'text-navy/80'
          }`}
        >
          {deal.title}
        </span>
        {v != null && (
          <span
            className={`text-[12px] font-medium tabular-nums ${confidenceColor(
              v,
              isActive,
            )}`}
          >
            {Math.round(v)}
          </span>
        )}
      </div>
      {isActive && showSubtitle && (
        <div className="ml-3.5 mt-0.5 text-[11px] text-navy/55 truncate">
          {activeSubtitle(deal, health)}
        </div>
      )}
    </button>
  )
}
