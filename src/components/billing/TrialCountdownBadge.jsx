// Phase 12.1 — trial countdown badge.
// Subtle pill in the shell that shows days left in trial. Tone shifts to
// warning at ≤7 days, urgent at ≤3 days. Clicks through to /billing.

import { Link } from 'react-router-dom'
import { useAccountStatus } from '../../hooks/useAccountStatus.jsx'

export default function TrialCountdownBadge() {
  const { isTrialing, daysLeftInTrial } = useAccountStatus()
  if (!isTrialing) return null
  const days = Math.max(0, Math.ceil(daysLeftInTrial ?? 0))
  if (days > 14) return null

  const tone = days <= 3 ? 'urgent' : days <= 7 ? 'warning' : 'info'
  const label =
    days === 0 ? 'Trial ends today' :
    days === 1 ? '1 day left in trial' :
    `${days} days left in trial`

  const background =
    tone === 'urgent' ? 'var(--klo-danger-soft)' :
    tone === 'warning' ? 'var(--klo-warning-soft)' :
    'var(--klo-bg-elev)'
  const color =
    tone === 'urgent' ? 'var(--klo-danger)' :
    tone === 'warning' ? 'var(--klo-warn)' :
    'var(--klo-text-dim)'

  return (
    <Link
      to="/billing"
      className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium klo-mono"
      style={{
        background,
        color,
        border: '1px solid var(--klo-line)',
      }}
    >
      {label}
    </Link>
  )
}
