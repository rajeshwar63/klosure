import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { getKloResponse, greetingForRole } from '../services/klo.js'
import { formatCurrency, formatDeadline, formatRelativeDate, formatTime } from '../lib/format.js'

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

// Shared deal room used by both seller and buyer views.
export default function DealRoom({ deal, dealContext, role, currentUserName, onBack }) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [kloThinking, setKloThinking] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const scrollRef = useRef(null)

  const stakeholders = dealContext?.stakeholders ?? []

  // Initial fetch + realtime subscription
  useEffect(() => {
    if (!deal?.id) return
    let mounted = true
    async function load() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('deal_id', deal.id)
        .order('created_at', { ascending: true })
      if (!mounted) return
      if (error) {
        console.error('Failed to load messages', error)
        return
      }
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

    const channel = supabase
      .channel(`deal-${deal.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `deal_id=eq.${deal.id}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.find((m) => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [deal?.id, role])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, kloThinking])

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
    // Replace optimistic with real
    setMessages((m) => m.map((msg) => (msg.id === optimistic.id ? data : msg)))
    setSending(false)

    // Klo responds — Phase 1 stub. Phase 2 swaps in Claude API.
    setKloThinking(true)
    try {
      const reply = await getKloResponse({
        deal,
        dealContext,
        messages: [...messages, data],
        role,
        mode: deal.mode
      })
      await supabase.from('messages').insert({
        deal_id: deal.id,
        sender_type: 'klo',
        sender_name: 'Klo',
        content: reply
      })
    } catch (err) {
      console.error('Klo failed', err)
    } finally {
      setKloThinking(false)
    }
  }

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
              <span className={`w-2 h-2 rounded-full ${HEALTH_DOT[deal.health] ?? 'bg-emerald-500'}`} />
              <h1 className="font-semibold truncate">{deal.title}</h1>
            </div>
            <p className="text-xs text-white/60 truncate">
              {role === 'buyer' ? `${deal.seller_company || 'Seller'} · Klo coaching live` : `${deal.buyer_company || 'Buyer'} · ${STAGE_LABEL[deal.stage]}`}
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
            <Pill>{formatCurrency(deal.value)}</Pill>
            <Pill>{formatDeadline(deal.deadline)}</Pill>
            <Pill>{deal.mode === 'shared' ? 'Shared' : 'Solo'}</Pill>
            {stakeholders.slice(0, 3).map((s, i) => (
              <Pill key={i}>{s.name}{s.role ? ` · ${s.role}` : ''}</Pill>
            ))}
          </div>
        </div>
      </header>

      {/* Klo summary bar (Phase 2 will populate live; for Phase 1 we show context) */}
      <KloSummaryBar deal={deal} dealContext={dealContext} />

      {/* Chat area */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto chat-doodle px-3 py-3">
        <div className="max-w-2xl mx-auto space-y-2">
          {messages.map((m) => (
            <Bubble key={m.id} message={m} viewerRole={role} />
          ))}
          {kloThinking && <KloTyping />}
        </div>
      </main>

      {/* Input */}
      <form onSubmit={sendMessage} className="bg-[#f0f0f0] border-t border-navy/10 safe-bottom shrink-0">
        <div className="max-w-2xl mx-auto px-3 py-2 flex items-end gap-2">
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
            className="bg-klo hover:bg-klo/90 disabled:opacity-40 text-white rounded-full w-11 h-11 flex items-center justify-center font-bold"
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

function KloSummaryBar({ deal, dealContext }) {
  // Phase 1: a static derived summary. Phase 2: Klo generates this live.
  const next = dealContext?.what_needs_to_happen?.split('.').filter(Boolean)[0]?.trim()
  const summary = next
    ? `Next: ${next}.`
    : `Solo room ready. Tell Klo where the deal stands and get a move.`
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
