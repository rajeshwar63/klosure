// Phase 12 — manage billing badge.
// Sibling to TrialCountdownBadge. Once the user upgrades, the trial pill
// disappears and there's no persistent way back to /billing from the shell —
// this fills that gap for paid_active and paid_grace accounts.

import { Link } from 'react-router-dom'
import { useAccountStatus } from '../../hooks/useAccountStatus.jsx'

export default function ManageBillingBadge() {
  const { status, planDef } = useAccountStatus()
  const s = status?.status
  if (s !== 'paid_active' && s !== 'paid_grace') return null

  const planLabel = planDef?.label || 'Plan'
  const label = s === 'paid_grace'
    ? `Billing retry · ${planLabel}`
    : `Manage billing · ${planLabel}`

  const tone = s === 'paid_grace'
    ? { background: 'var(--klo-warning-soft)', color: 'var(--klo-warn)' }
    : { background: 'var(--klo-bg-elev)', color: 'var(--klo-text-dim)' }

  return (
    <Link
      to="/billing"
      className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium klo-mono"
      style={{
        ...tone,
        border: '1px solid var(--klo-line)',
      }}
    >
      {label}
    </Link>
  )
}
