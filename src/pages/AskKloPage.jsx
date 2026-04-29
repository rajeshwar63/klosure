// Phase 6 step 03 — rehouses the existing ManagerKloPanel inside its own
// route. Pipeline data is loaded fresh here so the stub fallback has
// something to reason about.

import { useEffect, useState } from 'react'
import { useProfile } from '../hooks/useProfile.jsx'
import { loadTeamPipeline } from '../services/team.js'
import ManagerKloPanel from '../components/ManagerKloPanel.jsx'
import { Eyebrow } from '../components/shared/index.js'

export default function AskKloPage() {
  const { team, loading: profileLoading } = useProfile()
  const [pipeline, setPipeline] = useState(null)

  useEffect(() => {
    if (profileLoading || !team) return
    let mounted = true
    loadTeamPipeline({ teamId: team.id }).then((res) => {
      if (mounted && !res?.error) setPipeline(res)
    })
    return () => {
      mounted = false
    }
  }, [team, profileLoading])

  if (profileLoading) {
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
        <Eyebrow>Ask Klo</Eyebrow>
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
        <Eyebrow>Ask Klo · Manager mode</Eyebrow>
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
          Interrogate the pipeline.
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: 'var(--klo-text-dim)' }}>
          Klo writes like a senior — short, direct, with the occasional small table.
        </p>
      </header>
      <ManagerKloPanel team={team} pipeline={pipeline} />
    </div>
  )
}
