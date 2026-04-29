// Phase 6 step 03 — rehouses the existing ForecastTab inside its own route.

import { useProfile } from '../hooks/useProfile.jsx'
import ForecastTab from '../components/team/ForecastTab.jsx'
import { Eyebrow } from '../components/shared/index.js'

function currentQuarter() {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3) + 1
  return `Forecast · Q${q}`
}

export default function ForecastPage() {
  const { team, loading } = useProfile()

  if (loading) {
    return (
      <div
        className="p-6 md:p-8 max-w-[960px] mx-auto text-sm"
        style={{ color: 'var(--klo-text-mute)' }}
      >
        Loading…
      </div>
    )
  }
  if (!team) {
    return (
      <div className="p-6 md:p-8 max-w-[960px] mx-auto">
        <Eyebrow>{currentQuarter()}</Eyebrow>
        <h1
          className="mt-3 text-[22px] font-semibold"
          style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
        >
          No team linked to your account.
        </h1>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-[960px] mx-auto">
      <header className="mb-8">
        <Eyebrow>{currentQuarter()}</Eyebrow>
        <h1
          className="mt-3"
          style={{
            fontSize: 'clamp(32px, 4vw, 44px)',
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            color: 'var(--klo-text)',
          }}
        >
          Two forecasts. Yours, and reality.
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: 'var(--klo-text-dim)' }}>
          If they disagree, the rep gets a conversation.
        </p>
      </header>
      <ForecastTab teamId={team.id} />
    </div>
  )
}
