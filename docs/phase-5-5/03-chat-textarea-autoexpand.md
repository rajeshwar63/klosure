# Step 03 — Auto-expanding chat textarea

**Sprint:** B (Chat)
**Goal:** The reply input is one line by default, grows up to 4 lines as the user types, then scrolls inside.

## The problem today

Chat input is a single-line `<input>`. Users typing longer messages can't see what they wrote. They have to send and scroll back, or use awkward keyboard navigation.

## The behavior

- **Empty:** one-line input, ~36px tall, placeholder "Reply to seller…" (or "Message the room or ask Klo…" depending on view)
- **As user types:** grows one line at a time as content overflows current line — up to 4 lines max
- **Beyond 4 lines:** stops growing, content scrolls inside the textarea
- **Enter:** sends the message
- **Shift+Enter:** newline (no send)
- **Empty after sending:** shrinks back to 1 line

## File touched

- `src/components/ChatInput.jsx` — replace the `<input>` with a `<textarea>` + auto-resize logic
- (Optional) extract resize logic into `src/hooks/useAutoResizeTextarea.js`

## Implementation

```jsx
// ChatInput.jsx
import { useRef, useState, useEffect } from 'react';

const LINE_HEIGHT = 22;        // px — match the textarea's actual line-height
const MAX_LINES = 4;
const MIN_HEIGHT = 36;          // px — single-line height including padding
const MAX_HEIGHT = MIN_HEIGHT + LINE_HEIGHT * (MAX_LINES - 1);

export default function ChatInput({ placeholder, onSend, disabled }) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const taRef = useRef(null);

  function resize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(Math.max(ta.scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    ta.style.height = next + 'px';
    ta.style.overflowY = ta.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }

  useEffect(() => { resize(); }, [value]);

  async function send() {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue('');
    } finally {
      setSending(false);
      // Refocus so user can keep typing
      taRef.current?.focus();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="chat-input">
      <button className="chat-input-plus" onClick={onPlus} aria-label="Propose commitment">+</button>
      <textarea
        ref={taRef}
        className="chat-input-textarea"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? 'Message the room or ask Klo…'}
        disabled={disabled || sending}
        rows={1}
      />
      <button
        className="chat-input-send"
        onClick={send}
        disabled={disabled || sending || !value.trim()}
        aria-label="Send"
      >
        ›
      </button>
    </div>
  );
}
```

## CSS

```css
.chat-input {
  display: flex;
  align-items: flex-end;       /* keep send button bottom-aligned as textarea grows */
  gap: 8px;
  padding: 8px 12px;
}

.chat-input-textarea {
  flex: 1;
  min-height: 36px;
  max-height: 102px;            /* matches MAX_HEIGHT in JS — 4 lines */
  padding: 8px 14px;
  font-size: 15px;
  line-height: 22px;            /* matches LINE_HEIGHT in JS */
  border: 0.5px solid var(--border);
  border-radius: 18px;          /* pill shape on a single line, transitions to rounded rect */
  resize: none;                 /* never user-resizable */
  font-family: inherit;
  background: var(--bg-secondary);
  outline: none;
  overflow-y: hidden;            /* JS toggles to 'auto' when over MAX_HEIGHT */
  transition: border-color 0.15s ease;
}

.chat-input-textarea:focus {
  border-color: var(--accent-primary);
}

.chat-input-plus,
.chat-input-send {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  /* keep existing button styles */
}
```

## Mobile keyboard behavior

On iOS, when the keyboard pops up:
- The textarea expansion still works
- The visible viewport shrinks (handled by `100dvh` from step 02)
- The input bar stays visible above the keyboard — handled by browser default with the flex layout

If you observe the input bar disappearing behind the keyboard, that's a Phase 5.5 bug — likely the `100vh` vs `100dvh` issue. Step 02 should have fixed it; if it didn't, fix the height units before moving on.

## Don't forget — placeholder text

The placeholder differs by context:
- Buyer in shared mode: "Reply to the seller…"
- Seller in solo mode: "Message Klo…"
- Seller in shared mode: "Message the room or ask Klo…"

Pass the right placeholder from the parent based on `viewerRole` and `mode`.

## Acceptance

- [ ] Empty input is one line, ~36px tall, pill-shaped
- [ ] Type a long message — input grows one line at a time
- [ ] Reach 4 lines — input stops growing, content scrolls inside
- [ ] Press Enter — message sends, input shrinks back to 1 line, focus stays
- [ ] Press Shift+Enter — newline added, no send
- [ ] Send button disabled when empty or when sending
- [ ] "+" button still works (proposes commitment)
- [ ] iOS: keyboard pops up, expansion still works
- [ ] No regression to message sending logic — chats land in DB correctly

→ Next: `04-chat-compact-pills.md`
