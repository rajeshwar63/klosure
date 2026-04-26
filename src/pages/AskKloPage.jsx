// Phase 6 step 03 — rehouses the existing ManagerKloPanel inside its own
// route. Pipeline data is loaded fresh here so the stub fallback has
// something to reason about.

import { useEffect, useState } from 'react'
import { useProfile } from '../hooks/useProfile.jsx'
import { loadTeamPipeline } from '../services/team.js'
import ManagerKloPanel from '../components/ManagerKloPanel.jsx'

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
      <div className="p-6 md:p-8 max-w-[960px] mx-auto text-sm text-navy/50">
        Loading…
      </div>
    )
  }
  if (!team) {
    return (
      <div className="p-6 md:p-8 max-w-[960px] mx-auto">
        <h1 className="text-xl font-medium text-navy mb-2">Ask Klo</h1>
        <p className="text-sm text-navy/60">No team linked to your account.</p>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-[960px] mx-auto">
      <h1 className="text-xl font-medium text-navy mb-4">Ask Klo</h1>
      <ManagerKloPanel team={team} pipeline={pipeline} />
    </div>
  )
}
