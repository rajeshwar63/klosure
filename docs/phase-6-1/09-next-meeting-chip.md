# Step 09 — Next meeting chip in the deal header

**Sprint:** B
**Goal:** A small pill in the dark deal header showing the next scheduled event with this buyer.

## What it shows

```
● Dubai Islamic Bank — LXP    [⚠ Stuck · 5w]   [📅 Next: Mon 4:00 PM · Demo with Ahmed]
  Dubai Islamic Bank · Proposal · $20,000 · Deadline Jun 1
```

The chip sits in the dark header alongside the existing "Stuck · 5w" pill and to the right of the deal title. Tapping it doesn't navigate anywhere — it's display-only for Phase 6.1. (Future: clicking opens a modal with full meeting details.)

## Files

- `src/components/deal/DealHeader.jsx` — add the chip rendering
- `src/services/meetingFormat.js` — helpers to format meeting strings

## Render logic

```jsx
import { formatNextMeeting } from '../../services/meetingFormat';

export default function DealHeader({ deal, viewerRole, onShare, onOpenChat }) {
  const ks = deal.klo_state ?? {};
  const nextMeeting = ks.next_meeting;

  return (
    <header className="bg-[#2C2C2A] text-white px-5 py-3.5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColor(deal.health)}`} />
          <span className="text-base font-medium">{deal.title}</span>
        </div>

        {deal.stuck_for_weeks >= 2 && (
          <span className="bg-[#FAC775] text-[#412402] px-2.5 py-0.5 rounded-full text-xs font-medium">
            ⚠ Stuck · {deal.stuck_for_weeks}w
          </span>
        )}

        {nextMeeting && (
          <NextMeetingChip meeting={nextMeeting} />
        )}

        <div className="ml-auto flex gap-2">
          {viewerRole === 'seller' && (
            <button className="..." onClick={onShare}>Share</button>
          )}
          <button className="..." onClick={onOpenChat}>Open in chat</button>
        </div>
      </div>
      <div className="text-xs text-white/60 mt-1">
        {deal.buyer_company} · {capitalize(deal.stage)} · {formatCurrency(deal.value)} · Deadline {deal.deadline}
      </div>
    </header>
  );
}

function NextMeetingChip({ meeting }) {
  const display = formatNextMeeting(meeting);
  const isPast = new Date(meeting.date) < new Date();

  // If the meeting is in the past but extraction hasn't moved it yet, hide
  if (isPast) return null;

  const tone = meeting.confidence === 'tentative' ? 'tentative' : 'definite';

  return (
    <span
      className="px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1.5"
      style={{
        background: tone === 'definite' ? '#185FA5' : '#85B7EB',
        color: tone === 'definite' ? 'white' : '#042C53',
      }}
      title={tone === 'tentative' ? 'Tentative — not yet confirmed by both sides' : 'Confirmed'}
    >
      <CalendarIcon />
      {display}
    </span>
  );
}

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
```

## Format helper

```javascript
// services/meetingFormat.js

export function formatNextMeeting(meeting) {
  if (!meeting) return '';
  const date = new Date(meeting.date);
  const now = new Date();
  const days = Math.floor((date.getTime() - now.getTime()) / 86400000);

  let when;
  if (days < 0) {
    return ''; // Shouldn't happen — caller should hide; defensive
  } else if (days === 0) {
    when = formatTime(date) ? `Today ${formatTime(date)}` : 'Today';
  } else if (days === 1) {
    when = formatTime(date) ? `Tomorrow ${formatTime(date)}` : 'Tomorrow';
  } else if (days < 7) {
    when = formatTime(date)
      ? `${getWeekday(date)} ${formatTime(date)}`
      : getWeekday(date);
  } else if (days < 14) {
    when = formatTime(date)
      ? `Next ${getWeekday(date)} ${formatTime(date)}`
      : `Next ${getWeekday(date)}`;
  } else {
    when = formatShortDate(date);
  }

  // Title gets prepended for a fuller chip
  return `Next: ${when} · ${meeting.title}`;
}

function getWeekday(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
}

function formatTime(date) {
  // If the meeting is date-only (no time), the ISO will be midnight UTC. Detect that.
  const hours = date.getHours();
  const minutes = date.getMinutes();
  if (hours === 0 && minutes === 0) return null;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

## Tone — definite vs tentative

- **Definite confirmed meeting** (Klo extracted with `confidence: 'definite'`): solid blue background (`#185FA5`), white text — strong visual presence
- **Tentative proposed meeting** (`confidence: 'tentative'`): lighter blue background (`#85B7EB`), dark blue text (`#042C53`) — visible but lower-emphasis. Tooltip on hover: "Tentative — not yet confirmed by both sides"

This visual distinction matters: a confirmed meeting is something Raja prepares for. A tentative one is something he should chase down to confirm.

## What happens when a meeting passes

If today's date is after `next_meeting.date`, the chip auto-hides. Klo's extraction (step 08) will eventually move that meeting to `last_meeting` on the next chat turn, but in the meantime, the chip just doesn't render.

That gives a clean fallback — passed-but-not-yet-archived meetings don't clutter the header.

## Empty state

If `klo_state.next_meeting` is null → no chip renders. The dark header just shows title + stuck pill (if applicable) + buttons. This is fine — most deals won't have a structured upcoming meeting.

## Update the recency strip

In step 07's `RecencyStrip`, the "Last meeting" line should now use `klo_state.last_meeting.date` (which Klo's extraction populates). Update `services/recency.js`:

```javascript
const lastMeeting = klo_state?.last_meeting?.date ?? null;
return {
  // ...
  lastMeeting: lastMeeting ? formatAgoCompact(lastMeeting) : 'never',
};
```

This was already in step 07's code — verify it's wired and working now that the extraction adds the data.

## Mobile

On narrow screens (< 768px), the chip wraps below the title:

```
● Dubai Islamic Bank — LXP    [⚠ Stuck · 5w]
[📅 Next: Mon 4:00 PM · Demo with Ahmed]
```

The flexbox `flex-wrap` handles this — no special mobile code needed.

If the chip text is too long to fit even on a single mobile line, abbreviate the title:

```
[📅 Mon 4:00 PM]
```

(Drop the "Next:" prefix and the meeting title on very narrow viewports.)

## Acceptance

- [ ] Send a chat message: "Demo confirmed for Monday at 4pm with Ahmed"
- [ ] After Klo responds, refresh the deal page
- [ ] Dark header shows the chip: "📅 Next: Mon 4:00 PM · Demo with Ahmed"
- [ ] Chip is solid blue (definite confirmed)
- [ ] Send a tentative message: "Maybe a call next Tuesday?"
- [ ] Chip becomes lighter blue with tooltip "Tentative — not yet confirmed"
- [ ] Don't manually advance system clock — when Monday actually passes, the chip auto-hides on next page load
- [ ] No chip on deals where no meeting was discussed
- [ ] Mobile: chip wraps below title gracefully

→ Next: `10-acceptance-walkthrough.md`
