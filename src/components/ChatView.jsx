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
        className="flex-1 overflow-y-auto chat-doodle px-3 py-3"
      >
        <div className="max-w-2xl mx-auto space-y-2">
          {visibleMessages.map((m) => (
            <Bubble key={m.id} message={m} viewerRole={role} />
          ))}
          {kloThinking && <KloTyping />}
        </div>
      </main>

      {locked ? (
        <div className="bg-[#f0f0f0] border-t border-navy/10 safe-bottom shrink-0">
          <div className="max-w-2xl mx-auto px-3 py-3 text-center text-xs text-navy/60">
            This room is read-only. Reopen the deal from the header to chat again.
          </div>
        </div>
      ) : (
        <form onSubmit={sendMessage} className="bg-[#f0f0f0] border-t border-navy/10 safe-bottom shrink-0">
          <div className="max-w-2xl mx-auto px-3 py-2 flex items-end gap-2">
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
              style={{ lineHeight: `${TEXTAREA_LINE_HEIGHT}px`, maxHeight: `${TEXTAREA_MAX_HEIGHT}px` }}
              className="flex-1 bg-white rounded-2xl px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-klo/30 resize-none overflow-y-hidden"
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
      )}
    </>
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
