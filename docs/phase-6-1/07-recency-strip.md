# Step 07 — Recency strip

**Sprint:** B
**Goal:** A small horizontal strip near the top of the Overview that shows when each side last spoke, plus when the last meeting happened. Tells the story of the silence.

## Why this matters

On a stuck deal, **the silence IS the story**. Looking at DIB right now, Raja sees "stuck for 5 weeks" but doesn't know:

- Has the buyer been silent the whole time, or did they reply yesterday?
- Has Raja been silent because he's waiting on them, or because he's avoiding them?
- When was the last meeting actually held — and how long ago?

A small recency strip answers all three at a glance.

## Where it lives

Just below the DealContextStrip (cream banner) and above the two-column hero. It's a compact horizontal row, not a card.

```
┌──────────────────────────────────────────────────────────────────┐
│  Disprz is selling an LXP to Dubai Islamic Bank...               │
└──────────────────────────────────────────────────────────────────┘

  Buyer last spoke 8d ago · You last sent 3d ago · Last meeting: never

┌─────────────────────────────────┬───────────────────────────────┐
│  KLO RECOMMENDS                 │ COMMITMENTS · 1               │
```

## Files

- `src/components/deal/RecencyStrip.jsx` — new
- `src/components/deal/OverviewTab.jsx` — render below DealContextStrip
- `src/services/recency.js` — helper functions

## Component

```jsx
import { useEffect, useState } from 'react';
import { computeRecency } from '../../services/recency';

export default function RecencyStrip({ dealId, klo_state }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    computeRecency(dealId, klo_state).then(result => {
      if (!cancelled) setData(result);
    });
    return () => { cancelled = true; };
  }, [dealId]);

  if (!data) return null;

  const items = [
    { label: 'Buyer last spoke', value: data.buyerLastSpoke, tone: data.buyerSilenceDays >= 5 ? 'warn' : 'normal' },
    { label: 'You last sent', value: data.sellerLastSent, tone: 'normal' },
    { label: 'Last meeting', value: data.lastMeeting, tone: 'normal' },
  ];

  return (
    <div className="text-xs flex flex-wrap gap-x-4 gap-y-1 mb-4 px-1"
      style={{ color: 'var(--color-text-secondary)' }}>
      {items.map((item, i) => (
        <span key={i} className="flex items-baseline gap-1">
          <span style={{ color: 'var(--color-text-tertiary)' }}>{item.label}</span>
          <span className={item.tone === 'warn' ? 'font-medium' : ''}
            style={{ color: item.tone === 'warn' ? '#A32D2D' : 'var(--color-text-primary)' }}>
            {item.value}
          </span>
          {i < items.length - 1 && <span className="text-tertiary">·</span>}
        </span>
      ))}
    </div>
  );
}
```

## recency.js helper

```javascript
export async function computeRecency(dealId, klo_state) {
  // Buyer last message
  const { data: buyerMsg } = await supabase
    .from('messages')
    .select('created_at')
    .eq('deal_id', dealId)
    .eq('sender_type', 'buyer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Seller last message
  const { data: sellerMsg } = await supabase
    .from('messages')
    .select('created_at')
    .eq('deal_id', dealId)
    .eq('sender_type', 'seller')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Last meeting — read from klo_state.last_meeting if it's been extracted (Phase 7)
  // For Phase 6.1, this is null unless the user has manually noted a meeting.
  // A future Klo extraction can fill this in from chat ("we just had the demo").
  const lastMeeting = klo_state?.last_meeting?.date ?? null;

  const buyerLastSpokeISO = buyerMsg?.created_at ?? null;
  const sellerLastSentISO = sellerMsg?.created_at ?? null;
  const buyerSilenceDays = buyerLastSpokeISO
    ? Math.floor((Date.now() - new Date(buyerLastSpokeISO).getTime()) / 86400000)
    : null;

  return {
    buyerLastSpoke: formatAgoCompact(buyerLastSpokeISO),
    sellerLastSent: formatAgoCompact(sellerLastSentISO),
    lastMeeting: lastMeeting ? formatAgoCompact(lastMeeting) : 'never',
    buyerSilenceDays,
  };
}

export function formatAgoCompact(iso) {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
```

## Tone — when to highlight as warning

The buyer-silence side is the meaningful warning signal. If the buyer has been silent ≥ 5 days, that value renders in red and weight 500. Other items stay neutral.

Reasoning: when the seller is silent, that's usually a choice (they have other deals, they're prepping). When the buyer is silent, that's almost always a signal.

## "Last meeting" data source

Phase 6.1 doesn't have a structured "meetings" concept yet. The `klo_state.last_meeting` field is something Klo's extraction prompt can populate IF a chat mentions a past meeting ("we had the demo yesterday"). For Phase 6.1:

- If `klo_state.last_meeting?.date` exists, use it
- Otherwise show "never"

The next step (08) adds meeting extraction to the prompt. For now, on a fresh deploy "Last meeting" will say "never" for most deals — that's accurate for DIB (Monday's demo hasn't happened yet) and that's fine.

## Mobile

The strip wraps onto multiple lines on narrow viewports thanks to `flex-wrap`. Each item stays as a single token (label + value + middot) and wraps as a unit.

## Acceptance

- [ ] Recency strip appears between DealContextStrip and the two-column hero
- [ ] Shows three items: buyer last spoke, you last sent, last meeting
- [ ] DIB deal: buyer-silence ≥ 5 days renders in red+bold
- [ ] "never" gracefully shown when no buyer or seller messages exist
- [ ] Mobile: items wrap onto multiple lines, no horizontal overflow
- [ ] Real-time: when a new message arrives, the strip recomputes (refetch on mount; if Phase 7 wires real-time message subscription, this can become reactive)

→ Next: `08-next-meeting-extraction.md`
