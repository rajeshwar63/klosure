import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { greetingForRole } from '../services/klo.js'
import { listCommitments } from '../services/commitments.js'
import { formatCurrency, formatDeadline } from '../lib/format.js'
import ChatView from './ChatView.jsx'
import OverviewView from './OverviewView.jsx'
import DealRoomTabs, { loadLastTab, saveLastTab } from './DealRoomTabs.jsx'

const STAGE_LABEL = {
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  legal: 'Legal',
  closed: 'Closed'
}

const HEALTH_DOT = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500'
}

const HEALTH_LABEL = {
  green: 'On track',
  amber: 'Stuck',
  red: 'At risk'
}

// Shell for the deal room — owns deal/messages/commitments state and the
// realtime channel, then renders the shared header + body. The body switches
// between Chat and Overview (Phase 3.5); for step 1 of the refactor we always
// render ChatView so behavior matches Phase 3 exactly.
export default function DealRoom({ deal: dealProp, dealContext, role, currentUserName, onBack }) {
  const navigate = useNavigate()
  const [deal, setDeal] = useState(dealProp)
  const [messages, setMessages] = useState([])
  const [commitments, setCommitments] = useState([])
  const [kloThinking, setKloThinking] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [tab, setTab] = useState(() => loadLastTab(dealProp?.id))
  // Set when the user clicks a commitment row in the Overview's action zones.
  // ChatView watches this prop, scrolls to the matching card and pulses it.
  const [highlightCommitmentId, setHighlightCommitmentId] = useState(null)

  const stakeholders = dealContext?.stakeholders ?? []

  // If the deal id swaps (rare — e.g. buyer page promoting solo→shared keeps
  // the same id) re-read the saved tab for that deal so each deal has its own
  // preference.
  useEffect(() => {
    setTab(loadLastTab(deal?.id))
  }, [deal?.id])

  function handleTabChange(next) {
    setTab(next)
    saveLastTab(deal?.id, next)
  }

  function handleCommitmentJump(commitmentId) {
    setHighlightCommitmentId(commitmentId)
    setTab('chat')
    saveLastTab(deal?.id, 'chat')
  }

  // Keep local deal state in sync if the parent ever swaps the prop (e.g. buyer
  // page promoting solo→shared). Realtime updates below override this with the
  // live row from Postgres so summary/stage move on every Klo turn.
  useEffect(() => {
    setDeal(dealProp)
  }, [dealProp])

  // Initial fetch + realtime subscription on messages, deals, AND commitments.
  // - messages: chat stream (Phase 1)
  // - deals: Klo writes summary/stage/health back here (Phase 2 + Phase 3)
  // - commitments: cards rendered inline in the timeline (Phase 3)
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
      const data = msgRes.data ?? []
      setCommitments(commits)
      if (data.length === 0) {
        // First-time greeting from Klo, persisted so it survives reloads.
        const greeting = greetingForRole({ role, deal })
        const { data: inserted } = await supabase
          .from('messages')
          .insert({
            deal_id: deal.id,
            sender_type: 'klo',
            sender_name: 'Klo',
            content: greeting
          })
          .select()
        setMessages(inserted ?? [])
      } else {
        setMessages(data)
      }
    }
    load()

    let channel = supabase
      .channel(`deal-${deal.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `deal_id=eq.${deal.id}` },
        (payload) => {
          if (payload.new.sender_type === 'klo') setKloThinking(false)
          setMessages((prev) => {
            if (prev.find((m) => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commitments', filter: `deal_id=eq.${deal.id}` },
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
        }
      )
    // Only the seller has RLS read access on `deals`, so only they get live
    // summary + stage + health updates. The buyer sees a static snapshot at
    // join time (Phase 4 will add a buyer_token-validating RPC that lifts this).
    if (role === 'seller') {
      channel = channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'deals', filter: `id=eq.${deal.id}` },
        (payload) => {
          setDeal((d) => ({ ...d, ...payload.new }))
        }
      )
    }
    channel.subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [deal?.id, role])

  const shareUrl = useMemo(() => {
    if (!deal?.buyer_token) return ''
    const base = import.meta.env.VITE_APP_URL || window.location.origin
    return `${base.replace(/\/$/, '')}/join/${deal.buyer_token}`
  }, [deal?.buyer_token])

  return (
    <div className="min-h-screen flex flex-col bg-chat-bg">
      <header className="bg-navy text-white shadow-sm shrink-0">
        <div className="max-w-2xl mx-auto px-3 py-3 flex items-center gap-3">
          <button
            onClick={onBack ?? (() => navigate(-1))}
            className="text-white/70 hover:text-white text-2xl leading-none px-1"
            aria-label="Back"
          >
            ‹
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${HEALTH_DOT[deal.health] ?? 'bg-emerald-500'}`}
                title={HEALTH_LABEL[deal.health] ?? 'On track'}
              />
              <h1 className="font-semibold truncate">{deal.title}</h1>
            </div>
            <p className="text-xs text-white/60 truncate">
              {role === 'buyer'
                ? `${deal.seller_company || 'Seller'} · Klo coaching live`
                : `${deal.buyer_company || 'Buyer'} · ${STAGE_LABEL[deal.stage]} · ${HEALTH_LABEL[deal.health] ?? 'On track'}`}
            </p>
          </div>
          {role === 'seller' && (
            <button
              onClick={() => setShareOpen(true)}
              className="text-xs px-3 py-1.5 rounded-full bg-klo hover:bg-klo/90 font-medium"
            >
              Share
            </button>
          )}
        </div>

        {/* Pill strip */}
        <div className="max-w-2xl mx-auto px-3 pb-3 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 text-[11px]">
            <Pill>{STAGE_LABEL[deal.stage]}</Pill>
            <HealthPill health={deal.health} />
            <Pill>{formatCurrency(deal.value)}</Pill>
            <Pill>{formatDeadline(deal.deadline)}</Pill>
            <Pill>{deal.mode === 'shared' ? 'Shared' : 'Solo'}</Pill>
            {stakeholders.slice(0, 3).map((s, i) => (
              <Pill key={i}>{s.name}{s.role ? ` · ${s.role}` : ''}</Pill>
            ))}
          </div>
        </div>
      </header>

      <KloSummaryBar deal={deal} dealContext={dealContext} />

      <DealRoomTabs active={tab} onChange={handleTabChange} />

      {tab === 'chat' ? (
        <ChatView
          deal={deal}
          dealContext={dealContext}
          role={role}
          currentUserName={currentUserName}
          messages={messages}
          setMessages={setMessages}
          commitments={commitments}
          kloThinking={kloThinking}
          setKloThinking={setKloThinking}
          highlightCommitmentId={highlightCommitmentId}
          onHighlightConsumed={() => setHighlightCommitmentId(null)}
        />
      ) : (
        <OverviewView
          deal={deal}
          dealContext={dealContext}
          role={role}
          commitments={commitments}
          onSwitchToChat={() => handleTabChange('chat')}
          onCommitmentClick={handleCommitmentJump}
        />
      )}

      {shareOpen && (
        <ShareModal
          deal={deal}
          shareUrl={shareUrl}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}

function Pill({ children }) {
  return (
    <span className="bg-white/10 text-white/90 rounded-full px-2.5 py-1 whitespace-nowrap border border-white/10">
      {children}
    </span>
  )
}

function HealthPill({ health }) {
  const tone = health === 'red'
    ? 'bg-red-500/20 text-red-100 border-red-400/40'
    : health === 'amber'
      ? 'bg-amber-500/20 text-amber-100 border-amber-400/40'
      : 'bg-emerald-500/20 text-emerald-100 border-emerald-400/40'
  return (
    <span className={`rounded-full px-2.5 py-1 whitespace-nowrap border ${tone} flex items-center gap-1.5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${HEALTH_DOT[health] ?? 'bg-emerald-500'}`} />
      {HEALTH_LABEL[health] ?? 'On track'}
    </span>
  )
}

function KloSummaryBar({ deal, dealContext }) {
  // Phase 2: deal.summary is written live by the klo-respond edge function on
  // every Klo turn. When summary is null we fall back to the Phase 1 hint.
  const fallback = (() => {
    const next = dealContext?.what_needs_to_happen?.split('.').filter(Boolean)[0]?.trim()
    if (next) return `Next: ${next}.`
    return `Solo room ready. Tell Klo where the deal stands and get a move.`
  })()
  const summary = deal?.summary?.trim() || fallback
  return (
    <div className="bg-klo-bg border-y border-klo/20 shrink-0">
      <div className="max-w-2xl mx-auto px-3 py-2 text-[13px] text-navy flex items-center gap-2">
        <span className="text-klo font-bold">◆</span>
        <span className="flex-1 truncate">{summary}</span>
      </div>
    </div>
  )
}

function ShareModal({ deal, shareUrl, onClose }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('clipboard error', err)
    }
  }

  const message = `Hi — I've shared the ${deal.title} room with you. Klo will keep both sides aligned. Open it here:\n${shareUrl}`

  function shareWhatsapp() {
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-semibold text-navy">Share with the buyer</h2>
            <p className="text-xs text-navy/60">No signup. They open the link and they're in.</p>
          </div>
          <button onClick={onClose} className="text-navy/40 hover:text-navy text-xl leading-none px-2">×</button>
        </div>
        <div className="bg-navy/5 rounded-lg p-3 text-sm break-all text-navy/80 mb-3">
          {shareUrl}
        </div>
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="flex-1 bg-klo hover:bg-klo/90 text-white font-semibold py-2.5 rounded-xl"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            onClick={shareWhatsapp}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl"
          >
            WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}
