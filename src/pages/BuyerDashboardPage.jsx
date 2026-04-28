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
import BuyerTimelineStrip from '../components/buyer/BuyerTimelineStrip.jsx'
import BuyerCommitmentsTwoCol from '../components/buyer/BuyerCommitmentsTwoCol.jsx'
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
  const [commitments, setCommitments] = useState([])
  const [loading, setLoading] = useState(!dealProp)

  useEffect(() => {
    if (dealProp) {
      setDeal(dealProp)
      setLoading(false)
    }
  }, [dealProp])

  // Load commitments whenever the deal id is known.
  useEffect(() => {
    const dealId = deal?.id
    if (!dealId) return undefined
    let mounted = true
    supabase
      .from('commitments')
      .select('*')
      .eq('deal_id', dealId)
      .then(({ data }) => {
        if (mounted) setCommitments(data ?? [])
      })
    return () => {
      mounted = false
    }
  }, [deal?.id])

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
            <BuyerKloBriefHero buyerView={buyerView} />
            <BuyerSignalsRow signals={buyerView.signals} />
            <BuyerPlaybookCard playbook={buyerView.playbook} dealId={deal.id} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <BuyerStakeholderMap stakeholders={buyerView.stakeholder_takes} />
              <BuyerVendorTeamCard deal={deal} />
            </div>
            <BuyerTimelineStrip
              stage={klo.stage}
              deadline={klo.deadline}
              blockers={klo.blockers}
            />
            <BuyerCommitmentsTwoCol commitments={commitments} />
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
