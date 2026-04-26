// Phase 6 step 11 — 5-column stat row beneath KloFullReadCollapsed.
// Stage / Value / Deadline / Health / Stuck for. Collapses to 2-3 columns
// on narrow screens.

import { formatCurrency, daysUntil } from '../../lib/format.js'

const STAGE_LABEL = {
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  legal: 'Legal',
  closed: 'Closed',
}

const STAGE_INDEX = {
  discovery: 1,
  proposal: 2,
  negotiation: 3,
  legal: 4,
  closed: 5,
}

const HEALTH_LABEL = {
  green: 'On track',
  amber: 'Stuck',
  red: 'At risk',
}

const HEALTH_COLOR = {
  green: 'var(--color-health-green)',
  amber: 'var(--color-health-amber)',
  red: 'var(--color-health-red)',
}

function formatShortDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function Stat({ label, value, sub, valueColor, subColor }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/45 mb-1">
        {label}
      </div>
      <div
        className="text-base font-medium leading-tight"
        style={{ color: valueColor || '#1A1A2E' }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="text-[11px] mt-0.5"
          style={{ color: subColor || 'rgba(26,26,46,0.45)' }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

function stuckValueLabel(stuckFor) {
  if (stuckFor == null) return '—'
  if (stuckFor.weeks <= 0) return 'Not stuck'
  return `${stuckFor.weeks} week${stuckFor.weeks === 1 ? '' : 's'}`
}

export default function DealStatStripWide({ deal, klo_state, stuckFor }) {
  const stage = klo_state?.stage ?? deal?.stage
  const stageLabel = STAGE_LABEL[stage] ?? '—'
  const stageIdx = STAGE_INDEX[stage]
  const value =
    klo_state?.deal_value?.amount ?? deal?.value ?? null
  const valueTentative = klo_state?.deal_value?.confidence === 'tentative'
  const deadline = klo_state?.deadline?.date ?? deal?.deadline
  const days = daysUntil(deadline)
  const stuckValue = stuckValueLabel(stuckFor)
  const stuckIsRed = stuckFor != null && stuckFor.weeks >= 2
  const stuckSub = stuckFor?.since ? `since ${formatShortDate(stuckFor.since)}` : null

  return (
    <div
      className="bg-white rounded-xl p-4 md:p-5 mb-4 grid grid-cols-2 md:grid-cols-5 gap-4"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <Stat
        label="STAGE"
        value={stageLabel}
        sub={stageIdx ? `${stageIdx} of 5` : null}
      />
      <Stat
        label="VALUE"
        value={formatCurrency(value)}
        valueColor={valueTentative ? '#BA7517' : undefined}
        sub={valueTentative ? 'tentative' : null}
        subColor={valueTentative ? '#BA7517' : undefined}
      />
      <Stat
        label="DEADLINE"
        value={formatShortDate(deadline)}
        sub={
          days == null
            ? null
            : days < 0
              ? `${Math.abs(days)}d overdue`
              : days === 0
                ? 'today'
                : `${days} days`
        }
      />
      <Stat
        label="HEALTH"
        value={
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: HEALTH_COLOR[deal?.health] || HEALTH_COLOR.green }}
            />
            {HEALTH_LABEL[deal?.health] || 'On track'}
          </span>
        }
        sub={deal?.health === 'green' ? 'No tentative items' : 'resolve in chat'}
      />
      <Stat
        label="STUCK FOR"
        value={stuckValue}
        valueColor={stuckIsRed ? '#A32D2D' : undefined}
        sub={stuckSub}
      />
    </div>
  )
}
