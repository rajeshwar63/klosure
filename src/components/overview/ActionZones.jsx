import { useState } from 'react'
import { dueTone } from '../../services/overview.js'
import { daysUntil } from '../../lib/format.js'

// Two side-by-side panels: who-owes-what split. Live commitments come from
// the shell's realtime channel — props update on every commitment change so
// items re-sort and counts re-flow without a refetch.
export default function ActionZones({ deal, zones, onItemClick }) {
  const buyerLabel = deal?.buyer_company?.trim() || 'the buyer'
  const sellerLabel = deal?.seller_company?.trim() || 'your team'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Zone
        side="buyer"
        title={`Needed from ${buyerLabel}`}
        subtitle="Their court"
        open={zones.buyer.open}
        done={zones.buyer.done}
        onItemClick={onItemClick}
      />
      <Zone
        side="seller"
        title={`What ${sellerLabel} is doing`}
        subtitle="Moving on our end"
        open={zones.seller.open}
        done={zones.seller.done}
        onItemClick={onItemClick}
      />
    </div>
  )
}

function Zone({ side, title, subtitle, open, done, onItemClick }) {
  const [showDone, setShowDone] = useState(false)
  const tint = side === 'buyer'
    ? 'bg-klo-bg border-klo/30'
    : 'bg-emerald-50 border-emerald-200'
  const titleTone = side === 'buyer' ? 'text-klo' : 'text-emerald-700'
  const overdueCount = open.filter((c) => c.status === 'overdue').length

  return (
    <div className="bg-white border border-navy/10 rounded-xl overflow-hidden flex flex-col">
      <div className={`${tint} border-b px-3 py-2 flex items-start justify-between gap-2`}>
        <div className="min-w-0">
          <div className={`text-[13px] font-semibold ${titleTone} truncate`}>{title}</div>
          <div className="text-[11px] text-navy/50">{subtitle}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] font-semibold text-navy/70">
            {open.length} item{open.length === 1 ? '' : 's'}
          </div>
          {overdueCount > 0 && (
            <div className="text-[10px] text-red-600 font-semibold">
              {overdueCount} overdue
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 divide-y divide-navy/5">
        {open.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-navy/40 italic">
            Nothing pending
          </div>
        ) : (
          open.map((c) => (
            <Item key={c.id} commitment={c} onClick={onItemClick} />
          ))
        )}
      </div>

      {done.length > 0 && (
        <div className="border-t border-navy/10">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="w-full px-3 py-2 text-[11px] font-medium text-navy/50 hover:text-navy flex items-center justify-center gap-1"
          >
            {showDone ? 'Hide' : 'Show'} {done.length} completed
            <span className={`transition-transform ${showDone ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {showDone && (
            <div className="divide-y divide-navy/5 border-t border-navy/10">
              {done.map((c) => (
                <Item key={c.id} commitment={c} onClick={onItemClick} muted />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Item({ commitment, onClick, muted = false }) {
  const { id, task, status, owner_name, owner, due_date } = commitment
  const ownerLabel = owner_name?.trim() || (owner === 'seller' ? 'Seller' : 'Buyer')
  const tone = dueTone(due_date, status)
  const isOverdue = status === 'overdue'

  return (
    <button
      type="button"
      onClick={() => onClick?.(id)}
      className={`w-full text-left px-3 py-2.5 hover:bg-navy/5 transition flex items-start gap-2.5 ${
        isOverdue ? 'bg-red-50/40' : ''
      }`}
    >
      <span
        className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
          isOverdue ? 'bg-red-500'
            : status === 'confirmed' ? 'bg-klo'
            : 'bg-amber-500'
        }`}
      />
      <span className="flex-1 min-w-0">
        <span className={`block text-[13px] leading-snug font-medium ${
          muted ? 'text-navy/40 line-through' : 'text-navy'
        }`}>
          {task}
        </span>
        <span className="flex items-center gap-1.5 mt-0.5 text-[11px] text-navy/50">
          <span className="truncate min-w-0">{ownerLabel}</span>
          <span className="text-navy/20 shrink-0">·</span>
          <span className="shrink-0">
            <DuePill dueDate={due_date} status={status} tone={tone} />
          </span>
        </span>
      </span>
    </button>
  )
}

function DuePill({ dueDate, status, tone }) {
  const text = (() => {
    if (status === 'done') return 'Done'
    if (!dueDate) return 'No due date'
    const d = daysUntil(dueDate)
    if (d === null) return ''
    if (status === 'overdue' || d < 0) return `Overdue ${Math.abs(d)}d`
    if (d === 0) return 'Due today'
    if (d === 1) return 'Due tomorrow'
    return `By ${formatShortDate(dueDate)}`
  })()
  const cls = tone === 'red'
    ? 'bg-red-100 text-red-700'
    : tone === 'amber'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-navy/5 text-navy/60'
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
      {text}
    </span>
  )
}

function formatShortDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
