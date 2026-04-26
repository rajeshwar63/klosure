// Phase 6 step 03 — rehouses the existing ForecastTab inside its own route.

import { useProfile } from '../hooks/useProfile.jsx'
import ForecastTab from '../components/team/ForecastTab.jsx'

export default function ForecastPage() {
  const { team, loading } = useProfile()

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-[960px] mx-auto text-sm text-navy/50">
        Loading…
      </div>
    )
  }
  if (!team) {
    return (
      <div className="p-6 md:p-8 max-w-[960px] mx-auto">
        <h1 className="text-xl font-medium text-navy mb-2">Forecast</h1>
        <p className="text-sm text-navy/60">No team linked to your account.</p>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-[960px] mx-auto">
      <h1 className="text-xl font-medium text-navy mb-4">Forecast</h1>
      <ForecastTab teamId={team.id} />
    </div>
  )
}
