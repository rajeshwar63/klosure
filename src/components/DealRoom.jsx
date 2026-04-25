import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { greetingForRole, requestKloCoaching } from '../services/klo.js'
import {
  listCommitments,
  proposeCommitment,
  confirmCommitment,
  declineCommitment,
  markCommitmentDone,
} from '../services/commitments.js'
import { formatCurrency, formatDeadline, formatTime, daysUntil } from '../lib/format.js'

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

// Shared deal room used by both seller and buyer views.
export default function DealRoom({ deal: dealProp, dealContext, role, currentUserName, onBack }) {
  const navigate = useNavigate()
  const [deal, setDeal] = useState(dealProp)
  const [messages, setMessages] = useState([])
  const [commitments, setCommitments] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [kloThinking, setKloThinking] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [proposeOpen, setProposeOpen] = useState(false)
  const scrollRef = useRef(null)

  const stakeholders = dealContext?.stakeholders ?? []
  const otherRole = role === 'seller' ? 'buyer' : 'seller'
  const otherName = role === 'seller'
    ? (deal.buyer_company || 'Buyer')
    : (deal.seller_company || 'Seller')

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, commitments, kloThinking])

  async function sendMessage(e) {
    e?.preventDefault()
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    const optimistic = {
      id: `tmp-${Date.now()}`,
      deal_id: deal.id,
      sender_type: role,
      sender_name: currentUserName,
      content,
      created_at: new Date().toISOString(),
      _optimistic: true
    }
    setMessages((m) => [...m, optimistic])
    setInput('')

    const { data, error } = await supabase
      .from('messages')
      .insert({
        deal_id: deal.id,
        sender_type: role,
        sender_name: currentUserName,
        content
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to send', error)
      setMessages((m) => m.filter((msg) => msg.id !== optimistic.id))
      setSending(false)
      return
    }
    setMessages((m) => m.map((msg) => (msg.id === optimistic.id ? data : msg)))
    setSending(false)

    setKloThinking(true)
    try {
      await requestKloCoaching({
        deal,
        dealContext,
        messages: [...messages, data],
        role,
        mode: deal.mode
      })
    } catch (err) {
      console.error('Klo failed', err)
    } finally {
      setKloThinking(false)
    }
  }

  async function handlePropose({ owner, ownerName, task, dueDate }) {
    const res = await proposeCommitment({
      deal,
      role,
      proposerName: currentUserName,
      owner,
      ownerName,
      task,
      dueDate,
    })
    if (!res.ok) {
      alert(`Couldn't propose: ${res.error}`)
      return false
    }
    setProposeOpen(false)
    return true
  }

  async function handleConfirm(c) {
    const res = await confirmCommitment({
      commitmentId: c.id,
      role,
      confirmerName: currentUserName,
    })
    if (!res.ok) alert(`Couldn't confirm: ${res.error}`)
  }

  async function handleDecline(c) {
    if (!confirm(`Decline this commitment?\n\n"${c.task}"`)) return
    const res = await declineCommitment({
      commitmentId: c.id,
      role,
      declinerName: currentUserName,
    })
    if (!res.ok) alert(`Couldn't decline: ${res.error}`)
  }

  async function handleDone(c) {
    const res = await markCommitmentDone({ commitmentId: c.id })
    if (!res.ok) alert(`Couldn't mark done: ${res.error}`)
  }

  // visible_to scopes Klo coaching to the speaker — see Phase 2 §8 "Views
  // diverge". RLS already enforces this server-side; this filter is just
  // belt-and-braces for any locally-cached state.
  const visibleMessages = useMemo(
    () => messages.filter((m) => !m.visible_to || m.visible_to === role),
    [messages, role]
  )

  // Merge messages + commitments into a single chronological timeline so a
  // commitment card appears at the moment it was proposed, between the chat
  // bubbles. Sort is stable on created_at ascending.
  const timeline = useMemo(() => {
    const items = [
      ...visibleMessages.map((m) => ({ kind: 'message', ts: m.created_at, key: `m-${m.id}`, data: m })),
      ...commitments.map((c) => ({ kind: 'commitment', ts: c.created_at, key: `c-${c.id}`, data: c })),
    ]
    items.sort((a, b) => new Date(a.ts) - new Date(b.ts))
    return items
  }, [visibleMessages, commitments])

  const shareUrl = useMemo(() => {
    if (!deal?.buyer_token) return ''
    const base = import.meta.env.VITE_APP_URL || window.location.origin
    return `${base.replace(/\/$/, '')}/join/${deal.buyer_token}`
  }, [deal?.buyer_token])

  return (
    <div className="min-h-screen flex flex-col bg-chat-bg">
      {/* Top bar */}
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

      {/* Klo summary bar — populated live by the klo-respond edge function */}
      <KloSummaryBar deal={deal} dealContext={dealContext} />

      {/* Chat area — interleaved messages + commitment cards */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto chat-doodle px-3 py-3">
        <div className="max-w-2xl mx-auto space-y-2">
          {timeline.map((item) =>
            item.kind === 'message' ? (
              <Bubble key={item.key} message={item.data} viewerRole={role} />
            ) : (
              <CommitmentCard
                key={item.key}
                commitment={item.data}
                viewerRole={role}
                onConfirm={() => handleConfirm(item.data)}
                onDecline={() => handleDecline(item.data)}
                onDone={() => handleDone(item.data)}
              />
            )
          )}
          {kloThinking && <KloTyping />}
        </div>
      </main>

      {/* Input */}
      <form onSubmit={sendMessage} className="bg-[#f0f0f0] border-t border-navy/10 safe-bottom shrink-0">
        <div className="max-w-2xl mx-auto px-3 py-2 flex items-end gap-2">
          <button
            type="button"
            onClick={() => setProposeOpen(true)}
            className="bg-white border border-navy/10 hover:border-klo hover:text-klo text-navy/60 rounded-full w-11 h-11 flex items-center justify-center text-2xl leading-none shrink-0"
            aria-label="Propose a commitment"
            title="Propose a commitment"
          >
            +
          </button>
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder={role === 'buyer' ? 'Reply to the seller…' : 'Message the room or ask Klo…'}
            className="flex-1 bg-white rounded-2xl px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-klo/30 max-h-32 resize-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-klo hover:bg-klo/90 disabled:opacity-40 text-white rounded-full w-11 h-11 flex items-center justify-center font-bold shrink-0"
            aria-label="Send"
          >
            ›
          </button>
        </div>
      </form>

      {shareOpen && (
        <ShareModal
          deal={deal}
          shareUrl={shareUrl}
          onClose={() => setShareOpen(false)}
        />
      )}

      {proposeOpen && (
        <ProposeCommitmentModal
          role={role}
          currentUserName={currentUserName}
          otherRole={otherRole}
          otherName={otherName}
          isSolo={deal.mode !== 'shared'}
          onClose={() => setProposeOpen(false)}
          onSubmit={handlePropose}
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

function Bubble({ message, viewerRole }) {
  const { sender_type, sender_name, content, created_at } = message
  if (sender_type === 'klo') {
    return (
      <div className="flex justify-center my-1">
        <div className="max-w-[85%] bg-klo-bg border border-klo/30 text-navy px-3 py-2 rounded-xl text-[14px] leading-snug">
          <div className="flex items-center gap-1.5 text-klo text-[11px] font-semibold mb-0.5">
            <span>◆</span> Klo
          </div>
          <div>{content}</div>
          <div className="text-[10px] text-navy/40 text-right mt-0.5">{formatTime(created_at)}</div>
        </div>
      </div>
    )
  }
  const isMine = sender_type === viewerRole
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] px-3 py-2 rounded-2xl text-[14px] leading-snug shadow-sm ${
          isMine
            ? 'bg-seller-bubble text-navy rounded-br-md'
            : 'bg-white text-navy rounded-bl-md'
        }`}
      >
        {!isMine && sender_name && (
          <div className="text-[11px] font-semibold text-klo">{sender_name}</div>
        )}
        <div className="whitespace-pre-wrap break-words">{content}</div>
        <div className="text-[10px] text-navy/40 text-right mt-0.5">
          {formatTime(created_at)}
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// CommitmentCard — locked card that lives in the chat timeline. Distinct from
// a chat bubble so it visually reads as "tracked work", not conversation.
//   proposed  — viewer is the OTHER side: Confirm / Decline buttons
//             — viewer is the proposer:   "Awaiting confirmation"
//   confirmed — locked, optionally "Mark done" if viewer can claim it
//   overdue   — red border, "overdue by N days"
//   done      — muted, strikethrough
//   declined  — muted, "Declined"
// -----------------------------------------------------------------------------
function CommitmentCard({ commitment, viewerRole, onConfirm, onDecline, onDone }) {
  const {
    status,
    task,
    due_date,
    owner,
    owner_name,
    proposed_by,
    proposer_name,
    confirmed_by_name,
  } = commitment

  const ownerLabel = owner_name?.trim() || (owner === 'seller' ? 'Seller' : 'Buyer')
  const proposerLabel = proposer_name?.trim() || (proposed_by === 'seller' ? 'Seller' : 'Buyer')
  const days = daysUntil(due_date)

  const tone = (() => {
    if (status === 'overdue') return 'border-red-400 bg-red-50'
    if (status === 'declined') return 'border-navy/15 bg-white opacity-60'
    if (status === 'done') return 'border-emerald-300 bg-emerald-50'
    if (status === 'confirmed') return 'border-klo/40 bg-white'
    return 'border-amber-300 bg-amber-50' // proposed
  })()

  const statusBadge = (() => {
    if (status === 'overdue') {
      const overdueDays = days !== null ? Math.abs(days) : null
      return { text: overdueDays !== null ? `Overdue · ${overdueDays}d` : 'Overdue', tone: 'bg-red-500 text-white' }
    }
    if (status === 'declined') return { text: 'Declined', tone: 'bg-navy/30 text-white' }
    if (status === 'done') return { text: 'Done', tone: 'bg-emerald-500 text-white' }
    if (status === 'confirmed') return { text: 'Locked', tone: 'bg-klo text-white' }
    return { text: 'Awaiting confirmation', tone: 'bg-amber-500 text-white' }
  })()

  const dueLabel = (() => {
    if (!due_date) return 'No due date'
    if (days === null) return ''
    if (days < 0) return `Was due ${Math.abs(days)}d ago`
    if (days === 0) return 'Due today'
    if (days === 1) return 'Due tomorrow'
    return `Due in ${days}d`
  })()

  const isProposer = proposed_by === viewerRole
  const isOwner = owner === viewerRole
  const canConfirm = status === 'proposed' && !isProposer
  const canMarkDone = (status === 'confirmed' || status === 'overdue') && isOwner

  return (
    <div className="flex justify-center my-2">
      <div className={`w-full max-w-[92%] rounded-xl border ${tone} px-4 py-3 shadow-sm`}>
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-navy/50">
            <LockIcon />
            <span>Commitment</span>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge.tone}`}>
            {statusBadge.text}
          </span>
        </div>

        <p className={`text-[14px] font-medium text-navy leading-snug mb-1 ${status === 'done' ? 'line-through opacity-70' : ''}`}>
          {task}
        </p>

        <div className="flex items-center justify-between gap-2 text-[11px] text-navy/60">
          <span>
            <span className="font-semibold text-navy/80">{ownerLabel}</span>
            <span className="text-navy/40"> · {dueLabel}</span>
          </span>
          <span className="text-navy/40">Proposed by {proposerLabel}</span>
        </div>

        {(canConfirm || canMarkDone || (status === 'proposed' && isProposer)) && (
          <div className="mt-3 flex items-center gap-2">
            {canConfirm && (
              <>
                <button
                  onClick={onConfirm}
                  className="bg-klo hover:bg-klo/90 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg"
                >
                  Confirm
                </button>
                <button
                  onClick={onDecline}
                  className="text-navy/60 hover:text-navy text-[12px] font-semibold px-3 py-1.5 rounded-lg"
                >
                  Decline
                </button>
              </>
            )}
            {status === 'proposed' && isProposer && (
              <span className="text-[11px] text-navy/40 italic">
                Waiting for the other side to confirm…
              </span>
            )}
            {canMarkDone && (
              <button
                onClick={onDone}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg"
              >
                Mark done
              </button>
            )}
          </div>
        )}

        {status === 'confirmed' && confirmed_by_name && !canMarkDone && (
          <p className="mt-2 text-[10px] text-navy/40">
            Confirmed by {confirmed_by_name}
          </p>
        )}
      </div>
    </div>
  )
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function KloTyping() {
  return (
    <div className="flex justify-center">
      <div className="bg-klo-bg border border-klo/30 px-3 py-2 rounded-xl text-klo text-xs flex items-center gap-1.5 klo-typing">
        <span>◆</span> Klo is thinking
        <span>·</span><span>·</span><span>·</span>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// ProposeCommitmentModal — small form to add a new commitment to the deal.
// In shared mode the user picks who owns it (themselves or the other party).
// In solo mode the only option is "I'll do it" since there's no other party,
// and the resulting row auto-confirms in the service layer.
// -----------------------------------------------------------------------------
function ProposeCommitmentModal({
  role,
  currentUserName,
  otherRole,
  otherName,
  isSolo,
  onClose,
  onSubmit,
}) {
  const defaultDue = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    return d.toISOString().slice(0, 10)
  }, [])

  const [task, setTask] = useState('')
  const [dueDate, setDueDate] = useState(defaultDue)
  const [owner, setOwner] = useState(role) // default: I'll do it
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!task.trim() || submitting) return
    setSubmitting(true)
    const ownerName = owner === role ? currentUserName : otherName
    const ok = await onSubmit({ owner, ownerName, task, dueDate })
    if (!ok) setSubmitting(false)
  }

  const myLabel = `${currentUserName || 'I'} ${currentUserName ? '' : 'will do it'}`.trim() || "I'll do it"
  const otherLabel = `${otherName} will do it`

  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-semibold text-navy">Propose a commitment</h2>
            <p className="text-xs text-navy/60">
              {isSolo
                ? 'Solo mode — this locks immediately. Klo will track it.'
                : `${otherName} will see this and confirm before it locks.`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-navy/40 hover:text-navy text-xl leading-none px-2">
            ×
          </button>
        </div>

        <label className="block mb-3">
          <span className="block text-xs font-medium text-navy/70 mb-1">What needs to happen</span>
          <textarea
            autoFocus
            rows={2}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. Send revised proposal with pricing options"
            className="w-full border border-navy/15 rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-klo focus:ring-2 focus:ring-klo/20 resize-none"
            required
          />
        </label>

        <label className="block mb-3">
          <span className="block text-xs font-medium text-navy/70 mb-1">Due by</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className="w-full border border-navy/15 rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-klo focus:ring-2 focus:ring-klo/20"
            required
          />
        </label>

        <div className="block mb-4">
          <span className="block text-xs font-medium text-navy/70 mb-1">Who owns it</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOwner(role)}
              className={`text-[13px] font-semibold py-2.5 rounded-lg border transition ${
                owner === role
                  ? 'bg-klo text-white border-klo'
                  : 'bg-white text-navy/70 border-navy/15 hover:border-klo'
              }`}
            >
              {myLabel || "I'll do it"}
            </button>
            <button
              type="button"
              disabled={isSolo}
              onClick={() => setOwner(otherRole)}
              className={`text-[13px] font-semibold py-2.5 rounded-lg border transition ${
                owner === otherRole
                  ? 'bg-klo text-white border-klo'
                  : 'bg-white text-navy/70 border-navy/15 hover:border-klo'
              } ${isSolo ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={isSolo ? 'Share the room with the buyer to assign them work' : ''}
            >
              {otherLabel}
            </button>
          </div>
        </div>

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
            disabled={!task.trim() || submitting}
            className="flex-1 bg-klo hover:bg-klo/90 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl"
          >
            {submitting ? 'Adding…' : isSolo ? 'Lock it' : 'Propose'}
          </button>
        </div>
      </form>
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
