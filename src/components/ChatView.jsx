import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { requestKloCoaching } from '../services/klo.js'
import { formatTime } from '../lib/format.js'

// Phase 5.5 step 03: textarea grows from 1 line up to 4 lines, then scrolls.
// 22px leading + 8px top/bottom padding = 38px single-line; +3 extra lines
// caps at 38 + 22*3 = 104px.
const TEXTAREA_LINE_HEIGHT = 22
const TEXTAREA_MAX_HEIGHT = 38 + TEXTAREA_LINE_HEIGHT * 3

function placeholderFor(role, mode) {
  if (role === 'buyer') return 'Reply to the seller…'
  if (mode !== 'shared') return 'Message Klo…'
  return 'Message the room or ask Klo…'
}

// Chat half of the deal room. The shell (DealRoomPage.jsx) owns deal/messages
// state + the realtime channel; this view consumes them and handles the input
// box + timeline render.
export default function ChatView({
  deal,
  dealContext,
  role,
  currentUserName,
  messages,
  setMessages,
  kloThinking,
  setKloThinking,
  locked = false,
  readOnly = false,
}) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)
  // Phase 5.5 step 02: track whether the user is parked near the bottom of
  // the timeline. New messages arriving while they're scrolled up to read
  // history shouldn't yank the view away from what they're reading.
  const isAtBottomRef = useRef(true)

  // Phase 5.5 step 03: auto-grow the textarea from 1 up to 4 lines as the
  // user types, then enable internal scrolling. Heights match the explicit
  // leading-[22px] / py-2 below.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const max = TEXTAREA_MAX_HEIGHT
    const next = Math.min(ta.scrollHeight, max)
    ta.style.height = next + 'px'
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden'
  }, [input])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    isAtBottomRef.current = distance < 100
  }

  useEffect(() => {
    if (!scrollRef.current) return
    if (!isAtBottomRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, kloThinking])

  async function sendMessage(e) {
    e?.preventDefault()
    if (locked) return
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
    // Sending counts as engagement with the live conversation — snap back to
    // the bottom even if they were reading history a moment ago.
    isAtBottomRef.current = true

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

  // visible_to scopes Klo coaching to the speaker — see Phase 2 §8 "Views
  // diverge". RLS already enforces this server-side; this filter is just
  // belt-and-braces for any locally-cached state.
  const visibleMessages = useMemo(
    () => messages.filter((m) => !m.visible_to || m.visible_to === role),
    [messages, role]
  )

  return (
    <>
      <main
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto chat-doodle"
      >
        <div className="max-w-2xl mx-auto">
          {visibleMessages.map((m) => (
            <MessageRow key={m.id} message={m} viewerRole={role} />
          ))}
          {kloThinking && <KloTyping />}
        </div>
      </main>

      {readOnly && role === 'seller' ? (
        <div
          className="safe-bottom shrink-0"
          style={{
            background: 'var(--klo-bg-elev)',
            borderTop: '1px solid var(--klo-line)',
          }}
        >
          <div className="max-w-2xl mx-auto px-4 py-6 text-center">
            <p className="text-sm mb-3" style={{ color: 'var(--klo-text-dim)' }}>
              Klo coaching paused — your account is read-only.
            </p>
            <Link
              to="/billing"
              className="inline-block px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--klo-accent)', color: 'white' }}
            >
              Upgrade to resume
            </Link>
          </div>
        </div>
      ) : locked ? (
        <div
          className="safe-bottom shrink-0"
          style={{
            background: 'var(--klo-bg-elev)',
            borderTop: '1px solid var(--klo-line)',
          }}
        >
          <div
            className="max-w-2xl mx-auto px-3 py-3 text-center text-xs"
            style={{ color: 'var(--klo-text-dim)' }}
          >
            This room is read-only. Reopen the deal from the header to chat again.
          </div>
        </div>
      ) : (
        <form
          onSubmit={sendMessage}
          className="safe-bottom shrink-0"
          style={{
            background: 'var(--klo-bg-elev)',
            borderTop: '1px solid var(--klo-line)',
          }}
        >
          <div className="max-w-2xl mx-auto px-3 py-3 flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder={placeholderFor(role, deal.mode)}
              style={{
                lineHeight: `${TEXTAREA_LINE_HEIGHT}px`,
                maxHeight: `${TEXTAREA_MAX_HEIGHT}px`,
                border: '1px solid var(--klo-line-strong)',
                background: 'var(--klo-bg)',
                color: 'var(--klo-text)',
              }}
              className="flex-1 rounded-xl px-4 py-3 text-[15px] focus:outline-none resize-none overflow-y-hidden"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-lg w-11 h-11 flex items-center justify-center text-[15px] font-medium shrink-0 disabled:opacity-40"
              style={{ background: 'var(--klo-text)', color: '#fff' }}
              aria-label="Send"
            >
              ›
            </button>
          </div>
        </form>
      )}
    </>
  )
}

function MessageRow({ message }) {
  // System-sourced email / calendar / meeting messages render as compact
  // pills, not chat turns. Klo's reply that follows is the headline; the raw
  // signal is reference material the seller can expand if they want.
  // We accept both the Phase A nylas_* sources (legacy rows) and the Phase B
  // aurinko_*/recall_* sources, so old rooms keep rendering correctly.
  const source = message?.metadata?.source
  if (message.sender_type === 'system' && SOURCE_CONFIG[source]) {
    return <SignalPill message={message} />
  }

  const { sender_type, sender_name, content, created_at } = message
  const isKlo = sender_type === 'klo'
  const author = isKlo ? 'Klo' : sender_name || (sender_type === 'seller' ? 'You' : 'Buyer')
  return (
    <article
      className="px-4 md:px-6 py-4"
      style={{
        background: isKlo ? 'var(--klo-accent-soft)' : 'transparent',
        borderBottom: '1px solid var(--klo-line)',
      }}
    >
      <div className="flex items-baseline gap-2 mb-1.5">
        <span
          className="kl-mono text-[12px] uppercase font-medium"
          style={{
            color: isKlo ? 'var(--klo-accent)' : 'var(--klo-text-dim)',
            letterSpacing: '0.05em',
          }}
        >
          {author}
        </span>
        <span
          className="kl-mono text-[11px] ml-auto"
          style={{ color: 'var(--klo-text-mute)' }}
        >
          · {formatTime(created_at)} ·
        </span>
      </div>
      <p
        className="text-[15px] leading-relaxed whitespace-pre-wrap break-words"
        style={{ color: 'var(--klo-text)' }}
      >
        {content}
      </p>
    </article>
  )
}

// SignalPill renders email, calendar, and meeting events as a single muted
// line that expands to show the raw content. The visual goal: keep Klo's
// voice front and centre, demote the envelope to a footnote.
const SOURCE_CONFIG = {
  // Phase B (Aurinko + Recall):
  aurinko_email: { emoji: '📧', summarize: summarizeEmailHeader },
  aurinko_calendar_event: { emoji: '📅', summarize: summarizeCalendarHeader },
  recall_notetaker: { emoji: '🎙', summarize: summarizeMeetingHeader },
  // Phase A legacy (Nylas) — keep so rooms with old rows still render.
  nylas_email: { emoji: '📧', summarize: summarizeEmailHeader },
  nylas_calendar_event: { emoji: '📅', summarize: summarizeCalendarHeader },
  nylas_notetaker: { emoji: '🎙', summarize: summarizeMeetingHeader },
}

function SignalPill({ message }) {
  const [expanded, setExpanded] = useState(false)
  const { content, created_at } = message
  const source = message?.metadata?.source
  const config = SOURCE_CONFIG[source] ?? SOURCE_CONFIG.aurinko_email
  const summary = config.summarize(content)
  const cancelled = (content ?? '').startsWith('[CANCELLED] ')

  return (
    <article
      className="px-4 md:px-6 py-2"
      style={{
        background: 'transparent',
        borderBottom: '1px solid var(--klo-line)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left flex items-center gap-2 py-1 hover:opacity-80"
        aria-expanded={expanded}
      >
        <span aria-hidden className="text-[14px] leading-none">
          {config.emoji}
        </span>
        <span
          className="text-[13px] truncate"
          style={{
            color: 'var(--klo-text-dim)',
            textDecoration: cancelled ? 'line-through' : 'none',
          }}
        >
          {summary}
        </span>
        <span
          className="kl-mono text-[11px] ml-auto shrink-0"
          style={{ color: 'var(--klo-text-mute)' }}
        >
          · {formatTime(created_at)} · {expanded ? 'hide' : 'show'}
        </span>
      </button>
      {expanded && (
        <pre
          className="mt-2 text-[12px] leading-relaxed whitespace-pre-wrap break-words rounded p-3 max-h-[400px] overflow-auto"
          style={{
            color: 'var(--klo-text-dim)',
            background: 'var(--klo-bg-elev)',
            border: '1px solid var(--klo-line)',
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
          }}
        >
          {content}
        </pre>
      )}
    </article>
  )
}

function summarizeEmailHeader(content) {
  // The email processor formats the body as:
  //   EMAIL — <date>
  //   From: <addr>
  //   To: <list>
  //   Subject: <subj>
  //   <blank>
  //   <body>
  const lines = (content ?? '').split('\n', 6)
  const fromLine = lines.find((l) => l.startsWith('From:')) ?? ''
  const subjectLine = lines.find((l) => l.startsWith('Subject:')) ?? ''
  const from = fromLine.replace(/^From:\s*/, '').trim() || 'unknown sender'
  const subject = subjectLine.replace(/^Subject:\s*/, '').trim()
  return subject ? `Email from ${from} · ${subject}` : `Email from ${from}`
}

function summarizeMeetingHeader(content) {
  // The meeting processor formats:
  //   MEETING — <title> — <date> (<n> min)
  //   Participants: ...
  //   <blank>
  //   TRANSCRIPT:
  //   ...
  const firstLine = (content ?? '').split('\n', 1)[0] ?? ''
  // Strip the "MEETING — " prefix so the pill reads naturally.
  const stripped = firstLine.replace(/^MEETING\s*—\s*/, '').trim()
  return stripped ? `Meeting · ${stripped}` : 'Meeting transcript'
}

function summarizeCalendarHeader(content) {
  // The calendar processor formats:
  //   CALENDAR — <title> — <date> (<n> min)
  //   Participants: ...
  //   Provider: ...
  //   URL: ...
  // Cancellation prepends "[CANCELLED] " to the first line.
  const firstLine = (content ?? '').split('\n', 1)[0] ?? ''
  const stripped = firstLine
    .replace(/^\[CANCELLED\]\s*/, '')
    .replace(/^CALENDAR\s*—\s*/, '')
    .trim()
  return stripped ? `Meeting · ${stripped}` : 'Meeting on calendar'
}

function KloTyping() {
  return (
    <div
      className="px-4 md:px-6 py-3 text-xs flex items-center gap-1.5 klo-typing kl-mono uppercase"
      style={{
        color: 'var(--klo-accent)',
        background: 'var(--klo-accent-soft)',
        borderBottom: '1px solid var(--klo-line)',
        letterSpacing: '0.05em',
      }}
    >
      Klo is thinking <span>·</span><span>·</span><span>·</span>
    </div>
  )
}
