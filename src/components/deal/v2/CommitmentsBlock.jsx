// Commitments — split into "You owe" (owner='seller') and "They owe"
// (owner='buyer'), with overdue / due-soon visual states. Inline mark-done
// for seller-side commitments (uses existing services/commitments.js).

import { useState } from 'react'
import { markCommitmentDone } from '../../../services/commitments.js'

function diffDays(iso) {
  if (!iso) return null
  const target = new Date(iso)
  const today = new Date()
  target.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today) / (1000 * 60 * 60 * 24))
}

function dueLabel(iso) {
  if (!iso) return ''
  const days = diffDays(iso)
  if (days === null) return ''
  if (days < 0) return `${Math.abs(days)} days late`
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days <= 7) return `in ${days} days`
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function CommitmentRow({ commitment, side, onMarkDone, busy }) {
  const days = diffDays(commitment.due_date)
  const isOverdue =
    commitment.status === 'overdue' || (days !== null && days < 0)
  const isDueSoon = !isOverdue && days !== null && days <= 3

  const dotColor = isOverdue
    ? 'var(--dr-bad)'
    : isDueSoon
      ? 'var(--dr-warn)'
      : 'var(--dr-ink-4)'
  const dueColor = isOverdue
    ? 'var(--dr-bad)'
    : isDueSoon
      ? 'var(--dr-warn)'
      : 'var(--dr-ink-3)'

  return (
    <div
      className="grid items-center gap-4 -mx-2 px-2 py-3 rounded-[4px] hover:bg-[color:var(--dr-bg-2)]"
      style={{
        gridTemplateColumns: '1fr auto auto auto',
        borderBottom: '1px solid var(--dr-line)',
      }}
    >
      <div
        className="relative pl-3.5"
        style={{ fontSize: 13.5, color: 'var(--dr-ink)', lineHeight: 1.4 }}
      >
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
          style={{ width: 6, height: 6, background: dotColor }}
        />
        {commitment.task}
      </div>
      <div
        className="dr-mono"
        style={{ fontSize: 11, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}
      >
        {side === 'seller' ? '→' : '←'} {commitment.owner_name || (side === 'seller' ? 'You' : 'Buyer')}
      </div>
      <div
        className="dr-mono text-right"
        style={{ fontSize: 11.5, color: dueColor, minWidth: 100, fontWeight: isOverdue ? 500 : 400 }}
      >
        {dueLabel(commitment.due_date) || '—'}
      </div>
      {side === 'seller' && commitment.status !== 'done' && commitment.status !== 'declined' ? (
        <button
          type="button"
          className="dr-btn"
          style={{ fontSize: 11, padding: '3px 8px' }}
          onClick={() => onMarkDone(commitment.id)}
          disabled={busy}
        >
          Done
        </button>
      ) : (
        <span style={{ width: 50 }} aria-hidden />
      )}
    </div>
  )
}

function Group({ title, items, side, onMarkDone, busyId }) {
  if (items.length === 0) return null
  return (
    <div className="mt-2">
      <div
        className="dr-mono py-1.5"
        style={{ fontSize: 10.5, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}
      >
        — {title}
      </div>
      <div>
        {items.map((c) => (
          <CommitmentRow
            key={c.id}
            commitment={c}
            side={side}
            onMarkDone={onMarkDone}
            busy={busyId === c.id}
          />
        ))}
      </div>
    </div>
  )
}

export default function CommitmentsBlock({ commitments }) {
  const [busyId, setBusyId] = useState(null)
  const open = (commitments ?? []).filter(
    (c) => c.status !== 'done' && c.status !== 'declined',
  )
  const youOwe = open.filter((c) => c.owner === 'seller')
  .sort((a, b) => (a.due_date ?? '') > (b.due_date ?? '') ? 1 : -1)
  const theyOwe = open.filter((c) => c.owner === 'buyer')
  .sort((a, b) => (a.due_date ?? '') > (b.due_date ?? '') ? 1 : -1)

  const overdueCount = open.filter((c) => {
    const d = c.due_date && new Date(c.due_date)
    return c.status === 'overdue' || (d && d < new Date())
  }).length

  async function handleMarkDone(id) {
    setBusyId(id)
    await markCommitmentDone({ commitmentId: id })
    setBusyId(null)
  }

  return (
    <section className="dr-card mb-4">
      <div className="dr-card-head">
        <h3>Commitments</h3>
        <div
          className="dr-mono"
          style={{ fontSize: 10.5, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
        >
          {open.length} open · {overdueCount} overdue
        </div>
      </div>
      <div className="dr-card-body">
        {open.length === 0 ? (
          <p style={{ color: 'var(--dr-ink-3)', fontSize: 13, padding: '8px 0' }}>
            No open commitments. When you or the buyer commits to something
            with a date, Klo will lock it here.
          </p>
        ) : (
          <>
            <Group
              title="You owe"
              items={youOwe}
              side="seller"
              onMarkDone={handleMarkDone}
              busyId={busyId}
            />
            <Group
              title="They owe"
              items={theyOwe}
              side="buyer"
              onMarkDone={handleMarkDone}
              busyId={busyId}
            />
          </>
        )}
      </div>
    </section>
  )
}
