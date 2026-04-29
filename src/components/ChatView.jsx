import { useEffect, useMemo, useRef, useState } from 'react'
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

      {locked ? (
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
