// Klo chat pane — seller-private chat with Klo. Reads the existing messages
// stream filtered to seller-private items (Klo coaching + the seller's own
// messages with visible_to='seller' or null). Posts via services/klo.js.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase.js'
import { requestKloCoaching } from '../../../services/klo.js'

const QUICK_PROMPTS = [
  { label: 'Draft email', prompt: 'Draft an email I can send right now to keep this deal moving.' },
  { label: "What's risky", prompt: 'What are the biggest risks on this deal right now? Be specific.' },
  { label: 'Next step', prompt: 'What is the single next step I should take, and why?' },
]

function isSellerVisible(m) {
  if (m.sender_type === 'buyer') return false
  if (m.sender_type === 'klo') {
    if (!m.visible_to || m.visible_to === 'all' || m.visible_to === 'seller') return true
    return false
  }
  // seller-authored
  if (!m.visible_to || m.visible_to === 'all' || m.visible_to === 'seller') return true
  return false
}

function timeOnly(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function KloChatPane({
  deal,
  messages,
  setMessages,
  commitments,
  kloThinking,
  setKloThinking,
}) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)

  const visible = (messages ?? []).filter(isSellerVisible)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [visible.length, kloThinking])

  async function send(text) {
    const trimmed = (text ?? '').trim()
    if (!trimmed || sending) return
    setSending(true)
    setInput('')

    // Insert seller-private message (Klo coaching is private to the seller).
    const optimistic = {
      id: `tmp-${Date.now()}`,
      deal_id: deal.id,
      sender_type: 'seller',
      sender_name: 'You',
      content: trimmed,
      visible_to: 'seller',
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])

    const { data: inserted } = await supabase
      .from('messages')
      .insert({
        deal_id: deal.id,
        sender_type: 'seller',
        sender_name: 'You',
        content: trimmed,
        visible_to: 'seller',
      })
      .select()
      .single()

    if (inserted) {
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? inserted : m)))
    }

    setKloThinking(true)
    await requestKloCoaching({
      deal,
      dealContext: null,
      messages: [...visible, optimistic],
      role: 'seller',
      mode: deal?.mode ?? 'solo',
    })
    // setKloThinking(false) happens when the Klo message arrives via realtime.
    setSending(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 320 }}>
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.5,
          color: 'var(--dr-ink-2)',
          letterSpacing: '-0.005em',
          marginBottom: 14,
        }}
      >
        I'm <span style={{ color: 'var(--dr-accent)', fontWeight: 500 }}>Klo</span>.
        I read the room and tell you what to do next. Ask me anything about
        this deal.
      </p>

      <div ref={scrollRef} className="flex flex-col gap-2.5 mb-3" style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
        {visible.map((m) => {
          if (m.sender_type === 'klo') {
            return (
              <div
                key={m.id}
                style={{
                  background: 'var(--dr-surface)',
                  border: '1px solid var(--dr-line)',
                  borderRadius: 6,
                  borderTopLeftRadius: 2,
                  padding: '10px 12px',
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: 'var(--dr-ink)',
                  alignSelf: 'flex-start',
                  maxWidth: '94%',
                  letterSpacing: '-0.005em',
                  whiteSpace: 'pre-line',
                }}
              >
                <div
                  className="dr-mono flex items-center gap-1.5"
                  style={{
                    fontSize: 9.5,
                    color: 'var(--dr-accent)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      background: 'var(--dr-accent)',
                      transform: 'rotate(45deg)',
                      display: 'inline-block',
                    }}
                  />
                  Klo · {timeOnly(m.created_at)}
                </div>
                {m.content}
              </div>
            )
          }
          return (
            <div
              key={m.id}
              style={{
                background: 'var(--dr-ink)',
                color: 'var(--dr-bg)',
                borderRadius: 6,
                borderTopRightRadius: 2,
                padding: '10px 12px',
                fontSize: 13,
                lineHeight: 1.5,
                alignSelf: 'flex-end',
                maxWidth: '94%',
                letterSpacing: '-0.005em',
                whiteSpace: 'pre-line',
              }}
            >
              {m.content}
            </div>
          )
        })}
        {kloThinking && (
          <div
            className="dr-mono"
            style={{
              fontSize: 10,
              color: 'var(--dr-ink-3)',
              alignSelf: 'flex-start',
              padding: '4px 8px',
            }}
          >
            Klo is thinking…
          </div>
        )}
      </div>

      <div
        style={{
          border: '1px solid var(--dr-line)',
          borderRadius: 6,
          background: 'var(--dr-surface)',
          padding: '8px 10px',
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Klo about this deal…"
          rows={2}
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 13,
            color: 'var(--dr-ink)',
            resize: 'none',
            minHeight: 36,
            fontFamily: 'inherit',
            lineHeight: 1.5,
          }}
        />
        <div
          className="flex items-center justify-between pt-1.5 mt-1"
          style={{ borderTop: '1px solid var(--dr-line)' }}
        >
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => send(q.prompt)}
                disabled={sending}
                className="dr-mono"
                style={{
                  fontSize: 10.5,
                  color: 'var(--dr-ink-2)',
                  background: 'var(--dr-bg-2)',
                  padding: '3px 8px',
                  borderRadius: 3,
                  border: 'none',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {q.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => send(input)}
            disabled={sending || !input.trim()}
            style={{
              background: 'var(--dr-ink)',
              color: 'var(--dr-bg)',
              border: 'none',
              borderRadius: 4,
              width: 28,
              height: 28,
              fontSize: 13,
              cursor: sending ? 'wait' : 'pointer',
              opacity: sending || !input.trim() ? 0.5 : 1,
            }}
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
