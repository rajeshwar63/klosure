# Step 07 — Pipeline glance strip

**Sprint:** B
**Goal:** Bottom section of the seller home — three small bucket cards (Likely close / In play / Long shot) showing weighted dollar amounts and deal counts. Quick context, not the focal point.

## File

- `src/components/home/PipelineGlanceStrip.jsx` — new

## What it shows

```
PIPELINE AT A GLANCE                  Weighted $87,800 · 5 deals

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Likely close │  │ In play      │  │ Long shot    │
│ $48k         │  │ $28k         │  │ $12k         │
│ 2 deals      │  │ 2 deals      │  │ 1 deal       │
└──────────────┘  └──────────────┘  └──────────────┘
```

Three bucket cards in a horizontal grid. Each card shows the bucket label, the weighted dollar amount, and the deal count.

## Component API

```jsx
<PipelineGlanceStrip deals={deals} />
```

## Bucket logic

This is the same bucket logic from Phase 5 Sprint 4 (`bucketDeals` in `services/teamForecast.js`), but applied to a single seller's deals instead of a team.

```javascript
function bucketSellerDeals(deals) {
  const active = deals.filter(d => d.status === 'active');
  const buckets = {
    likely: { count: 0, weighted: 0 },     // confidence ≥ 65
    in_play: { count: 0, weighted: 0 },    // 30 ≤ confidence < 65
    long_shot: { count: 0, weighted: 0 },  // confidence < 30 or null
  };

  for (const deal of active) {
    const value = deal.klo_state?.deal_value?.amount ?? deal.value ?? 0;
    const confidence = deal.klo_state?.confidence?.value;
    const weighted = confidence != null ? Math.round(value * confidence / 100) : 0;
    let key;
    if (confidence == null || confidence < 30) key = 'long_shot';
    else if (confidence < 65) key = 'in_play';
    else key = 'likely';
    buckets[key].count++;
    buckets[key].weighted += weighted;
  }
  return buckets;
}
```

If `bucketDeals` already exists in a Phase 5 service, import it instead of duplicating. The thresholds and shape are the same.

## Render

```jsx
import { useMemo } from 'react';
import { bucketSellerDeals } from '../../services/dashboard';

export default function PipelineGlanceStrip({ deals }) {
  const buckets = useMemo(() => bucketSellerDeals(deals), [deals]);
  const totalWeighted = buckets.likely.weighted + buckets.in_play.weighted + buckets.long_shot.weighted;
  const activeCount = buckets.likely.count + buckets.in_play.count + buckets.long_shot.count;

  if (activeCount === 0) return null;

  return (
    <section>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-xs font-medium tracking-wider text-secondary">PIPELINE AT A GLANCE</span>
        <span className="text-xs text-tertiary">
          Weighted {formatCurrency(totalWeighted)} · {activeCount} deal{activeCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <BucketCard
          label="Likely close"
          amount={buckets.likely.weighted}
          count={buckets.likely.count}
          tone="good"
        />
        <BucketCard
          label="In play"
          amount={buckets.in_play.weighted}
          count={buckets.in_play.count}
          tone="caution"
        />
        <BucketCard
          label="Long shot"
          amount={buckets.long_shot.weighted}
          count={buckets.long_shot.count}
          tone="muted"
        />
      </div>
    </section>
  );
}

function BucketCard({ label, amount, count, tone }) {
  const colors = {
    good: { bg: 'var(--color-background-secondary)', text: '#3B6D11', muted: '#888780' },
    caution: { bg: 'var(--color-background-secondary)', text: '#854F0B', muted: '#888780' },
    muted: { bg: 'var(--color-background-secondary)', text: 'var(--color-text-secondary)', muted: '#888780' },
  }[tone];
  return (
    <div className="rounded-md p-3" style={{ background: colors.bg }}>
      <div className="text-[10px] mb-1" style={{ color: colors.muted }}>{label}</div>
      <div className="text-lg font-medium" style={{ color: colors.text }}>{formatCurrency(amount)}</div>
      <div className="text-[10px]" style={{ color: colors.muted }}>{count} deal{count === 1 ? '' : 's'}</div>
    </div>
  );
}
```

`formatCurrency` should round to thousands with a `$` prefix and `k`/`M` suffix:
- $48,000 → "$48k"
- $1,250,000 → "$1.25M"
- $0 → "$0"

If a similar formatter exists in Phase 5, reuse it.

## What deliberately is NOT here

- **No charts.** Resist the urge. A chart would compete with the Klo focus card for attention.
- **No "show me more" expansion.** This is a glance. The full breakdown is in `/deals`.
- **No filters or controls.** Static view of pipeline state.

## Mobile

At 375px the three bucket cards remain side-by-side (they're small enough to fit). Numbers shrink slightly if needed. Don't stack them vertically — that takes too much space and loses the side-by-side comparison.

## Acceptance

- [ ] Section renders below NeedsYouTodayList
- [ ] Three bucket cards with correct weighted amounts and counts
- [ ] Totals in the header line match the sum of the three buckets
- [ ] Currency formatted compactly ($48k not $48,000)
- [ ] Hidden when seller has zero active deals
- [ ] Mobile (375px): three cards stay side-by-side, numbers readable
- [ ] No regression: data layer reuses existing `klo_state.confidence` and `klo_state.deal_value`

→ Next (Sprint C): `08-deal-page-shell.md`
