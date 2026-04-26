# Step 04 — Dashboard reorders by confidence + per-deal trend chips

**Sprint:** 2
**Goal:** The seller's deal list reorders by `confidence.value` (highest first), and each row shows a confidence number + trend arrow.

## Files touched

- `src/services/dashboard.js` — sort logic
- `src/pages/DealsListPage.jsx` (or wherever the dashboard list renders) — render the confidence column

## Sort order

```javascript
// In dashboard.js
export function sortDealsForDashboard(deals) {
  const active = deals.filter(d => d.status === 'active');
  const archived = deals.filter(d => d.status !== 'active');

  // Active deals: sort by confidence descending. Deals without confidence (very new) go to the bottom of the active list.
  active.sort((a, b) => {
    const ac = a.klo_state?.confidence?.value ?? -1;
    const bc = b.klo_state?.confidence?.value ?? -1;
    if (ac !== bc) return bc - ac;
    // tiebreaker: most recent activity first
    return new Date(b.updated_at) - new Date(a.updated_at);
  });

  // Archived deals stay grouped at the bottom, sorted by close date
  archived.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  return [...active, ...archived];
}
```

Replace any existing sort that was based on health/red-amber-green. Confidence is now the primary order — health pill stays as a visual indicator, but it's not what determines position.

## Per-row UI changes

Each deal row now has a confidence column on the left.

```jsx
// In the dashboard row component
<div className="deal-row">
  <div className="confidence-column">
    {deal.klo_state?.confidence ? (
      <>
        <div className={`confidence-mini ${toneFor(deal.klo_state.confidence.value)}`}>
          {deal.klo_state.confidence.value}%
        </div>
        <div className="trend-mini">
          {trendArrow(deal.klo_state.confidence)}
        </div>
      </>
    ) : (
      <div className="confidence-mini neutral">—</div>
    )}
  </div>

  <div className="deal-details">
    {/* existing title, stage, value, deadline, klo summary */}
  </div>

  <div className="status-column">
    {/* existing health pill, "X overdue" badge, etc. */}
  </div>
</div>
```

`trendArrow(confidence)` returns:
- `↑ {delta}` if `trend === 'up'`
- `↓ {delta}` if `trend === 'down'`
- `→` if `trend === 'flat'`
- `''` (empty) if no previous value

## Visual treatment

- Confidence number: 18px, weight 500, color matches tone (green/amber/red)
- Trend below the number, 9-10px, muted color
- The whole row gets a subtle amber background if the deal is `slipping` (delta ≤ -10 in last 7 days) — this is the "needs attention" highlight from the mockup

## Slipping detection

A deal is "slipping" if its trend is `down` and `delta` is ≤ -10. This is the row that gets the amber background.

```javascript
export function isSlipping(deal) {
  const c = deal.klo_state?.confidence;
  if (!c) return false;
  return c.trend === 'down' && c.delta <= -10;
}
```

Apply `is-slipping` class on the row when this returns true.

## Empty state for new deals

If `confidence` is null (deal hasn't had its first Klo turn after Phase 5 deployed), show "—" in place of the number with a muted color. Don't hide the row.

After the first chat message in any deal, confidence will populate via the next Klo turn.

## Stat strip at the top of the dashboard

Add three new stats above the deal list (or next to existing pipeline stats):

```jsx
<div className="dashboard-stats">
  <Stat label="Weighted pipeline" value={formatCurrency(weightedPipeline(deals))} />
  <Stat label="Likely this quarter" value={`${highConfidenceCount(deals)} of ${activeCount(deals)}`} />
  <Stat label="Need attention" value={slippingCount(deals)} tone={slippingCount(deals) > 0 ? 'warning' : 'neutral'} />
</div>
```

```javascript
// helpers in dashboard.js
export function weightedPipeline(deals) {
  return deals
    .filter(d => d.status === 'active' && d.klo_state?.confidence && d.klo_state?.deal_value)
    .reduce((sum, d) => sum + (d.klo_state.deal_value.amount * d.klo_state.confidence.value / 100), 0);
}

export function highConfidenceCount(deals) {
  return deals.filter(d => d.status === 'active' && (d.klo_state?.confidence?.value ?? 0) >= 60).length;
}

export function activeCount(deals) {
  return deals.filter(d => d.status === 'active').length;
}

export function slippingCount(deals) {
  return deals.filter(d => d.status === 'active' && isSlipping(d)).length;
}
```

## Acceptance

- Dashboard active-deals list orders by confidence highest-first
- Each row shows the confidence number + trend arrow
- Slipping deals (down, delta ≤ -10) have an amber row background
- Stat strip at the top shows weighted pipeline (in same currency as deals), high-confidence count, and slipping count
- Realtime: when a deal's confidence updates (e.g., a chat message comes in for it), the list reorders without page refresh
- Mobile (375px): confidence column stays visible; details column allowed to truncate

→ Next (Sprint 3): `05-daily-focus-edge-function.md`
