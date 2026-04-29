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
import OnboardingModal, { ONBOARDING_SEEN_KEY } from '../components/onboarding/OnboardingModal.jsx'
import { Eyebrow } from '../components/shared/index.js'

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

function todayMonoLabel() {
  // "TODAY · TUE 29 APR" — matches the §5.1 hero spec.
  const now = new Date()
  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const day = now.getDate()
  const month = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  return `Today · ${weekday} ${day} ${month}`
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
  const [onboardingOpen, setOnboardingOpen] = useState(false)

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
        if (!mounted) return
        const missing = !row
        setProfileMissing(missing)
        if (missing) {
          let seen = false
          try {
            seen = window.localStorage.getItem(ONBOARDING_SEEN_KEY(user.id)) === 'true'
          } catch {
            // ignore
          }
          if (!seen) setOnboardingOpen(true)
        }
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
      <header className="mb-8">
        <Eyebrow>{todayMonoLabel()}</Eyebrow>
        <h1 className="mt-3 text-[clamp(32px,4vw,44px)] font-semibold tracking-[-0.03em] leading-[1.1] text-[var(--klo-text)]">
          {greeting}
        </h1>
        <p className="mt-2 text-[15px] text-[var(--klo-text-dim)]">
          {formatToday()}
        </p>
      </header>

      {profileMissing && !bannerDismissed && (
        <div
          className="mb-6 rounded-2xl px-5 py-4 flex items-start gap-3"
          style={{
            background: 'var(--klo-accent-soft)',
            border: '1px solid var(--klo-accent-line)',
          }}
        >
          <p className="flex-1 text-[14px] text-[var(--klo-text)] leading-relaxed">
            Klo is giving you generic advice.{' '}
            <Link
              to="/settings/train-klo"
              className="font-medium hover:underline"
              style={{ color: 'var(--klo-accent)' }}
            >
              Train Klo
            </Link>{' '}
            in 2 minutes for sharper coaching →
          </p>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Dismiss"
            className="text-lg leading-none"
            style={{ color: 'var(--klo-text-mute)' }}
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

      <OnboardingModal
        open={onboardingOpen}
        onClose={({ saved } = {}) => {
          setOnboardingOpen(false)
          if (saved) setProfileMissing(false)
        }}
        user={user}
      />
    </div>
  )
}
