import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { greetingForRole } from '../services/klo.js'
import { listCommitments } from '../services/commitments.js'
import { markDealWon, markDealLost, reopenDeal, LOSS_REASONS } from '../services/archive.js'
import { useProfile } from '../hooks/useProfile.jsx'
import { canShareWithBuyer, nextPlanFor } from '../lib/plans.js'
import { formatCurrency, formatDeadline, daysUntil } from '../lib/format.js'
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
export default function DealRoom({ deal: dealProp, dealContext, role, currentUserName, onBack, autoShare = false }) {
  const navigate = useNavigate()
  const { plan } = useProfile()
  const [deal, setDeal] = useState(dealProp)
  const [messages, setMessages] = useState([])
  const [commitments, setCommitments] = useState([])
  const [kloThinking, setKloThinking] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [tab, setTab] = useState(() => loadLastTab(dealProp?.id))
  // Phase 5.5 step 04: pill strip is compact-by-default; tapping the chip
  // expands to the full row. No persistence — chat is meant to feel like
  // chat, so navigating away resets it.
  const [showAllPills, setShowAllPills] = useState(false)

  // Onboarding "Invite my buyer" path lands here with ?share=1 — pop the
  // share modal automatically once the deal is loaded and the plan allows it.
  useEffect(() => {
    if (autoShare && role === 'seller' && canShareWithBuyer(plan)) {
      setShareOpen(true)
    }
  }, [autoShare, role, plan])
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
    <div className="h-dvh flex flex-col bg-chat-bg overflow-hidden">
      <header className="bg-navy text-white shadow-sm shrink-0">
        <div
          className="max-w-2xl mx-auto px-3 py-3 flex items-center gap-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
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
          {role === 'seller' && !deal.locked && (
            <>
              {canShareWithBuyer(plan) ? (
                <button
                  onClick={() => setShareOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-full bg-klo hover:bg-klo/90 font-medium"
                >
                  Share
                </button>
              ) : (
                <Link
                  to="/billing"
                  className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 font-medium border border-white/20"
                  title={`Upgrade to ${nextPlanFor('share').name} to share with buyers`}
                >
                  Share · Pro
                </Link>
              )}
              <button
                onClick={() => setCloseOpen(true)}
                className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 font-medium border border-white/20"
                title="Mark this deal as won or lost"
              >
                Close
              </button>
            </>
          )}
          {role === 'seller' && deal.locked && (
            <button
              onClick={async () => {
                if (!confirm('Reopen this deal? The room becomes editable again.')) return
                const res = await reopenDeal({ dealId: deal.id })
                if (!res.ok) alert(res.error)
                else setDeal((d) => ({ ...d, ...res.deal }))
              }}
              className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 font-medium border border-white/20"
            >
              Reopen
            </button>
          )}
        </div>

        {/* Pill strip — compact by default, tap to expand. */}
        {showAllPills ? (
          <div className="max-w-2xl mx-auto px-3 pb-3 overflow-x-auto no-scrollbar">
            <div className="flex gap-2 text-[11px] items-center">
              <Pill>{STAGE_LABEL[deal.stage]}</Pill>
              <HealthPill health={deal.health} />
              <Pill>{formatCurrency(deal.value)}</Pill>
              <Pill>{formatDeadline(deal.deadline)}</Pill>
              <Pill>{deal.mode === 'shared' ? 'Shared' : 'Solo'}</Pill>
              {stakeholders.slice(0, 3).map((s, i) => (
                <Pill key={i}>{s.name}{s.role ? ` · ${s.role}` : ''}</Pill>
              ))}
              <button
                type="button"
                onClick={() => setShowAllPills(false)}
                aria-label="Collapse pills"
                className="ml-auto text-white/70 hover:text-white text-base leading-none px-1.5"
              >
                ⌃
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-3 pb-3">
            <CompactDealChip deal={deal} onExpand={() => setShowAllPills(true)} />
          </div>
        )}
      </header>

      <KloSummaryBar deal={deal} dealContext={dealContext} />

      {deal.locked && <LockedBanner deal={deal} />}

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
          locked={deal.locked}
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
      {closeOpen && (
        <CloseDealModal
          deal={deal}
          onClose={() => setCloseOpen(false)}
          onClosed={(updated) => {
            setDeal((d) => ({ ...d, ...updated }))
            setCloseOpen(false)
          }}
        />
      )}
    </div>
  )
}

function LockedBanner({ deal }) {
  const tone = deal.status === 'won'
    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
    : deal.status === 'lost'
      ? 'bg-red-50 border-red-200 text-red-900'
      : 'bg-navy/5 border-navy/15 text-navy/70'
  const label = deal.status === 'won'
    ? 'Won — room locked as history'
    : deal.status === 'lost'
      ? `Lost${deal.closed_reason && deal.closed_reason !== 'won' ? ` · ${prettyReason(deal.closed_reason)}` : ''} — room locked as history`
      : 'Archived — room locked as history'
  return (
    <div className={`shrink-0 border-y ${tone}`}>
      <div className="max-w-2xl mx-auto px-3 py-2 text-xs flex items-center gap-2">
        <LockGlyph />
        <span className="font-semibold">{label}</span>
        <span className="opacity-70">— read-only. Reopen from the header to edit.</span>
      </div>
    </div>
  )
}

function LockGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function prettyReason(r) {
  return (
    {
      budget: 'Budget',
      timing: 'Timing',
      competitor: 'Competitor',
      no_decision: 'No decision',
      other: 'Other',
    }[r] || r
  )
}

// Mark the deal won/lost. Lost requires a reason — Klo + the manager view both
// learn from these aggregates ("most deals lost on timing this quarter").
function CloseDealModal({ deal, onClose, onClosed }) {
  const [outcome, setOutcome] = useState('won')
  const [reason, setReason] = useState(LOSS_REASONS[0].value)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = outcome === 'won'
      ? await markDealWon({ dealId: deal.id })
      : await markDealLost({ dealId: deal.id, reason })
    if (!res.ok) {
      setError(res.error || 'Could not close the deal.')
      setSubmitting(false)
      return
    }
    onClosed?.(res.deal)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-semibold text-navy">Close this deal</h2>
            <p className="text-xs text-navy/60">
              The room locks as read-only history. You can reopen any time.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-navy/40 hover:text-navy text-xl leading-none px-2">
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setOutcome('won')}
            className={`py-3 rounded-xl border font-semibold ${
              outcome === 'won'
                ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                : 'bg-white border-navy/15 text-navy/70'
            }`}
          >
            Won
          </button>
          <button
            type="button"
            onClick={() => setOutcome('lost')}
            className={`py-3 rounded-xl border font-semibold ${
              outcome === 'lost'
                ? 'bg-red-50 border-red-400 text-red-800'
                : 'bg-white border-navy/15 text-navy/70'
            }`}
          >
            Lost
          </button>
        </div>

        {outcome === 'lost' && (
          <label className="block mb-4">
            <span className="block text-xs font-medium text-navy/70 mb-1">Why?</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-navy/15 rounded-lg px-3 py-2.5 focus:outline-none focus:border-klo focus:ring-2 focus:ring-klo/20"
            >
              {LOSS_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-white border border-navy/15 text-navy/70 hover:text-navy font-semibold py-2.5 rounded-xl"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-klo hover:bg-klo/90 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl"
          >
            {submitting ? 'Closing…' : `Mark as ${outcome}`}
          </button>
        </div>
      </form>
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

// Phase 5.5 step 04: single tappable chip that stands in for the full pill
// row. Shows just the three things a seller scans for at a glance — health,
// time-to-deadline, and which buyer this is.
function CompactDealChip({ deal, onExpand }) {
  const tone = deal.health === 'red'
    ? 'bg-red-500/20 text-red-100 border-red-400/40'
    : deal.health === 'amber'
      ? 'bg-amber-500/20 text-amber-100 border-amber-400/40'
      : 'bg-emerald-500/20 text-emerald-100 border-emerald-400/40'
  const icon = deal.health === 'red' ? '✕' : deal.health === 'amber' ? '⚠' : '✓'
  const healthText = HEALTH_LABEL[deal.health] ?? 'On track'
  const days = compactDays(daysUntil(deal.deadline))
  const buyer = (deal.buyer_company || deal.title || '').trim()

  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label="Show all deal details"
      className={`flex items-center gap-1.5 text-[11px] rounded-full px-3 py-1 border whitespace-nowrap max-w-full ${tone}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="font-semibold">{healthText}</span>
      {days && (
        <>
          <span className="opacity-50">·</span>
          <span>{days}</span>
        </>
      )}
      {buyer && (
        <>
          <span className="opacity-50">·</span>
          <span className="truncate">{buyer}</span>
        </>
      )}
      <span className="opacity-70">⌄</span>
    </button>
  )
}

function compactDays(days) {
  if (days === null || days === undefined) return ''
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'today'
  if (days < 7) return `${days}d`
  if (days < 60) return `${Math.round(days / 7)}w`
  return `${Math.round(days / 30)}mo`
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
