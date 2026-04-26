# Step 14 — Deals slipping list + Quarter glance strip

**Sprint:** D
**Goal:** Below the Klo team brief card, two more sections — a list of deals slipping this week (across all reps) and a compact quarter forecast strip.

## Files

- `src/components/manager/DealsSlippingList.jsx` — new
- `src/components/manager/QuarterGlanceStrip.jsx` — new

## DealsSlippingList

```
DEALS SLIPPING THIS WEEK · 2

42 ↓12   Dubai Islamic Bank · Raja              [Open]
         Stuck 5w · proposal overdue · signatory unknown

35 ↓8    Aramco L&D · Priya                     [Open]
         Buyer silent 6 days after proposal
```

Each row: confidence number + trend on the left, deal name + rep + summary in the middle, Open button on the right.

## Component API

```jsx
<DealsSlippingList deals={deals} />
```

`deals` is the team pipeline (all reps, all active deals) with `klo_state`.

## Logic

A deal is "slipping" if:
- `klo_state.confidence.trend === 'down'` AND `delta <= -5`, OR
- `klo_state.health === 'amber'` and there's an overdue commitment, OR
- The deal has been at the same stage for ≥ 4 weeks (stuck)

```javascript
function computeDealsSlipping(deals) {
  return deals
    .filter(d => d.status === 'active')
    .map(d => ({ deal: d, severity: severityScore(d) }))
    .filter(x => x.severity > 0)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 5);
}

function severityScore(deal) {
  let score = 0;
  const c = deal.klo_state?.confidence;
  if (c?.trend === 'down') score += Math.abs(c.delta ?? 0);
  if (deal.health === 'amber') score += 5;
  if (deal.health === 'red') score += 15;
  if (hasOverdueCommitments(deal)) score += 10;
  if (weeksAtCurrentStage(deal) >= 4) score += 8;
  return score;
}

function buildSummary(deal) {
  const parts = [];
  if (weeksAtCurrentStage(deal) >= 2) parts.push(`Stuck ${weeksAtCurrentStage(deal)}w`);
  const overdue = (deal.commitments ?? []).filter(c => c.status === 'overdue');
  if (overdue.length > 0) parts.push(`${overdue.length} overdue`);
  const topBlocker = deal.klo_state?.blockers?.[0]?.text;
  if (topBlocker && parts.length < 3) parts.push(topBlocker.length > 30 ? topBlocker.slice(0, 27) + '…' : topBlocker);
  return parts.join(' · ');
}
```

## Render

```jsx
export default function DealsSlippingList({ deals }) {
  const navigate = useNavigate();
  const items = useMemo(() => computeDealsSlipping(deals), [deals]);

  if (items.length === 0) return (
    <section className="mb-6">
      <div className="text-xs font-medium tracking-wider text-secondary mb-2">DEALS SLIPPING THIS WEEK · 0</div>
      <div className="bg-secondary rounded-md p-4 text-sm text-secondary">
        No deals slipping this week. The team's pipeline is healthy.
      </div>
    </section>
  );

  return (
    <section className="mb-6">
      <div className="text-xs font-medium tracking-wider text-secondary mb-2">
        DEALS SLIPPING THIS WEEK · {items.length}
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map(({ deal }) => (
          <DealSlippingRow key={deal.id} deal={deal} onOpen={() => navigate(`/deals/${deal.id}`)} />
        ))}
      </div>
    </section>
  );
}

function DealSlippingRow({ deal, onOpen }) {
  const c = deal.klo_state?.confidence;
  const repName = deal.users?.name ?? '—';
  const summary = buildSummary(deal);
  const tone = c?.value < 30 ? 'risk' : c?.value < 60 ? 'caution' : 'good';
  const toneColor = tone === 'risk' ? '#A32D2D' : tone === 'caution' ? '#BA7517' : '#3B6D11';

  return (
    <div className="bg-white border-tertiary rounded-md px-4 py-3 flex items-center gap-3"
      style={{ borderWidth: '0.5px' }}>
      <div className="flex flex-col items-center min-w-[36px]">
        <span className="text-sm font-medium" style={{ color: toneColor }}>{c?.value ?? '—'}</span>
        {c?.trend === 'down' && (
          <span className="text-[9px]" style={{ color: '#A32D2D' }}>↓ {Math.abs(c.delta)}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{deal.title} · {repName}</div>
        <div className="text-xs text-secondary truncate">{summary}</div>
      </div>
      <button onClick={onOpen}
        className="px-3 py-1 rounded-md text-xs border border-tertiary"
        style={{ borderWidth: '0.5px' }}>
        Open
      </button>
    </div>
  );
}
```

## QuarterGlanceStrip

Compact version of the bucket forecast from Phase 5 Sprint 4. Three cards with weighted dollar amounts.

```jsx
export default function QuarterGlanceStrip({ deals }) {
  const buckets = useMemo(() => bucketDeals(deals), [deals]);
  const commit = buckets.likely.weighted;
  const stretch = commit + Math.round(buckets.in_play.weighted * 0.6);
  const activeCount = deals.filter(d => d.status === 'active').length;

  if (activeCount === 0) return null;

  return (
    <section>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-xs font-medium tracking-wider text-secondary">QUARTER AT A GLANCE</span>
        <span className="text-xs text-tertiary">
          Commit {formatCurrency(commit)} · stretch {formatCurrency(stretch)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <BucketCard label="Likely close" amount={buckets.likely.weighted} count={buckets.likely.deals.length} tone="good" />
        <BucketCard label="In play" amount={buckets.in_play.weighted} count={buckets.in_play.deals.length} tone="caution" />
        <BucketCard label="Long shot" amount={buckets.long_shot.weighted} count={buckets.long_shot.deals.length} tone="muted" />
      </div>
    </section>
  );
}

function BucketCard({ label, amount, count, tone }) {
  const colors = {
    good: { bg: '#EAF3DE', text: '#173404', label: '#3B6D11' },
    caution: { bg: '#FAEEDA', text: '#412402', label: '#854F0B' },
    muted: { bg: 'var(--color-background-secondary)', text: 'var(--color-text-secondary)', label: 'var(--color-text-secondary)' },
  }[tone];
  return (
    <div className="rounded-md p-3" style={{ background: colors.bg }}>
      <div className="text-[10px]" style={{ color: colors.label }}>{label}</div>
      <div className="text-lg font-medium" style={{ color: colors.text }}>{formatCurrency(amount)}</div>
      <div className="text-[10px]" style={{ color: colors.label }}>{count} deal{count === 1 ? '' : 's'}</div>
    </div>
  );
}
```

`bucketDeals` is the existing function from Phase 5 Sprint 4 — reuse it.

## Mobile

Both sections work on mobile without changes — DealsSlippingList rows wrap their internal content, QuarterGlanceStrip's three cards stay side-by-side.

## Acceptance

- [ ] DealsSlippingList renders below KloTeamBriefCard
- [ ] Slipping deals correctly identified and sorted by severity
- [ ] Each row shows confidence + trend, deal + rep, summary, Open button
- [ ] "Healthy pipeline" empty state when no deals are slipping
- [ ] QuarterGlanceStrip renders below DealsSlippingList
- [ ] Three buckets with correct math (sums match team forecast values)
- [ ] Commit/stretch in the header line match the calculations
- [ ] Hidden when team has no active deals
- [ ] Mobile: layouts stay clean, all info readable

→ Next (Sprint E): `15-empty-and-loading-states.md`
