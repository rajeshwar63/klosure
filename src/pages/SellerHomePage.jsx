// Phase 6 step 04 — seller morning briefing.
//
// Three sections stacked: Klo's focus card (the hero), a needs-you-today
// queue, and a pipeline-at-a-glance strip. The page renders the greeting
// instantly and streams sections in as data arrives — no full-page loader.

import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { useShellDeals } from '../hooks/useShellDeals.jsx'
import { fetchDailyFocus } from '../services/dailyFocus.js'
import KloFocusCard from '../components/home/KloFocusCard.jsx'
import NeedsYouTodayList from '../components/home/NeedsYouTodayList.jsx'
import PipelineGlanceStrip from '../components/home/PipelineGlanceStrip.jsx'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export default function SellerHomePage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { deals, loading: dealsLoading } = useShellDeals()
  const [focus, setFocus] = useState(null)
  const [focusLoading, setFocusLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let mounted = true
    setFocusLoading(true)
    fetchDailyFocus()
      .then((res) => {
        if (mounted) setFocus(res)
      })
      .catch(() => {
        if (mounted) setFocus(null)
      })
      .finally(() => {
        if (mounted) setFocusLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [user])

  const firstName = profile?.name?.split(' ')[0] || ''
  const greeting = firstName ? `${getGreeting()}, ${firstName}.` : `${getGreeting()}.`

  return (
    <div className="p-6 md:p-8 max-w-[960px] mx-auto">
      <header className="mb-6">
        <p className="text-xs text-navy/50 mb-1">{formatToday()}</p>
        <h1 className="text-2xl font-medium text-navy leading-tight">{greeting}</h1>
      </header>

      <KloFocusCard
        focus={focus}
        loading={focusLoading}
        deals={deals}
      />

      <NeedsYouTodayList deals={deals} loading={dealsLoading} />

      <PipelineGlanceStrip deals={deals} loading={dealsLoading} />
    </div>
  )
}
