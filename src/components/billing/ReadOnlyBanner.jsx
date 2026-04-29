// Phase 12.1 — read-only banner.
// Shown across every authenticated page when the account is in a read-only
// state (trial expired, cancelled, pending deletion). Persistent — there's
// no dismiss; the user has to upgrade to clear it.

import { Link } from 'react-router-dom'
import { useAccountStatus } from '../../hooks/useAccountStatus.jsx'

export default function ReadOnlyBanner() {
  const { isReadOnly, status } = useAccountStatus()
  if (!isReadOnly) return null

  const isPendingDeletion = status?.status === 'pending_deletion'
  const message = isPendingDeletion
    ? 'Your account is scheduled for deletion. Upgrade now to keep your data.'
    : 'Your trial ended. Klosure is in read-only mode — upgrade to keep coaching deals.'

  return (
    <div
      className="px-4 py-3 text-sm flex items-center justify-between gap-4 flex-wrap"
      style={{
        background: isPendingDeletion ? 'var(--klo-danger-soft)' : 'var(--klo-warning-soft)',
        borderBottom: '1px solid var(--klo-line)',
        color: 'var(--klo-text)',
      }}
    >
      <span>{message}</span>
      <Link
        to="/billing"
        className="px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap"
        style={{ background: 'var(--klo-accent)', color: 'white' }}
      >
        See plans
      </Link>
    </div>
  )
}
