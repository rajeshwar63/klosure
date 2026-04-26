# Step 04 — Compact deal pill strip in the chat

**Sprint:** B (Chat)
**Goal:** Collapse the dense pill row (Proposal · Stuck · $20,000 · 36 days · Solo · Nina) into a single chip that expands on tap.

## The problem today

The deal room header shows a row of 6 pills below the deal title:

```
Proposal · Stuck · $20,000 · 36 days left · Solo · Nina · L&D Manager
```

Each pill is information the seller might want — but seeing all of them on every chat message is visual noise. Worse, it eats vertical space that should belong to the conversation.

## The behavior

**Default state — collapsed.** A single chip below the deal title:

```
⚠ Stuck · 36d · DIB
```

Three pieces, separated by middots:
- Health icon + status (color-coded: green ✓ / amber ⚠ / red ✕)
- Time-to-deadline (compact: "36d", "2w", "5h")
- Buyer company (or deal title, whichever is shorter)

**Expanded state — tap the chip.** Reveals the full pill row as it is today, plus a `[^]` chevron to collapse.

The expanded state stays open until the user collapses it OR navigates away from the deal. No persistence — chat is meant to be in chat-flow mode by default.

## Files touched

- `src/components/DealRoom.jsx` — header layout
- `src/components/DealRoomHeader.jsx` (new, if not already extracted) — the compact + expanded states

## Component

```jsx
// DealRoomHeader.jsx
import { useState } from 'react';

export default function DealRoomHeader({ deal, viewerRole, onShare, onClose }) {
  const [showAllPills, setShowAllPills] = useState(false);

  const ks = deal.klo_state ?? {};
  const stage = ks.stage ?? deal.stage ?? '—';
  const health = ks.health ?? deal.health ?? 'green';
  const value = ks.deal_value?.amount ?? deal.value;
  const currency = ks.deal_value?.currency ?? 'USD';
  const deadline = ks.deadline?.date ?? deal.deadline;
  const daysToDeadline = deadline ? Math.ceil((new Date(deadline) - Date.now()) / 86400000) : null;
  const primaryContact = ks.people?.[0];

  return (
    <header className="deal-room-header">
      <div className="deal-header-top">
        <button className="deal-back" onClick={() => history.back()}>‹</button>
        <div className="deal-title-block">
          <h1 className="deal-title">{deal.title}</h1>
          <div className="deal-subtitle">
            {deal.buyer_company} · {stage} · {healthLabel(health)}
          </div>
        </div>
        <div className="deal-header-actions">
          {viewerRole === 'seller' && <button onClick={onShare}>Share</button>}
          <button onClick={onClose}>Close</button>
        </div>
      </div>

      {showAllPills ? (
        <div className="deal-pills-full">
          <Pill>{capitalize(stage)}</Pill>
          <Pill tone={healthTone(health)}>{capitalize(healthLabel(health))}</Pill>
          {value && <Pill>{formatCurrency(value, currency)}</Pill>}
          {daysToDeadline != null && <Pill>{compactDays(daysToDeadline)}</Pill>}
          <Pill>{deal.is_shared ? 'Shared' : 'Solo'}</Pill>
          {primaryContact && (
            <Pill>{primaryContact.name} · {primaryContact.role}</Pill>
          )}
          <button className="deal-pills-collapse" onClick={() => setShowAllPills(false)}>⌃</button>
        </div>
      ) : (
        <button className="deal-pill-compact" onClick={() => setShowAllPills(true)}>
          <span className={`pill-health-icon health-${health}`}>{healthIcon(health)}</span>
          <span>{capitalize(healthLabel(health))}</span>
          <span className="pill-sep">·</span>
          {daysToDeadline != null && (
            <>
              <span>{compactDays(daysToDeadline)}</span>
              <span className="pill-sep">·</span>
            </>
          )}
          <span className="pill-buyer">{deal.buyer_company ?? deal.title}</span>
          <span className="pill-chevron">⌄</span>
        </button>
      )}
    </header>
  );
}

function healthIcon(health) {
  if (health === 'green') return '✓';
  if (health === 'amber') return '⚠';
  return '✕';
}
function healthLabel(health) {
  if (health === 'green') return 'On track';
  if (health === 'amber') return 'Stuck';
  return 'At risk';
}
function healthTone(health) {
  if (health === 'green') return 'success';
  if (health === 'amber') return 'warning';
  return 'danger';
}
function compactDays(d) {
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'today';
  if (d < 7) return `${d}d`;
  if (d < 60) return `${Math.round(d / 7)}w`;
  return `${Math.round(d / 30)}mo`;
}
```

## Visual treatment

**Compact chip:**
- Single row, ~32px tall
- Subtle background (use the deal's health color at 10% alpha — green/amber/red tint)
- Text in that color's darker shade
- Tappable across the whole chip
- The chevron `⌄` is a hint, not the only target

**Expanded pills:**
- Same row layout as today
- Add a small `⌃` collapse button at the right
- No animation needed beyond a fast (~150ms) max-height transition

## Acceptance

- [ ] Open any deal — header shows compact chip with health, days, buyer
- [ ] Tap the chip — expands to full pill row
- [ ] Tap the `⌃` collapse — returns to compact
- [ ] Navigate away and back — state resets to collapsed (no persistence)
- [ ] Health icon + color match the deal's actual state
- [ ] Compact days format works for various ranges (3d, 2w, 5mo, today, overdue)
- [ ] Mobile 375px: compact chip fits in one line, doesn't wrap
- [ ] No regression to the deal title, back button, share, close

→ Next (Sprint C): `05-overview-merge-take-and-read.md`
