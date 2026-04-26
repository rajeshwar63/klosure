// Phase 6 step 11 — commitments panel with two zones (seller-side / buyer-
// side). Reuses the Phase 3 commitment data model and the proposal/confirm
// flow that ChatView still owns; this panel is purely a read view of what's
// in motion right now.

import { useState } from 'react'

function formatShortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function daysOverdueOf(iso) {
  if (!iso) return 0
  const d = new Date(iso)
  const now = new Date()
  d.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((now - d) / (1000 * 60 * 60 * 24)))
}

function CommitmentRow({ commitment, onJump }) {
  const isOverdue = commitment.status === 'overdue'
  return (
    <button
      type="button"
      onClick={() => onJump?.(commitment.id)}
      className={`text-left rounded-md px-3 py-2 ${
        isOverdue ? 'bg-red-50 hover:bg-red-100' : 'bg-navy/5 hover:bg-navy/10'
      } transition-colors`}
    >
      <div className="text-xs text-navy/85 leading-snug mb-1">
        {commitment.task}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {isOverdue ? (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: '#F09595', color: '#501313' }}
          >
            Overdue {daysOverdueOf(commitment.due_date)}d
          </span>
        ) : (
          commitment.due_date && (
            <span className="text-[10px] text-navy/50">
              due {formatShortDate(commitment.due_date)}
            </span>
          )
        )}
        {commitment.owner_name && (
          <span className="text-[10px] text-navy/50">{commitment.owner_name}</span>
        )}
      </div>
    </button>
  )
}

function CommitmentZone({ label, commitments, emptyMessage, onJump }) {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-wider text-navy/45 mb-1.5">
        {label}
      </div>
      {commitments.length === 0 ? (
        <div className="text-[11px] text-navy/40 italic py-1">
          {emptyMessage}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {commitments.map((c) => (
            <CommitmentRow key={c.id} commitment={c} onJump={onJump} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function CommitmentsPanel({
  commitments,
  viewerRole,
  onCommitmentJump,
}) {
  const [expanded, setExpanded] = useState(true)
  const list = commitments ?? []
  const sellerSide = list.filter(
    (c) => c.owner === 'seller' && c.status !== 'done' && c.status !== 'declined',
  )
  const buyerSide = list.filter(
    (c) => c.owner === 'buyer' && c.status !== 'done' && c.status !== 'declined',
  )
  const total = sellerSide.length + buyerSide.length

  return (
    <div
      className="bg-white rounded-xl p-4 md:p-5"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <div className="flex justify-between items-baseline mb-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-[10px] font-semibold tracking-wider text-navy/55 flex items-center gap-1.5 hover:text-navy"
        >
          <span aria-hidden>{expanded ? '⌃' : '⌄'}</span>
          COMMITMENTS · {total}
        </button>
        {viewerRole === 'seller' && (
          <button
            type="button"
            disabled
            title="Coming soon"
            className="text-[10px] text-klo opacity-40 cursor-not-allowed"
          >
            + Add
          </button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-3">
          <CommitmentZone
            label="What we're doing"
            commitments={sellerSide}
            emptyMessage="Nothing pending on our end"
            onJump={onCommitmentJump}
          />
          <CommitmentZone
            label="Needed from buyer"
            commitments={buyerSide}
            emptyMessage="Nothing pending from them"
            onJump={onCommitmentJump}
          />
        </div>
      )}
    </div>
  )
}
