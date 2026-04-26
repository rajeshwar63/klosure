# Step 06 — Needs you today list

**Sprint:** B
**Goal:** Below the Klo focus card, a flat list of action items across the seller's pipeline. Each item is one specific thing that needs the seller's attention today.

## File

- `src/components/home/NeedsYouTodayList.jsx` — new

## What it shows

```
NEEDS YOU TODAY · 3

● Send LXP proposal to Nina                       [Open]
  Dubai Islamic Bank · overdue 3d

● Confirm Q3 pricing with Acme legal              [Open]
  Acme Corp · due today

● Northwind has been silent 6 days                [Open]
  Confidence dropped 12 pts this week
```

Three categories of items, in priority order:

1. **Overdue commitments** (red dot) — anything from the `commitments` table where the seller is the owner and `status === 'overdue'`
2. **Commitments due today** (amber dot) — owner = seller, due today, status pending
3. **Slipping deals** (amber dot) — deals where confidence dropped ≥ 10pts in the last 7 days, AND the deal is not already represented in #1 or #2

Cap at 5 items total. If more than 5 qualify, show 5 and add "+ N more" link to the existing `/deals` page.

## Component API

```jsx
<NeedsYouTodayList deals={deals} />
```

`deals` is the seller's full deal list with `klo_state` and (importantly) `commitments` joined.

## Data computation

This is a derived view. No new database query needed — assemble from existing data:

```javascript
function computeNeedsYouToday(deals) {
  const items = [];

  for (const deal of deals) {
    if (deal.status !== 'active') continue;

    // Overdue commitments
    for (const c of (deal.commitments ?? [])) {
      if (c.owner === 'seller' && c.status === 'overdue') {
        items.push({
          severity: 'overdue',
          dot: 'red',
          title: c.task,
          subtitle: `${deal.title} · overdue ${daysOverdue(c.due_date)}d`,
          dealId: deal.id,
          sortKey: -daysOverdue(c.due_date), // most overdue first
        });
      }
    }

    // Due today
    for (const c of (deal.commitments ?? [])) {
      if (c.owner === 'seller' && c.status === 'pending' && isDueToday(c.due_date)) {
        items.push({
          severity: 'today',
          dot: 'amber',
          title: c.task,
          subtitle: `${deal.title} · due today`,
          dealId: deal.id,
          sortKey: 0,
        });
      }
    }

    // Slipping deals (no commitment but losing confidence)
    const c = deal.klo_state?.confidence;
    const alreadyHasCommitmentItem = items.some(i => i.dealId === deal.id);
    if (!alreadyHasCommitmentItem && c?.trend === 'down' && c?.delta <= -10) {
      items.push({
        severity: 'slipping',
        dot: 'amber',
        title: `${deal.buyer_company} has been silent`,
        subtitle: `Confidence dropped ${Math.abs(c.delta)} pts this week`,
        dealId: deal.id,
        sortKey: c.delta, // bigger drop = higher priority (smaller signed value)
      });
    }
  }

  // Sort by sortKey ascending — most urgent at the top
  items.sort((a, b) => a.sortKey - b.sortKey);

  return items.slice(0, 5);
}
```

`daysOverdue`, `isDueToday` are simple date helpers — already exist in services or trivially write inline.

## Render

```jsx
export default function NeedsYouTodayList({ deals }) {
  const navigate = useNavigate();
  const items = computeNeedsYouToday(deals);
  const totalCount = items.length;

  if (totalCount === 0) return null;

  return (
    <section className="mb-6">
      <div className="text-xs font-medium tracking-wider text-secondary mb-2">
        NEEDS YOU TODAY · {totalCount}
      </div>

      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <div key={i}
            className="bg-white border-tertiary rounded-md px-4 py-3 flex items-center gap-3"
            style={{ borderWidth: '0.5px' }}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass(item.dot)}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{item.title}</div>
              <div className="text-xs text-secondary truncate">{item.subtitle}</div>
            </div>
            <button
              onClick={() => navigate(`/deals/${item.dealId}`)}
              className="px-3 py-1 rounded-md text-xs border border-tertiary"
              style={{ borderWidth: '0.5px' }}
            >
              Open
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function dotClass(color) {
  if (color === 'red') return 'bg-[#E24B4A]';
  if (color === 'amber') return 'bg-[#BA7517]';
  return 'bg-gray-400';
}
```

## Empty state

If `items.length === 0` AND the seller has active deals:

```
NEEDS YOU TODAY · 0
✓ You're caught up. Spend the day on outbound or your biggest open deal.
```

If the seller has NO active deals at all, return null entirely — the empty state is handled at the page level (KloFocusCard's empty state covers it).

## Sort tiebreaker

If two items have the same `sortKey`, order by `dealId` for stability. Items shouldn't visually flicker on re-renders.

## What's deliberately NOT here

- No "all my deals" list — that's `/deals`, accessible from the sidebar
- No charts, no graphs, no metrics — those are `PipelineGlanceStrip` (next step)
- No buyer-side commitments — only items where `owner === 'seller'`
- No filtering or sorting controls — the priority order is opinionated and final

## Acceptance

- [ ] Section appears below the Klo focus card with the right header label and count
- [ ] Items render with correct dots (red for overdue, amber for today/slipping)
- [ ] Each item has title, subtitle (deal name + context), and Open button
- [ ] Open navigates to the right deal
- [ ] Items sort by urgency — overdue first, then due today, then slipping
- [ ] Cap at 5 items; if more, show "+ N more" link to `/deals`
- [ ] Empty state ("you're caught up") shown when there's nothing urgent
- [ ] Hidden entirely when seller has no active deals
- [ ] Mobile (375px): rows stack with truncation; Open button stays visible

→ Next: `07-pipeline-glance-strip.md`
