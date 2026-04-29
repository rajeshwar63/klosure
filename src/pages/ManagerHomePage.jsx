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
import { Eyebrow } from '../components/shared/index.js'

function thisWeekRange() {
  const now = new Date()
  const day = now.getDay() || 7 // Sunday → 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - day + 1)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d) => `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}`
  return `This week · ${fmt(monday)} – ${fmt(sunday)}`
}

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
      <header className="mb-8">
        <Eyebrow>{thisWeekRange()}</Eyebrow>
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
          Where the quarter is being made or lost.
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: 'var(--klo-text-dim)' }}>
          {team.name || 'Team'} · {memberCount} rep{memberCount === 1 ? '' : 's'} ·{' '}
          {dealsActive.length} active deal{dealsActive.length === 1 ? '' : 's'}
        </p>
      </header>

      <QuarterGlanceStrip deals={dealsActive} />

      <KloTeamBriefCard
        brief={brief}
        loading={briefLoading}
        pipeline={pipeline}
      />

      <DealsSlippingList deals={dealsActive} />
    </div>
  )
}
