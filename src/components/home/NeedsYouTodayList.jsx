// Phase 6 step 06 — flat list of action items across the seller's pipeline.
//
// Three categories, in priority order:
//   1. Overdue commitments (red dot)
//   2. Commitments due today (amber dot)
//   3. Slipping deals — confidence dropped >=10pts and no commitment item
//      already covers that deal
// Capped at 5; if more qualify, link to /deals.

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function daysOverdue(due) {
  if (!due) return 0
  const dueDate = new Date(due)
  const now = new Date()
  dueDate.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((now - dueDate) / (1000 * 60 * 60 * 24)))
}

function isDueToday(due) {
  if (!due) return false
  const d = new Date(due)
  if (Number.isNaN(d.getTime())) return false
  return isSameDay(d, new Date())
}

function isPending(status) {
  return status === 'confirmed' || status === 'proposed'
}

export function computeNeedsYouToday(deals) {
  const items = []
  const dealsCovered = new Set()

  for (const deal of deals || []) {
    if (deal.status !== 'active') continue
    const commitments = deal.commitments || []

    for (const c of commitments) {
      if (c.owner !== 'seller') continue
      if (c.status !== 'overdue') continue
      const od = daysOverdue(c.due_date)
      items.push({
        key: `overdue:${c.id}`,
        severity: 'overdue',
        dot: 'red',
        title: c.task,
        subtitle: `${deal.title} · overdue ${od}d`,
        dealId: deal.id,
        sortKey: -od * 100, // most overdue first
      })
      dealsCovered.add(deal.id)
    }

    for (const c of commitments) {
      if (c.owner !== 'seller') continue
      if (!isPending(c.status)) continue
      if (!isDueToday(c.due_date)) continue
      items.push({
        key: `today:${c.id}`,
        severity: 'today',
        dot: 'amber',
        title: c.task,
        subtitle: `${deal.title} · due today`,
        dealId: deal.id,
        sortKey: 0,
      })
      dealsCovered.add(deal.id)
    }

    if (!dealsCovered.has(deal.id)) {
      const c = deal.klo_state?.confidence
      if (c?.trend === 'down' && typeof c?.delta === 'number' && c.delta <= -10) {
        const company = deal.buyer_company || deal.title
        items.push({
          key: `slip:${deal.id}`,
          severity: 'slipping',
          dot: 'amber',
          title: `${company} has been silent`,
          subtitle: `Confidence dropped ${Math.abs(c.delta)} pts this week`,
          dealId: deal.id,
          sortKey: c.delta, // bigger drop = smaller value = higher priority
        })
      }
    }
  }

  items.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey
    return (a.dealId || '').localeCompare(b.dealId || '')
  })
  return items
}

const DOT_BG = {
  red: 'var(--color-health-red)',
  amber: 'var(--color-health-amber)',
  green: 'var(--color-health-green)',
}

function NeedsRow({ item, onOpen }) {
  return (
    <div
      className="bg-white rounded-md px-4 py-3 flex items-center gap-3"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: DOT_BG[item.dot] || DOT_BG.amber }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-navy truncate">{item.title}</div>
        <div className="text-xs text-navy/55 truncate">{item.subtitle}</div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="px-3 py-1 rounded-md text-xs text-navy/80 shrink-0"
        style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.18)' }}
      >
        Open
      </button>
    </div>
  )
}

function SkeletonRow() {
  return (
    <div
      className="bg-white rounded-md px-4 py-3 flex items-center gap-3 animate-pulse"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.08)' }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-navy/15 shrink-0" />
      <div className="flex-1">
        <div className="h-3 w-3/5 rounded bg-navy/10 mb-1.5" />
        <div className="h-2.5 w-2/5 rounded bg-navy/10" />
      </div>
      <span className="w-12 h-6 rounded bg-navy/10" />
    </div>
  )
}

export default function NeedsYouTodayList({ deals, loading }) {
  const navigate = useNavigate()
  const items = useMemo(() => computeNeedsYouToday(deals || []), [deals])

  if (loading) {
    return (
      <section className="mb-6">
        <div className="text-[10px] font-semibold tracking-wider text-navy/45 mb-2">
          NEEDS YOU TODAY
        </div>
        <div className="flex flex-col gap-1.5">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </section>
    )
  }

  const hasActiveDeals = (deals || []).some((d) => d.status === 'active')
  if (!hasActiveDeals) return null

  const visible = items.slice(0, 5)
  const overflow = items.length - visible.length

  if (visible.length === 0) {
    return (
      <section className="mb-6">
        <div className="text-[10px] font-semibold tracking-wider text-navy/45 mb-2">
          NEEDS YOU TODAY · 0
        </div>
        <div
          className="bg-white rounded-md px-4 py-3 text-sm text-navy/60"
          style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.10)' }}
        >
          ✓ You're caught up. Spend the day on outbound or your biggest open deal.
        </div>
      </section>
    )
  }

  return (
    <section className="mb-6">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] font-semibold tracking-wider text-navy/45">
          NEEDS YOU TODAY · {items.length}
        </span>
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => navigate('/deals')}
            className="text-[11px] text-klo hover:underline"
          >
            + {overflow} more
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {visible.map((item) => (
          <NeedsRow
            key={item.key}
            item={item}
            onOpen={() => navigate(`/deals/${item.dealId}`)}
          />
        ))}
      </div>
    </section>
  )
}
