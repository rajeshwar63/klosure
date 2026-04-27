// Dealroom v2 — single-canvas deal page with persistent right-rail Klo chat.
// Replaces the old DealRoomPage (Overview / Chat / History tabs) at /deals/:id.
//
// Data layer is unchanged from the old page: load deal + deal_context, then
// load messages + commitments and subscribe to realtime updates on each.
// We just rehouse the UI in the new dealroom shape and palette.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase.js'
import { useAuth } from '../../../hooks/useAuth.jsx'
import { useProfile } from '../../../hooks/useProfile.jsx'
import { useShellDeals } from '../../../hooks/useShellDeals.jsx'
import { listCommitments } from '../../../services/commitments.js'
import { greetingForRole } from '../../../services/klo.js'
import { canShareWithBuyer } from '../../../lib/plans.js'
import DealroomLayout from './DealroomLayout.jsx'
import BuyerChatDrawer from './BuyerChatDrawer.jsx'
import './dealroomTheme.css'

function DealroomSkeleton() {
  return (
    <div className="dealroom h-full" style={{ background: 'var(--dr-bg)' }}>
      <div className="h-12 border-b border-[color:var(--dr-line)] animate-pulse" />
      <div className="p-8 max-w-[760px] mx-auto">
        <div className="h-10 rounded-md bg-black/5 mb-4 animate-pulse" />
        <div className="h-24 rounded-xl bg-black/5 mb-4 animate-pulse" />
        <div className="h-40 rounded-xl bg-black/5 animate-pulse" />
      </div>
    </div>
  )
}

function DealroomNotFound({ error }) {
  const navigate = useNavigate()
  return (
    <div className="dealroom h-full p-12 text-center">
      <h2 className="text-xl font-medium mb-2">Deal not found</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--dr-ink-3)' }}>
        {error || 'It may have been archived or deleted.'}
      </p>
      <button
        type="button"
        onClick={() => navigate('/deals')}
        className="dr-btn"
      >
        ← Back to deals
      </button>
    </div>
  )
}

export default function DealroomPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const { profile, plan } = useProfile()
  const { reload: reloadShellDeals } = useShellDeals()

  const [deal, setDeal] = useState(null)
  const [dealContext, setDealContext] = useState(null)
  const [messages, setMessages] = useState([])
  const [commitments, setCommitments] = useState([])
  const [kloThinking, setKloThinking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [buyerChatOpen, setBuyerChatOpen] = useState(false)
  const [buyerChatPrefill, setBuyerChatPrefill] = useState('')

  // Load the deal + context.
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

  // Load messages + commitments and subscribe to realtime updates.
  useEffect(() => {
    if (!deal?.id) return
    let mounted = true
    async function load() {
      const [msgRes, commits] = await Promise.all([
        supabase
          .from('messages')
          .select('*')
          .eq('deal_id', deal.id)
          .order('created_at', { ascending: true }),
        listCommitments(deal.id),
      ])
      if (!mounted) return
      if (msgRes.error) {
        console.error('Failed to load messages', msgRes.error)
        return
      }
      setCommitments(commits)
      const data = msgRes.data ?? []
      if (data.length === 0) {
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
      .channel(`deal-v2-${deal.id}`)
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
          event: '*',
          schema: 'public',
          table: 'commitments',
          filter: `deal_id=eq.${deal.id}`,
        },
        (payload) => {
          setCommitments((prev) => {
            if (payload.eventType === 'DELETE') {
              return prev.filter((c) => c.id !== payload.old.id)
            }
            const row = payload.new
            const idx = prev.findIndex((c) => c.id === row.id)
            if (idx === -1) return [...prev, row]
            const next = [...prev]
            next[idx] = row
            return next
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

  const sellerName = useMemo(
    () => profile?.name || user?.email || 'Seller',
    [profile?.name, user?.email],
  )

  function handleOpenBuyerChat(prefill) {
    setBuyerChatPrefill(typeof prefill === 'string' ? prefill : '')
    setBuyerChatOpen(true)
  }

  // Honor onboarding's ?share=1 hint by prompting share immediately.
  useEffect(() => {
    if (params.get('share') === '1' && deal && canShareWithBuyer(plan)) {
      handleShare()
    }
  }, [params, deal, plan, handleShare])

  if (loading) return <DealroomSkeleton />
  if (error || !deal) return <DealroomNotFound error={error} />

  return (
    <>
      <DealroomLayout
        deal={deal}
        dealContext={dealContext}
        messages={messages}
        setMessages={setMessages}
        commitments={commitments}
        kloThinking={kloThinking}
        setKloThinking={setKloThinking}
        sellerName={sellerName}
        canShare={canShareWithBuyer(plan)}
        onShare={handleShare}
        onOpenBuyerChat={handleOpenBuyerChat}
      />
      <BuyerChatDrawer
        open={buyerChatOpen}
        onClose={() => setBuyerChatOpen(false)}
        deal={deal}
        dealContext={dealContext}
        messages={messages}
        setMessages={setMessages}
        commitments={commitments}
        kloThinking={kloThinking}
        setKloThinking={setKloThinking}
        sellerName={sellerName}
        prefill={buyerChatPrefill}
      />
    </>
  )
}
