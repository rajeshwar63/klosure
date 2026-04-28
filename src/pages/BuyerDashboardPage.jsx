// Phase 8 — buyer dashboard. Premium read-only page generated from the
// seller's chat. Replaces the chat-style Overview that earlier phases
// rendered for buyers.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import BuyerDealHeader from '../components/buyer/BuyerDealHeader.jsx'
import BuyerKloBriefHero from '../components/buyer/BuyerKloBriefHero.jsx'
import BuyerSignalsRow from '../components/buyer/BuyerSignalsRow.jsx'
import BuyerPlaybookCard from '../components/buyer/BuyerPlaybookCard.jsx'
import BuyerStakeholderMap from '../components/buyer/BuyerStakeholderMap.jsx'
import BuyerVendorTeamCard from '../components/buyer/BuyerVendorTeamCard.jsx'
import BuyerDealMilestones from '../components/buyer/BuyerDealMilestones.jsx'
import PendingTasksTwoCol from '../components/shared/PendingTasksTwoCol.jsx'
import BuyerMomentumChart from '../components/buyer/BuyerMomentumChart.jsx'
import BuyerRisksList from '../components/buyer/BuyerRisksList.jsx'
import BuyerRecentMomentsFeed from '../components/buyer/BuyerRecentMomentsFeed.jsx'
import BuyerEmptyState from '../components/buyer/BuyerEmptyState.jsx'

function BuyerLoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center text-navy/55 text-sm">
      Loading your dashboard…
    </div>
  )
}

export default function BuyerDashboardPage({ deal: dealProp, embedded = false }) {
  const [deal, setDeal] = useState(dealProp ?? null)
  const [loading, setLoading] = useState(!dealProp)

  useEffect(() => {
    if (dealProp) {
      setDeal(dealProp)
      setLoading(false)
    }
  }, [dealProp])

  // Realtime subscription on this single deal — picks up klo_state updates
  // (including buyer_view regenerations) without a refresh.
  useEffect(() => {
    if (embedded) return undefined
    const dealId = deal?.id
    if (!dealId) return undefined
    const channel = supabase
      .channel(`buyer-deal-${dealId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deals',
          filter: `id=eq.${dealId}`,
        },
        (payload) => {
          setDeal((d) => ({ ...d, ...payload.new }))
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [deal?.id, embedded])

  if (loading) return <BuyerLoadingState />
  if (!deal) return <BuyerEmptyState />

  const buyerView = deal?.klo_state?.buyer_view ?? null
  const klo = deal?.klo_state ?? {}

  const wrapperClass = embedded
    ? 'bg-[#f5f6f8]'
    : 'min-h-screen bg-[#f5f6f8]'

  return (
    <div className={wrapperClass}>
      {!embedded && <BuyerDealHeader deal={deal} />}
      <div className="max-w-[1080px] mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5">
        {!buyerView ? (
          <BuyerEmptyState />
        ) : (
          <>
            <section className="space-y-4">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-navy/65">Do this now</h2>
              <BuyerKloBriefHero buyerView={buyerView} />
              <BuyerSignalsRow signals={buyerView.signals} />
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-navy/65">Unblock this week</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                <BuyerPlaybookCard playbook={buyerView.playbook} />
                <PendingTasksTwoCol kloState={klo} perspective="buyer" />
              </div>
              <BuyerRisksList risks={buyerView.risks_klo_is_watching} />
              <BuyerDealMilestones moments={buyerView.recent_moments} />
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-navy/65">Who to pull in</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <BuyerStakeholderMap stakeholders={buyerView.stakeholder_takes} />
                <BuyerVendorTeamCard deal={deal} />
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-navy/65">Context</h2>
              <BuyerMomentumChart buyerView={buyerView} />
              <BuyerRecentMomentsFeed moments={buyerView.recent_moments} />
            </section>
          </>
        )}
      </div>
    </div>
  )
}
