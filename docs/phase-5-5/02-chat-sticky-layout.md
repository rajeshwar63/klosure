# Step 02 — Sticky chat header + sticky chat input

**Sprint:** B (Chat)
**Goal:** The deal title bar stays visible at the top while the chat scrolls. The reply input stays visible at the bottom. The user can always see context (top) and reply (bottom).

## The problem today

Currently, when you scroll up to read older messages in a long chat:
- The deal title bar (with name, stage chips, Share, Close buttons) scrolls away — you lose context
- The reply input scrolls away — you have to scroll all the way down to type

Every modern chat app (WhatsApp, iMessage, Slack, Telegram) keeps both pinned. We should too.

## File touched

- `src/components/ChatView.jsx` — main change
- `src/components/DealRoom.jsx` — may need layout adjustments depending on how the page is structured

## The layout

The deal page is a vertical flex container with three regions:

```
┌─────────────────────────────────┐
│  Sticky header                  │  ← deal title, stage chips, share, close
├─────────────────────────────────┤
│                                 │
│  Scrollable messages            │  ← only this scrolls
│  (oldest at top, newest at      │
│   bottom — auto-scrolls to      │
│   bottom on new messages)       │
│                                 │
├─────────────────────────────────┤
│  Sticky input                   │  ← textarea + send button
└─────────────────────────────────┘
```

## CSS structure

The page container becomes `flex` with `flex-direction: column` and locked to the viewport height (minus any global app chrome above it).

```css
.deal-room {
  display: flex;
  flex-direction: column;
  height: 100vh; /* or 100dvh on iOS to account for the dynamic viewport */
  overflow: hidden;
}

.deal-room-header {
  flex: 0 0 auto;             /* fixed height, doesn't grow */
  /* existing styles */
}

.deal-room-tabs {
  flex: 0 0 auto;             /* the Chat | Overview tab strip */
  /* existing styles */
}

.deal-room-body {
  flex: 1 1 auto;             /* takes remaining space */
  overflow-y: auto;            /* THIS is where scrolling happens */
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

.chat-input-bar {
  flex: 0 0 auto;             /* fixed at bottom */
  border-top: 0.5px solid var(--border);
  background: var(--bg-primary);
  padding-bottom: env(safe-area-inset-bottom, 0); /* iOS home indicator */
}
```

## Component structure

```jsx
// DealRoom.jsx — high-level layout
<div className="deal-room">
  <header className="deal-room-header">
    {/* existing header content — title, stage chips, share, close */}
  </header>

  <div className="deal-room-tabs">
    <DealRoomTabs activeTab={tab} onChange={setTab} />
  </div>

  {tab === 'Chat' ? (
    <ChatView dealId={dealId} viewerRole={viewerRole} />
  ) : (
    <OverviewView dealId={dealId} viewerRole={viewerRole} />
  )}
</div>
```

```jsx
// ChatView.jsx
<>
  <div className="deal-room-body chat-messages">
    {messages.map(m => <MessageBubble key={m.id} message={m} />)}
    <div ref={bottomRef} />
  </div>

  <div className="chat-input-bar">
    <ChatInput onSend={handleSend} />
  </div>
</>
```

Note that `chat-messages` and `chat-input-bar` are siblings inside the `deal-room` flex container — NOT nested. The flex layout is what makes the input stick at the bottom and the messages take the rest.

## Auto-scroll to bottom

When new messages arrive (real-time or after the user sends), scroll to the bottom:

```jsx
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages.length]);
```

If the user has manually scrolled up to read history, **don't** auto-scroll on new messages — they're reading. Detect "user has scrolled up" by checking if the scroll position is more than ~100px from the bottom.

```jsx
const [isAtBottom, setIsAtBottom] = useState(true);

function handleScroll() {
  const el = scrollAreaRef.current;
  if (!el) return;
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  setIsAtBottom(distance < 100);
}

useEffect(() => {
  if (isAtBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages.length, isAtBottom]);
```

If new messages arrive while the user is scrolled up, show a small "↓ N new messages" pill above the input that they can tap to jump to the bottom. (Optional — nice-to-have, not blocking.)

## Overview view

Same `deal-room-body` container — the Overview also scrolls inside that region. The header stays fixed for both tabs.

The Overview doesn't have a "sticky bottom" like the chat input — it just scrolls normally with the bottom of the page being its natural end.

## iOS specifics

- Use `100dvh` instead of `100vh` for the deal-room height — handles iOS Safari's dynamic toolbar correctly
- `env(safe-area-inset-bottom)` on the input bar — already from the PWA fix earlier
- `-webkit-overflow-scrolling: touch` for smooth momentum scrolling on the messages area

## Acceptance

- [ ] Open a deal with a long chat history (50+ messages) — header stays at top, input stays at bottom
- [ ] Scroll up to see oldest messages — header and input still visible
- [ ] Send a new message — chat scrolls to bottom automatically
- [ ] Scroll up to read old messages, then send a message → still scrolls to your new message at the bottom
- [ ] iOS PWA: keyboard pops up, input stays visible above it (this is browser default if our flex layout is correct — verify it still works)
- [ ] Switch to Overview tab → header still sticky, body scrolls
- [ ] Switch back to Chat → returns to where you left it (or scrolled to bottom — either is fine)
- [ ] Mobile 375px: layout stays correct, no horizontal overflow

→ Next: `03-chat-textarea-autoexpand.md`
