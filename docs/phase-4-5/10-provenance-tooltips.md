# Step 10 — Provenance tooltips

**Goal:** Hover (desktop) or long-press (mobile) any Overview item to see the source message.

## Files touched

- `src/components/Tooltip.jsx` — small new reusable component
- `src/services/messageLookup.js` — caches message lookups
- `OverviewView.jsx` and section components — wrap renderable items in `<Tooltip>`

## `<Tooltip>` component

Lightweight, no library. Hover on desktop (`onMouseEnter`/`onMouseLeave`), long-press on touch (`onTouchStart` with 500ms timer).

```jsx
import { useState, useRef, useEffect } from 'react';

export default function Tooltip({ children, content }) {
  const [open, setOpen] = useState(false);
  const longPressTimer = useRef(null);

  if (!content) return children;

  const onTouchStart = () => {
    longPressTimer.current = setTimeout(() => setOpen(true), 500);
  };
  const onTouchEnd = () => {
    clearTimeout(longPressTimer.current);
  };

  return (
    <span
      className="tooltip-host"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {children}
      {open && <span className="tooltip-bubble">{content}</span>}
    </span>
  );
}
```

CSS: tooltip-bubble is absolutely positioned, max-width 280px, small font, white background, soft shadow, arrow pointing at host.

## Message lookup

```javascript
// src/services/messageLookup.js
const cache = new Map();

export async function getMessageSnippet(messageId) {
  if (!messageId) return null;
  if (cache.has(messageId)) return cache.get(messageId);

  const { data } = await supabase
    .from('messages')
    .select('content, sender_name, sender_type, created_at')
    .eq('id', messageId)
    .single();

  if (!data) return null;
  const snippet = {
    text: data.content.length > 200 ? data.content.slice(0, 200) + '…' : data.content,
    sender: data.sender_name,
    role: data.sender_type,
    when: new Date(data.created_at).toLocaleDateString()
  };
  cache.set(messageId, snippet);
  return snippet;
}
```

## Integration

For each renderable item in the Overview that has a `source_message_id`, render its label inside `<Tooltip>` with content like:

> *Added {date} from {sender}'s message:*
>
> *"{snippet}"*

Use a `useEffect` in each section component (or a shared hook) to fetch all needed snippets up-front when the Overview mounts, so hovering doesn't trigger network calls.

Items that need provenance:

- People → `first_seen_message_id`
- Blockers → `source_message_id`
- Open questions → `source_message_id`
- Decisions → `source_message_id`
- Deadline cell → `state.deadline.source_message_id`
- Value cell → `state.deal_value.source_message_id`

If `source_message_id` is null for any item, the tooltip just doesn't show — no crash, no empty bubble.

## Acceptance

- Hovering a person card shows source message
- Long-press on mobile (375px) shows tooltip after ~500ms
- Tooltip content shows the actual message snippet, sender name, and date
- Items without `source_message_id` don't break — they just don't show a tooltip
- Tooltips don't hammer the network (cache works)

→ Next: `11-remove-button-flow.md`
