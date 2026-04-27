// Buyer-chat drawer — right-side slide-over wrapping the existing ChatView so
// the seller can talk to the buyer without leaving the dealroom canvas.
// The dealroom owns deal/messages/commitments state; we just pass it through.

import { useEffect } from 'react'
import ChatView from '../../ChatView.jsx'

export default function BuyerChatDrawer({
  open,
  onClose,
  deal,
  dealContext,
  messages,
  setMessages,
  commitments,
  kloThinking,
  setKloThinking,
  sellerName,
  prefill,
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="dealroom"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <button
        type="button"
        aria-label="Close chat"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(21, 19, 14, 0.35)',
          border: 'none',
          cursor: 'default',
        }}
      />
      <div
        className="flex flex-col"
        style={{
          position: 'relative',
          width: 'min(560px, 100vw)',
          background: 'var(--dr-surface)',
          borderLeft: '1px solid var(--dr-line)',
          boxShadow: '-12px 0 40px rgba(21, 19, 14, 0.18)',
          height: '100vh',
        }}
      >
        <div
          className="flex items-center gap-3 px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--dr-line)', background: 'var(--dr-bg)' }}
        >
          <div className="flex-1 min-w-0">
            <div
              className="font-medium truncate"
              style={{ fontSize: 14, color: 'var(--dr-ink)' }}
            >
              Chat with {deal?.buyer_company || 'buyer'}
            </div>
            <div
              className="dr-mono"
              style={{ fontSize: 10, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
            >
              Visible to both sides
            </div>
          </div>
          <button type="button" onClick={onClose} className="dr-btn">
            Close
          </button>
        </div>

        {prefill && (
          <div
            className="px-4 py-3 shrink-0"
            style={{
              background: 'var(--dr-accent-soft)',
              borderBottom: '1px solid var(--dr-line)',
              color: 'var(--dr-accent-ink)',
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            <div
              className="dr-mono mb-1"
              style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em' }}
            >
              Klo's suggestion
            </div>
            {prefill}
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col chat-doodle">
          <ChatView
            deal={deal}
            dealContext={dealContext}
            role="seller"
            currentUserName={sellerName}
            messages={messages}
            setMessages={setMessages}
            commitments={commitments}
            kloThinking={kloThinking}
            setKloThinking={setKloThinking}
            highlightCommitmentId={null}
            onHighlightConsumed={() => {}}
            locked={deal?.locked}
          />
        </div>
      </div>
    </div>
  )
}
