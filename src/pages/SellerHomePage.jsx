// Phase 6 step 04 — seller morning briefing.
//
// Three sections stacked: Klo's focus card (the hero), a needs-you-today
// queue, and a pipeline-at-a-glance strip. The page renders the greeting
// instantly and streams sections in as data arrives — no full-page loader.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { useShellDeals } from '../hooks/useShellDeals.jsx'
import { fetchDailyFocus } from '../services/dailyFocus.js'
import { getSellerProfile } from '../lib/sellerProfile.js'
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

function dismissalKey(userId) {
  return `klosure:trainklo:dismissed:${userId}`
}

export default function SellerHomePage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { deals, loading: dealsLoading } = useShellDeals()
  const [focus, setFocus] = useState(null)
  const [focusLoading, setFocusLoading] = useState(true)
  const [profileMissing, setProfileMissing] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)

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

  useEffect(() => {
    if (!user) return
    let mounted = true
    try {
      if (window.localStorage.getItem(dismissalKey(user.id)) === '1') {
        setBannerDismissed(true)
      }
    } catch {
      // ignore
    }
    getSellerProfile(user.id)
      .then((row) => {
        if (mounted) setProfileMissing(!row)
      })
      .catch(() => {
        if (mounted) setProfileMissing(false)
      })
    return () => {
      mounted = false
    }
  }, [user])

  function dismissBanner() {
    setBannerDismissed(true)
    try {
      if (user) window.localStorage.setItem(dismissalKey(user.id), '1')
    } catch {
      // ignore
    }
  }

  const firstName = profile?.name?.split(' ')[0] || ''
  const greeting = firstName ? `${getGreeting()}, ${firstName}.` : `${getGreeting()}.`

  return (
    <div className="p-6 md:p-8 max-w-[960px] mx-auto">
      <header className="mb-6">
        <p className="text-xs text-navy/50 mb-1">{formatToday()}</p>
        <h1 className="text-2xl font-medium text-navy leading-tight">{greeting}</h1>
      </header>

      {profileMissing && !bannerDismissed && (
        <div className="mb-6 rounded-xl border border-klo/30 bg-klo/5 px-4 py-3 flex items-start gap-3">
          <p className="flex-1 text-[13px] text-navy/80 leading-relaxed">
            Klo is giving you generic advice.{' '}
            <Link to="/settings/train-klo" className="text-klo font-semibold hover:underline">
              Train Klo
            </Link>{' '}
            in 2 minutes for sharper coaching →
          </p>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Dismiss"
            className="text-navy/40 hover:text-navy text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

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
