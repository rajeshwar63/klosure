// Phase 8 — two-column commitments view: "On you" vs "On vendor".
// Sources data from the commitments table (separate from klo_state).

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

function CommitmentRow({ c }) {
  const dot = STATUS_DOT[c?.status] || STATUS_DOT.pending
  const due = formatDate(c?.due_date)
  const overdue = c?.status === 'overdue'
  return (
    <li className={`flex gap-3 px-4 py-3 ${overdue ? 'bg-red-50/60' : ''}`}>
      <span className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${dot}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-navy leading-snug line-clamp-2">{c?.task}</p>
        {due && (
          <p className="text-[11px] text-navy/45 mt-0.5">Due {due}</p>
        )}
      </div>
    </li>
  )
}

function Column({ title, items, showDoneToggle, showDone, onToggle, doneCount }) {
  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-4 py-3 border-b border-navy/5 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-navy">{title}</h4>
        <span className="text-[11px] text-navy/45">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-5 text-sm text-navy/55">No pending items</div>
      ) : (
        <ul className="divide-y divide-navy/5">
          {items.map((c) => (
            <CommitmentRow key={c.id} c={c} />
          ))}
        </ul>
      )}
      {showDoneToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="w-full text-[11px] text-klo hover:underline px-4 py-2.5 border-t border-navy/5"
        >
          {showDone ? 'Hide completed' : `Show completed (${doneCount})`}
        </button>
      )}
    </div>
  )
}

export default function BuyerCommitmentsTwoCol({ commitments }) {
  const [showDoneOnYou, setShowDoneOnYou] = useState(false)
  const [showDoneOnVendor, setShowDoneOnVendor] = useState(false)

  const all = commitments ?? []
  const onYouAll = all.filter((c) => c.owner === 'buyer')
  const onVendorAll = all.filter((c) => c.owner === 'seller')

  const onYouActive = onYouAll.filter((c) => c.status !== 'done')
  const onYouDone = onYouAll.filter((c) => c.status === 'done')
  const onVendorActive = onVendorAll.filter((c) => c.status !== 'done')
  const onVendorDone = onVendorAll.filter((c) => c.status === 'done')

  const onYouItems = showDoneOnYou ? onYouAll : onYouActive
  const onVendorItems = showDoneOnVendor ? onVendorAll : onVendorActive

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Column
        title="On you"
        items={onYouItems}
        showDoneToggle={onYouDone.length > 0}
        showDone={showDoneOnYou}
        onToggle={() => setShowDoneOnYou((v) => !v)}
        doneCount={onYouDone.length}
      />
      <Column
        title="On vendor"
        items={onVendorItems}
        showDoneToggle={onVendorDone.length > 0}
        showDone={showDoneOnVendor}
        onToggle={() => setShowDoneOnVendor((v) => !v)}
        doneCount={onVendorDone.length}
      />
    </div>
  )
}
