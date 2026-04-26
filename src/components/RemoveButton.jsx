import { useState } from 'react'
import { requestRemoval } from '../services/removal.js'

// Phase 4.5: × button on every removable Overview item. Click → inline reason
// prompt → calls klo-removal. The point of the reason prompt is friction:
// removing a person/blocker/question is not "edit reality", it's recording
// "Klo got this wrong because…". Klo reads removed_items every turn and never
// re-adds the value.
export default function RemoveButton({
  dealId,
  kind,
  match,
  label,
  addedAt,
  onRemoved,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Race-protection: items added in the last 10s can't be removed yet. This
  // catches a class of UX bug where the seller × clicks an item Klo just
  // wrote in the same turn (the seller hasn't read it yet).
  const tooNew = addedAt && Date.now() - new Date(addedAt).getTime() < 10_000

  async function submit(e) {
    e?.preventDefault?.()
    if (!reason.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await requestRemoval({ dealId, kind, match, reason: reason.trim() })
      setOpen(false)
      setReason('')
      onRemoved?.()
    } catch (err) {
      setError(err.message || 'Could not remove')
    } finally {
      setSubmitting(false)
    }
  }

  if (tooNew) {
    return (
      <span
        className={`text-navy/20 text-sm leading-none cursor-not-allowed ${className}`}
        title="Just added — wait a moment"
      >
        ×
      </span>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Remove ${label}`}
        className={`text-navy/30 hover:text-red-600 text-sm leading-none px-1 ${className}`}
      >
        ×
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className={`flex flex-col gap-1.5 bg-white border border-klo/40 rounded-lg p-2 shadow-sm ${className}`}
    >
      <input
        autoFocus
        type="text"
        placeholder={`Why is "${label}" wrong?`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            setReason('')
            setError('')
          }
        }}
        disabled={submitting}
        className="text-[12px] border border-navy/15 rounded px-2 py-1 focus:outline-none focus:border-klo focus:ring-1 focus:ring-klo/20"
      />
      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={submitting || !reason.trim()}
          className="flex-1 text-[11px] font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded px-2 py-1"
        >
          {submitting ? 'Removing…' : 'Remove'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setReason('')
            setError('')
          }}
          className="flex-1 text-[11px] font-semibold bg-white border border-navy/15 text-navy/70 rounded px-2 py-1"
        >
          Cancel
        </button>
      </div>
      {error && <div className="text-[11px] text-red-700">{error}</div>}
    </form>
  )
}
