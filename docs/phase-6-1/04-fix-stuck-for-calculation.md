# Step 04 — Fix the "Stuck for" calculation

**Sprint:** B
**Goal:** The DealStatStripWide currently shows "0 weeks" for stuck duration even on deals that are clearly stuck. Fix the calculation so it reflects reality.

## The bug

The current implementation reads `deal.stuck_for_weeks` — a field that's either not being populated or wrong.

The real "stuck for" should be: **how long has it been since the deal's confidence was last in the "good" range (≥60), OR since the last meaningful state change, whichever is longer.**

In simpler terms: if a deal has been amber/red continuously for N weeks, that's how long it's been stuck.

## Files

- `src/services/dealHealth.js` (new) — pure helper to compute stuck duration
- `src/components/deal/DealStatStripWide.jsx` — use the helper

## Source of truth — `klo_state_history`

The `klo_state_history` table from Phase 4.5 already records every change to `klo_state.confidence`. We can derive the answer from it:

```javascript
// services/dealHealth.js

export async function computeStuckFor(dealId, currentConfidence) {
  // If currently healthy (≥60), not stuck — return 0 weeks
  if (currentConfidence?.value >= 60) {
    return { weeks: 0, since: null };
  }

  // Query history for the most recent transition from "good" (≥60) to "not good" (<60)
  const { data: history } = await supabase
    .from('klo_state_history')
    .select('changed_at, before_value, after_value')
    .eq('deal_id', dealId)
    .eq('field_path', 'confidence.value')
    .order('changed_at', { ascending: false })
    .limit(20);

  if (!history || history.length === 0) {
    // No history — fall back to deal creation date
    return null; // signal "unknown"
  }

  // Find the most recent transition where before ≥ 60 AND after < 60
  for (const row of history) {
    const before = parseInt(row.before_value);
    const after = parseInt(row.after_value);
    if (before >= 60 && after < 60) {
      const since = new Date(row.changed_at);
      const weeks = Math.floor((Date.now() - since.getTime()) / (7 * 86400000));
      return { weeks, since: row.changed_at };
    }
  }

  // No "good→not good" transition found in recent history.
  // Deal has been at < 60 for a while — use the oldest history entry as a lower bound
  const oldest = history[history.length - 1];
  const since = new Date(oldest.changed_at);
  const weeks = Math.floor((Date.now() - since.getTime()) / (7 * 86400000));
  return { weeks, since: oldest.changed_at };
}
```

## Async data flow in OverviewTab

The current `DealStatStripWide` reads `deal.stuck_for_weeks` synchronously. We need to fetch async data now. Wire it via a hook in `OverviewTab.jsx`:

```jsx
import { useStuckFor } from '../../hooks/useStuckFor';

export default function OverviewTab({ deal, viewerRole }) {
  const ks = deal.klo_state ?? {};
  const stuckFor = useStuckFor(deal.id, ks.confidence);
  // ...
  return (
    <div>
      {/* ... */}
      <DealStatStripWide deal={deal} klo_state={ks} stuckFor={stuckFor} />
      {/* ... */}
    </div>
  );
}
```

```javascript
// hooks/useStuckFor.js
import { useEffect, useState } from 'react';
import { computeStuckFor } from '../services/dealHealth';

export function useStuckFor(dealId, currentConfidence) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    computeStuckFor(dealId, currentConfidence).then(result => {
      if (!cancelled) setData(result);
    });
    return () => { cancelled = true; };
  }, [dealId, currentConfidence?.value]);
  return data;
}
```

## DealStatStripWide.jsx update

The "Stuck for" cell now reads from the new prop:

```jsx
<Stat
  label="STUCK FOR"
  value={stuckFor == null ? '—' : (stuckFor.weeks === 0 ? 'Not stuck' : `${stuckFor.weeks} week${stuckFor.weeks === 1 ? '' : 's'}`)}
  valueColor={stuckFor?.weeks >= 2 ? '#A32D2D' : null}
  subtitle={stuckFor?.since ? `since ${formatShortDate(stuckFor.since)}` : null}
/>
```

Three states:
- **Loading** (data null): show "—"
- **Not stuck** (weeks === 0): show "Not stuck", green or neutral color
- **Stuck for N weeks**: show the count, red text if ≥2 weeks, with the since-date as subtitle

## Edge cases to handle

- **Brand new deal, no history yet:** `computeStuckFor` returns null → show "—" or hide the stat entirely
- **Deal was stuck, recently recovered:** confidence ≥ 60 now, function returns 0 weeks → show "Not stuck"
- **Deal has been amber/red since creation:** no good→bad transition, fall back to oldest history entry as lower bound; subtitle says "since {oldest_date}"

## Acceptance

- [ ] DIB deal (currently amber, confidence 42) shows "Stuck for N weeks" with N > 0
- [ ] Subtitle shows "since {date}" with a real date
- [ ] A deal with confidence ≥ 60 shows "Not stuck" (no red, no alarming color)
- [ ] A brand-new deal with no history shows "—" gracefully
- [ ] Number is a positive integer; no negative values, no fractional weeks
- [ ] Red text appears when stuck ≥ 2 weeks (matches the existing visual treatment)

→ Next: `05-promote-commitments.md`
