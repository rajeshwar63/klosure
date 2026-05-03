import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import {
  ensureRepThread,
  listThreadMessages,
  askRepKlo,
} from '../services/repKlo.js'
import { supabase } from '../lib/supabase.js'
import { formatTime } from '../lib/format.js'

const SUGGESTIONS = [
  'Which of my deals are slipping?',
  'Where should I focus today?',
  'Draft follow-ups for stale deals.',
  "What's at risk this week?",
]

// Rep-only chat surface. Lives at /askklo in the sidebar next to Today and
// Deals. Same Klo voice the rep already hears inside each deal room, but
// scoped across their whole pipeline so they don't have to open 20+ rooms to
// ask "which deals are slipping?".
export default function RepKloPanel() {
  const { user } = useAuth()
  const [thread, setThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!user) return
    let mounted = true
    async function init() {
      const t = await ensureRepThread({ userId: user.id })
      if (!mounted || !t) return
      setThread(t)
      const list = await listThreadMessages(t.id)
      if (!mounted) return
      setMessages(list)
    }
    init()
    return () => {
      mounted = false
    }
  }, [user])

  // Realtime: pick up Klo's reply (written by the edge function) the moment
  // it lands, just like per-deal chat and the manager panel.
  useEffect(() => {
    if (!thread?.id) return
    const channel = supabase
      .channel(`rep-thread-${thread.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rep_messages',
          filter: `thread_id=eq.${thread.id}`,
        },
        (payload) => {
          if (payload.new.sender === 'klo') setThinking(false)
          setMessages((prev) => {
            if (prev.find((m) => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [thread?.id])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, thinking])

  async function handleAsk(question) {
    const text = (question ?? input).trim()
    if (!text || !thread || thinking) return
    setError('')
    setInput('')
    setThinking(true)
    const res = await askRepKlo({ thread, question: text })
    if (!res.ok) {
      setThinking(false)
      setError(res.error || 'Could not send your question.')
      return
    }
    if (res.viaStub) {
      // Stub already inserted both rows; turn thinking off ourselves since the
      // realtime subscription won't fire for service-role-less inserts.
      setThinking(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-navy/10 flex flex-col" style={{ minHeight: '60vh' }}>
      <div className="px-4 py-3 border-b border-navy/10">
        <p className="text-xs uppercase tracking-wider text-klo font-semibold">◆ Ask Klo</p>
        <p className="text-sm text-navy/70 mt-0.5">
          Pipeline-level coaching. Klo reads every active deal you own.
        </p>
        {error && (
          <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
            {error}
          </p>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 max-h-[55vh]">
        {messages.length === 0 && !thinking && (
          <div className="text-center py-6">
            <p className="text-navy/50 text-sm mb-3">Try one of these:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleAsk(s)}
                  className="text-xs bg-klo-bg border border-klo/30 text-navy hover:bg-klo/10 px-3 py-1.5 rounded-full"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {thinking && (
          <div className="flex justify-center">
            <div className="bg-klo-bg border border-klo/30 px-3 py-2 rounded-xl text-klo text-xs flex items-center gap-1.5 klo-typing">
              <span>◆</span> Klo is thinking
              <span>·</span><span>·</span><span>·</span>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleAsk()
        }}
        className="border-t border-navy/10 p-3 flex items-end gap-2"
      >
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleAsk()
            }
          }}
          placeholder="Ask Klo about your pipeline…"
          className="flex-1 bg-white border border-navy/15 rounded-2xl px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-klo/30 max-h-32 resize-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || thinking}
          className="bg-klo hover:bg-klo/90 disabled:opacity-40 text-white rounded-full w-11 h-11 flex items-center justify-center font-bold shrink-0"
          aria-label="Send"
        >
          ›
        </button>
      </form>
    </div>
  )
}

function Bubble({ message }) {
  const { sender, content, created_at } = message
  if (sender === 'klo') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] bg-klo-bg border border-klo/30 text-navy px-3 py-2 rounded-xl text-[14px] leading-snug">
          <div className="flex items-center gap-1.5 text-klo text-[11px] font-semibold mb-0.5">
            <span>◆</span> Klo
          </div>
          <div className="whitespace-pre-wrap">{content}</div>
          <div className="text-[10px] text-navy/40 text-right mt-0.5">{formatTime(created_at)}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] bg-seller-bubble text-navy px-3 py-2 rounded-2xl rounded-br-md text-[14px] leading-snug shadow-sm">
        <div className="whitespace-pre-wrap break-words">{content}</div>
        <div className="text-[10px] text-navy/40 text-right mt-0.5">{formatTime(created_at)}</div>
      </div>
    </div>
  )
}
