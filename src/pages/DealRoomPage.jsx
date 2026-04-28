// Phase 6 step 08 — new deal page shell. Three tabs (Overview / Chat /
// History) and a dark deal header at the top. The page lives inside the
// AppShell, so the sidebar is always visible on the left.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { useShellDeals } from '../hooks/useShellDeals.jsx'
import { greetingForRole } from '../services/klo.js'
import { canShareWithBuyer } from '../lib/plans.js'
import {
  markDealWon,
  markDealLost,
  archiveDeal,
  deleteDeal,
  reopenDeal,
} from '../services/archive.js'
import ChatView from '../components/ChatView.jsx'
import DealHeader from '../components/deal/DealHeader.jsx'
import DealTabs, {
  loadDealTab,
  saveDealTab,
} from '../components/deal/DealTabs.jsx'
import OverviewTab from '../components/deal/OverviewTab.jsx'
import BuyerViewPreview from '../components/seller/BuyerViewPreview.jsx'

function DealPageSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="h-16 animate-pulse" style={{ background: '#2C2C2A' }} />
      <div className="border-b border-navy/10 bg-white h-10 animate-pulse" />
      <div className="flex-1 p-4 md:p-6">
        <div className="h-32 rounded-xl bg-navy/5 mb-4 animate-pulse" />
        <div className="h-48 rounded-xl bg-navy/5 animate-pulse" />
      </div>
    </div>
  )
}

function DealNotFound({ error }) {
  const navigate = useNavigate()
  return (
    <div className="p-12 text-center">
      <h2 className="text-xl font-medium text-navy mb-2">Deal not found</h2>
      <p className="text-navy/55 text-sm mb-4">
        {error || 'It may have been archived or deleted.'}
      </p>
      <button
        type="button"
        onClick={() => navigate('/deals')}
        className="text-klo font-medium"
      >
        ← Back to deals
      </button>
    </div>
  )
}

export default function DealRoomPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { profile, plan } = useProfile()
  const { reload: reloadShellDeals } = useShellDeals()

  const [deal, setDeal] = useState(null)
  const [dealContext, setDealContext] = useState(null)
  const [messages, setMessages] = useState([])
  const [kloThinking, setKloThinking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [activeTab, setActiveTab] = useState(() => loadDealTab(id))

  // Re-read the per-deal tab when the dealId in the URL changes.
  useEffect(() => {
    setActiveTab(loadDealTab(id))
  }, [id])

  function handleTabChange(next) {
    setActiveTab(next)
    saveDealTab(id, next)
  }

  // Load the deal + context + profile.
  useEffect(() => {
    if (!user || !id) return
    let mounted = true
    setLoading(true)
    Promise.all([
      supabase.from('deals').select('*').eq('id', id).single(),
      supabase.from('deal_context').select('*').eq('deal_id', id).maybeSingle(),
    ]).then(([dealRes, ctxRes]) => {
      if (!mounted) return
      if (dealRes.error) {
        setError(dealRes.error.message)
        setLoading(false)
        return
      }
      setDeal(dealRes.data)
      setDealContext(ctxRes.data ?? null)
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [user, id])

  // Load messages and subscribe to realtime updates.
  useEffect(() => {
    if (!deal?.id) return
    let mounted = true
    async function load() {
      const msgRes = await supabase
        .from('messages')
        .select('*')
        .eq('deal_id', deal.id)
        .order('created_at', { ascending: true })
      if (!mounted) return
      if (msgRes.error) {
        console.error('Failed to load messages', msgRes.error)
        return
      }
      const data = msgRes.data ?? []
      if (data.length === 0) {
        // Phase 1 first-message greeting from Klo.
        const greeting = greetingForRole({ role: 'seller', deal })
        const { data: inserted } = await supabase
          .from('messages')
          .insert({
            deal_id: deal.id,
            sender_type: 'klo',
            sender_name: 'Klo',
            content: greeting,
          })
          .select()
        setMessages(inserted ?? [])
      } else {
        setMessages(data)
      }
    }
    load()

    const channel = supabase
      .channel(`deal-${deal.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `deal_id=eq.${deal.id}`,
        },
        (payload) => {
          if (payload.new.sender_type === 'klo') setKloThinking(false)
          setMessages((prev) => {
            if (prev.find((m) => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deals',
          filter: `id=eq.${deal.id}`,
        },
        (payload) => {
          setDeal((d) => ({ ...d, ...payload.new }))
        },
      )

    channel.subscribe()
    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [deal?.id])

  // When the deal record updates (Klo writes back klo_state, summary, etc.)
  // refresh the sidebar list so its confidence dot stays in sync.
  useEffect(() => {
    if (!deal?.id) return
    reloadShellDeals()
  }, [deal?.klo_state?.confidence?.value, deal?.health, reloadShellDeals, deal?.id])

  const handleShare = useCallback(() => {
    if (!deal?.buyer_token) return
    const base = import.meta.env.VITE_APP_URL || window.location.origin
    const url = `${base.replace(/\/$/, '')}/join/${deal.buyer_token}`
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {})
    }
    window.alert(`Share link copied:\n${url}`)
  }, [deal?.buyer_token])

  const handleWin = useCallback(async () => {
    if (!deal?.id) return
    const res = await markDealWon({ dealId: deal.id })
    if (!res.ok) {
      window.alert(res.error || 'Could not mark deal as won.')
      return
    }
    setDeal((d) => ({ ...d, ...res.deal }))
    reloadShellDeals()
  }, [deal?.id, reloadShellDeals])

  const handleLost = useCallback(
    async (reason) => {
      if (!deal?.id) return
      const res = await markDealLost({ dealId: deal.id, reason })
      if (!res.ok) {
        window.alert(res.error || 'Could not mark deal as lost.')
        return
      }
      setDeal((d) => ({ ...d, ...res.deal }))
      reloadShellDeals()
    },
    [deal?.id, reloadShellDeals],
  )

  const handleArchive = useCallback(async () => {
    if (!deal?.id) return
    const res = await archiveDeal({ dealId: deal.id })
    if (!res.ok) {
      window.alert(res.error || 'Could not archive the deal.')
      return
    }
    setDeal((d) => ({ ...d, ...res.deal }))
    reloadShellDeals()
  }, [deal?.id, reloadShellDeals])

  const handleReopen = useCallback(async () => {
    if (!deal?.id) return
    const res = await reopenDeal({ dealId: deal.id })
    if (!res.ok) {
      window.alert(res.error || 'Could not reopen the deal.')
      return
    }
    setDeal((d) => ({ ...d, ...res.deal }))
    reloadShellDeals()
  }, [deal?.id, reloadShellDeals])

  const handleDelete = useCallback(async () => {
    if (!deal?.id) return
    const res = await deleteDeal({ dealId: deal.id, locked: !!deal.locked })
    if (!res.ok) {
      window.alert(res.error || 'Could not delete the deal.')
      return
    }
    reloadShellDeals()
    navigate('/deals', { replace: true })
  }, [deal?.id, deal?.locked, navigate, reloadShellDeals])

  const sellerName = useMemo(
    () => profile?.name || user?.email || 'Seller',
    [profile?.name, user?.email],
  )

  const messageCount = messages?.length ?? 0
  // Honor onboarding's ?share=1 hint by prompting share immediately.
  useEffect(() => {
    if (params.get('share') === '1' && deal && canShareWithBuyer(plan)) {
      handleShare()
    }
  }, [params, deal, plan, handleShare])

  if (loading) return <DealPageSkeleton />
  if (error || !deal) return <DealNotFound error={error} />

  return (
    <div className="flex flex-col h-full min-h-0">
      <DealHeader
        deal={deal}
        viewerRole="seller"
        canShare={canShareWithBuyer(plan)}
        onShare={handleShare}
        onOpenChat={() => handleTabChange('chat')}
        onWin={handleWin}
        onLost={handleLost}
        onArchive={handleArchive}
        onReopen={handleReopen}
        onDelete={handleDelete}
      />
      <DealTabs
        activeTab={activeTab}
        onChange={handleTabChange}
        chatCount={messageCount}
      />

      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === 'overview' && (
          <div className="flex-1 min-h-0 overflow-y-auto bg-[#f5f6f8]">
            <OverviewTab
              deal={deal}
              viewerRole="seller"
              onSwitchToChat={() => handleTabChange('chat')}
            />
          </div>
        )}
        {activeTab === 'chat' && (
          // ChatView renders its own scrollable timeline + docked input;
          // the wrapper just provides the flex column shape it expects.
          <div className="flex-1 min-h-0 flex flex-col chat-doodle">
            <ChatView
              deal={deal}
              dealContext={dealContext}
              role="seller"
              currentUserName={sellerName}
              messages={messages}
              setMessages={setMessages}
              kloThinking={kloThinking}
              setKloThinking={setKloThinking}
              locked={deal.locked}
            />
          </div>
        )}
        {activeTab === 'buyer' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <BuyerViewPreview deal={deal} />
          </div>
        )}
      </div>
    </div>
  )
}
