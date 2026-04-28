// Phase 8 step 08 — seller-side preview of the buyer dashboard. Renders the
// exact same components the buyer sees, plus a small banner up top so the
// seller knows what they're looking at and can trigger a manual refresh.

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import BuyerKloBriefHero from '../buyer/BuyerKloBriefHero.jsx'
import BuyerSignalsRow from '../buyer/BuyerSignalsRow.jsx'
import BuyerPlaybookCard from '../buyer/BuyerPlaybookCard.jsx'
import BuyerStakeholderMap from '../buyer/BuyerStakeholderMap.jsx'
import BuyerVendorTeamCard from '../buyer/BuyerVendorTeamCard.jsx'
import BuyerTimelineStrip from '../buyer/BuyerTimelineStrip.jsx'
import BuyerMomentumChart from '../buyer/BuyerMomentumChart.jsx'
import BuyerRisksList from '../buyer/BuyerRisksList.jsx'
import BuyerRecentMomentsFeed from '../buyer/BuyerRecentMomentsFeed.jsx'
import BuyerEmptyState from '../buyer/BuyerEmptyState.jsx'

const REFRESH_COOLDOWN_MS = 30_000

function relativeTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const diff = Math.round((Date.now() - d.getTime()) / 1000)
  if (diff < 30) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / 86400)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

export default function BuyerViewPreview({ deal }) {
  const { session } = useAuth()
  const buyerView = deal?.klo_state?.buyer_view ?? null

  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [lastRefreshAt, setLastRefreshAt] = useState(0)

  // Pulse the banner briefly when buyer_view.generated_at changes.
  const lastSeenGeneratedAtRef = useRef(buyerView?.generated_at ?? null)
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    const current = buyerView?.generated_at ?? null
    if (current && current !== lastSeenGeneratedAtRef.current) {
      lastSeenGeneratedAtRef.current = current
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 4000)
      return () => clearTimeout(t)
    }
    return undefined
  }, [buyerView?.generated_at])

  // Mark as viewed so the deals-list "✨ Buyer view updated" badge clears.
  useEffect(() => {
    if (!deal?.id || !buyerView?.generated_at) return
    try {
      window.localStorage.setItem(
        `klosure:lastViewedBuyerView:${deal.id}`,
        buyerView.generated_at,
      )
    } catch {
      // ignore
    }
  }, [deal?.id, buyerView?.generated_at])

  async function handleRefresh() {
    if (refreshing) return
    if (Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS) {
      setRefreshError('Just refreshed — try again in a few seconds.')
      return
    }
    setRefreshing(true)
    setRefreshError('')
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/klo-respond`
      const headers = {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
      }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ deal_id: deal.id, regenerate_buyer_view: true }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(body || `Refresh failed (${res.status})`)
      }
      setLastRefreshAt(Date.now())
    } catch (err) {
      setRefreshError(err?.message || 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const updatedLabel = relativeTime(buyerView?.generated_at)
  const buyerCompany = deal?.buyer_company || 'your buyer'

  return (
    <div className="min-h-full bg-[#f5f6f8]">
      <div
        className={`transition-colors px-4 md:px-6 py-3 border-b border-klo/15 ${
          pulse ? 'bg-klo/15' : 'bg-klo/5'
        }`}
      >
        <div className="max-w-[1080px] mx-auto flex items-center gap-3">
          <span aria-hidden className="text-klo">{pulse ? '✨' : '👁'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-navy">
              {pulse ? (
                <span className="font-semibold">Klo just updated your buyer's dashboard</span>
              ) : (
                <>
                  This is what <span className="font-medium">{buyerCompany}</span> sees
                </>
              )}
            </p>
            {!pulse && (
              <p className="text-[11px] text-navy/55">
                {updatedLabel
                  ? `Updated ${updatedLabel} by Klo · based on your conversations`
                  : 'No update yet — Klo will write this after your next material chat turn'}
              </p>
            )}
          </div>
          {buyerView && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-[12px] font-medium text-klo bg-white border border-klo/30 hover:border-klo px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : 'Refresh now'}
            </button>
          )}
        </div>
        {refreshError && (
          <p className="max-w-[1080px] mx-auto mt-2 text-[11px] text-red-600">
            {refreshError}
          </p>
        )}
      </div>

      <div className="max-w-[1080px] mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5">
        {!buyerView ? (
          <BuyerEmptyState />
        ) : (
          <>
            <BuyerKloBriefHero buyerView={buyerView} />
            <BuyerSignalsRow signals={buyerView.signals} />
            <BuyerPlaybookCard playbook={buyerView.playbook} dealId={deal.id} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <BuyerStakeholderMap stakeholders={buyerView.stakeholder_takes} />
              <BuyerVendorTeamCard deal={deal} />
            </div>
            <BuyerTimelineStrip
              stage={deal?.klo_state?.stage}
              deadline={deal?.klo_state?.deadline}
              blockers={deal?.klo_state?.blockers}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <BuyerMomentumChart buyerView={buyerView} />
              <BuyerRisksList risks={buyerView.risks_klo_is_watching} />
            </div>
            <BuyerRecentMomentsFeed moments={buyerView.recent_moments} />
          </>
        )}
      </div>
    </div>
  )
}

