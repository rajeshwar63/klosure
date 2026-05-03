// =============================================================================
// SettingsConnectionsPage — Phase A sprint 09
// =============================================================================
// Hosts the ConnectButtons + GrantsListEnhanced from sprints 03 and 09, plus
// context copy and per-grant deal-coverage stats.
// =============================================================================

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ConnectButtons from '../components/settings/ConnectButtons.jsx'
import GrantsListEnhanced from '../components/settings/GrantsListEnhanced.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'

export default function SettingsConnectionsPage() {
  const { user } = useAuth()
  const [coverage, setCoverage] = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()

  // After Nylas OAuth, the callback page redirects here with ?connected=1.
  // Bump refreshTick to force GrantsListEnhanced + coverage to re-fetch, then
  // strip the flag from the URL so a later refresh doesn't re-trigger it.
  useEffect(() => {
    if (searchParams.get('connected') === '1') {
      setRefreshTick((t) => t + 1)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!user) return
    loadCoverage(user.id).then(setCoverage)
  }, [user, refreshTick])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-navy">
        Connect your inbox & calendar
      </h1>

      <div className="mt-3 text-[15px] text-navy/70 leading-relaxed">
        When you connect, Klo reads emails and joins meetings that involve your deal
        stakeholders. Klo never sends email or schedules meetings — it just listens
        and keeps the deal record current.
      </div>

      <div className="mt-2 inline-flex items-center gap-2 text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
        <CheckIcon /> Read-only. Disconnect anytime.
      </div>

      <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900 leading-relaxed">
        <strong className="font-semibold">
          Beta access — available to selected test users only.
        </strong>{' '}
        Inbox &amp; calendar connections are currently limited to participants in
        our private beta program. General availability for all users is planned
        for the <strong className="font-semibold">v2 release in June 2026</strong>.
      </div>

      <div className="mt-6">
        <ConnectButtons />
      </div>

      <div className="mt-8 pt-6 border-t border-navy/10">
        <h2 className="text-[13px] font-semibold tracking-wider text-navy/55 mb-3">
          CONNECTED ACCOUNTS
        </h2>
        <GrantsListEnhanced
          coverage={coverage}
          refreshKey={refreshTick}
          onChanged={() => setRefreshTick((t) => t + 1)}
        />
      </div>

      <div className="mt-8 pt-6 border-t border-navy/10">
        <h2 className="text-[13px] font-semibold tracking-wider text-navy/55 mb-3">
          WHAT KLO READS
        </h2>
        <ul className="space-y-2 text-[14px] text-navy/70">
          <li className="flex gap-2">
            <span className="text-klo">→</span>
            <span>
              <strong>Emails</strong> with anyone listed as a stakeholder on your
              active deals. Personal email is ignored.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-klo">→</span>
            <span>
              <strong>Calendar events</strong> with deal stakeholders attending.
              Klo dispatches a notetaker bot to those meetings.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-klo">→</span>
            <span>
              <strong>Meeting transcripts</strong> via Klo's bot. The bot shows up
              as "Klo (Klosure)" in the participant list — buyers see it's there.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-klo">→</span>
            <span>
              <strong>Nothing else.</strong> Klo doesn't send, schedule, reply, or
              forward. Read-only.
            </span>
          </li>
        </ul>
      </div>

      <div className="mt-8 text-xs text-navy/40">
        Need different scopes or have questions?{' '}
        <a href="mailto:support@klosure.ai" className="underline">
          Email support
        </a>
        .
      </div>
    </div>
  )
}

async function loadCoverage(userId) {
  const { data: grants } = await supabase
    .from('nylas_grants')
    .select('nylas_grant_id, email_address, sync_state')

  const { data: deals } = await supabase
    .from('deals')
    .select('id, klo_state')
    .eq('seller_id', userId)
    .eq('status', 'active')

  const totalActive = deals?.length ?? 0
  const dealsWithEmails = (deals ?? []).filter((d) => {
    const people = d.klo_state?.people ?? []
    return people.some((p) => !!p.email)
  }).length

  return { totalActive, dealsWithEmails, grants: grants ?? [] }
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 1.4-1.4L9 11.6l6.3-6.3a1 1 0 0 1 1.4 0z" />
    </svg>
  )
}
