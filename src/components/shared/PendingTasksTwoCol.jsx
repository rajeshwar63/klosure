// Phase 9 step 04 — shared "On you / On vendor" two-column component.
// Reads from klo_state.pending_on_seller / pending_on_buyer (extracted by
// Klo from chat, see Phase 9 step 03). Used by the buyer dashboard and the
// seller's Overview tab — the perspective prop swaps which array maps to
// which column.

import { useState } from 'react'

const STATUS_DOT = {
  pending: 'bg-amber-500',
  overdue: 'bg-red-500',
  done: 'bg-emerald-500',
}

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function isOverdueClient(task) {
  if (task?.status === 'overdue') return true
  if (task?.status === 'done') return false
  if (!task?.due_date) return false
  const due = new Date(task.due_date)
  if (Number.isNaN(due.getTime())) return false
  return due.getTime() < Date.now()
}

function PendingTaskRow({ task, muted = false }) {
  const overdue = isOverdueClient(task)
  const dot = task?.status === 'done'
    ? STATUS_DOT.done
    : overdue
      ? STATUS_DOT.overdue
      : STATUS_DOT.pending
  const due = formatDate(task?.due_date)
  return (
    <li className={`flex gap-3 px-4 py-3 ${overdue && task?.status !== 'done' ? 'bg-red-50/60' : ''} ${muted ? 'opacity-50' : ''}`}>
      <span className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${dot}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-navy leading-snug line-clamp-2">{task?.task}</p>
        {due && <p className="text-[11px] text-navy/45 mt-0.5">Due {due}</p>}
      </div>
    </li>
  )
}

function Column({ title, items, completed, emptyText }) {
  const [showCompleted, setShowCompleted] = useState(false)
  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-4 py-3 border-b border-navy/5 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-navy">{title}</h4>
        <span className="text-[11px] text-navy/45">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-5 text-sm text-navy/55">{emptyText}</div>
      ) : (
        <ul className="divide-y divide-navy/5">
          {items.map((t) => (
            <PendingTaskRow key={t.id} task={t} />
          ))}
        </ul>
      )}
      {completed.length > 0 && (
        <button
          type="button"
          onClick={() => setShowCompleted((v) => !v)}
          className="w-full text-[11px] text-klo hover:underline px-4 py-2.5 border-t border-navy/5"
        >
          {showCompleted ? 'Hide completed' : `Show completed (${completed.length})`}
        </button>
      )}
      {showCompleted && completed.length > 0 && (
        <ul className="divide-y divide-navy/5 border-t border-navy/5">
          {completed.map((t) => (
            <PendingTaskRow key={t.id} task={t} muted />
          ))}
        </ul>
      )}
    </div>
  )
}

export default function PendingTasksTwoCol({ kloState, perspective = 'seller' }) {
  const isSellerView = perspective === 'seller'

  const onYouAll = isSellerView
    ? kloState?.pending_on_seller ?? []
    : kloState?.pending_on_buyer ?? []
  const onVendorAll = isSellerView
    ? kloState?.pending_on_buyer ?? []
    : kloState?.pending_on_seller ?? []

  const onYouActive = onYouAll.filter((t) => t.status !== 'done')
  const onYouDone = onYouAll.filter((t) => t.status === 'done')
  const onVendorActive = onVendorAll.filter((t) => t.status !== 'done')
  const onVendorDone = onVendorAll.filter((t) => t.status === 'done')

  const leftTitle = isSellerView ? 'On your team' : 'On you'
  const rightTitle = isSellerView ? 'On buyer team' : 'On vendor'
  const leftEmpty = isSellerView ? 'No pending items on your team' : 'No pending items on you'
  const rightEmpty = isSellerView ? 'No pending items on buyer team' : 'No pending items on vendor'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Column
        title={leftTitle}
        items={onYouActive}
        completed={onYouDone}
        emptyText={leftEmpty}
      />
      <Column
        title={rightTitle}
        items={onVendorActive}
        completed={onVendorDone}
        emptyText={rightEmpty}
      />
    </div>
  )
}
