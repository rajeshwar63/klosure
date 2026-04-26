// Phase 6 step 12 — manager morning briefing. Mirrors the seller home shape
// (header, big Klo card, action list, glance strip) but scoped to the team.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile.jsx'
import { loadTeamPipeline } from '../services/team.js'
import { fetchManagerWeeklyBrief } from '../services/managerBrief.js'
import KloTeamBriefCard from '../components/manager/KloTeamBriefCard.jsx'
import DealsSlippingList from '../components/manager/DealsSlippingList.jsx'
import QuarterGlanceStrip from '../components/manager/QuarterGlanceStrip.jsx'

function NoTeamPlaceholder() {
  const navigate = useNavigate()
  return (
    <div className="p-12 max-w-[640px] mx-auto text-center">
      <h2 className="text-xl font-medium text-navy mb-2">
        No team linked to your account
      </h2>
      <p className="text-navy/55 text-sm mb-4">
        Set up a team to see the manager view, or switch back to your seller
        view.
      </p>
      <button
        type="button"
        onClick={() => navigate('/today')}
        className="px-4 py-2 rounded-md text-sm font-medium bg-klo text-white"
      >
        Go to seller view
      </button>
    </div>
  )
}

export default function ManagerHomePage() {
  const { team, loading: profileLoading } = useProfile()
  const [pipeline, setPipeline] = useState(null)
  const [brief, setBrief] = useState(null)
  const [briefLoading, setBriefLoading] = useState(true)

  useEffect(() => {
    if (profileLoading || !team?.id) return
    let mounted = true
    loadTeamPipeline({ teamId: team.id }).then((res) => {
      if (mounted) setPipeline(res)
    })
    setBriefLoading(true)
    fetchManagerWeeklyBrief(team.id)
      .then((res) => {
        if (mounted) setBrief(res)
      })
      .finally(() => {
        if (mounted) setBriefLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [team?.id, profileLoading])

  if (profileLoading) {
    return (
      <div className="p-6 md:p-8 max-w-[960px] mx-auto text-sm text-navy/50">
        Loading…
      </div>
    )
  }
  if (!team) return <NoTeamPlaceholder />

  const memberCount = pipeline?.members?.length ?? 0
  const dealsActive = pipeline?.deals?.active ?? []

  return (
    <div className="p-6 md:p-8 max-w-[960px] mx-auto">
      <header className="mb-6">
        <p className="text-xs text-navy/45 mb-1">
          {team.name || 'Team'} · {memberCount} rep{memberCount === 1 ? '' : 's'} ·{' '}
          {dealsActive.length} active deal{dealsActive.length === 1 ? '' : 's'}
        </p>
        <h1 className="text-2xl font-medium text-navy leading-tight">
          This week on your team.
        </h1>
      </header>

      <KloTeamBriefCard
        brief={brief}
        loading={briefLoading}
        pipeline={pipeline}
      />

      <DealsSlippingList deals={dealsActive} />

      <QuarterGlanceStrip deals={dealsActive} />
    </div>
  )
}
