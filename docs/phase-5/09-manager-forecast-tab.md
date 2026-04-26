# Step 09 — Manager forecast tab on the Team page

**Sprint:** 4
**Goal:** New "Forecast" tab on the existing Team page (alongside Pipeline / People / Ask Klo). Shows confidence buckets, by-rep rollup, and a Klo-narrated quarter summary.

## Files touched

- `src/pages/TeamPage.jsx` — add a new tab
- `src/components/team/ForecastTab.jsx` — new component
- `src/components/team/ConfidenceBuckets.jsx` — new
- `src/components/team/ByRepRollup.jsx` — new

## Tab integration

In `TeamPage.jsx`, the existing tab strip likely looks like:

```jsx
<TabBar tabs={['Pipeline', 'People', 'Ask Klo']} ... />
```

Add 'Forecast' as a new tab:

```jsx
<TabBar tabs={['Pipeline', 'Forecast', 'People', 'Ask Klo']} ... />
```

When 'Forecast' is selected, render `<ForecastTab />`.

## ForecastTab structure

```jsx
import { useState, useEffect } from 'react';
import { getTeamPipeline } from '../../services/team';
import { bucketDeals, computeQuarterCommit, computeQuarterStretch, rollupByRep } from '../../services/teamForecast';
import KloQuarterTake from './KloQuarterTake';
import ConfidenceBuckets from './ConfidenceBuckets';
import ByRepRollup from './ByRepRollup';

export default function ForecastTab({ teamId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    getTeamPipeline(teamId).then(setData);
  }, [teamId]);

  if (!data) return <div className="forecast-loading">…</div>;

  const buckets = bucketDeals(data.deals);
  const reps = rollupByRep(data.deals, data.members);
  const commit = computeQuarterCommit(buckets);
  const stretch = computeQuarterStretch(buckets);

  return (
    <div className="forecast-tab">
      <KloQuarterTake teamId={teamId} commit={commit} stretch={stretch} />
      <ConfidenceBuckets buckets={buckets} />
      <ByRepRollup reps={reps} />
    </div>
  );
}
```

## ConfidenceBuckets

```jsx
export default function ConfidenceBuckets({ buckets }) {
  return (
    <div className="bucket-grid">
      <div className="bucket bucket-likely">
        <div className="bucket-label">Likely close</div>
        <div className="bucket-amount">{formatCurrency(buckets.likely.weighted)}</div>
        <div className="bucket-meta">{buckets.likely.deals.length} deals · ≥ 65%</div>
      </div>
      <div className="bucket bucket-in-play">
        <div className="bucket-label">In play</div>
        <div className="bucket-amount">{formatCurrency(buckets.in_play.weighted)}</div>
        <div className="bucket-meta">{buckets.in_play.deals.length} deals · 30-65%</div>
      </div>
      <div className="bucket bucket-long-shot">
        <div className="bucket-label">Long shots</div>
        <div className="bucket-amount">{formatCurrency(buckets.long_shot.weighted)}</div>
        <div className="bucket-meta">{buckets.long_shot.deals.length} deals · &lt; 30%</div>
      </div>
    </div>
  );
}
```

Three colored cards: green / amber / gray (in that order). Use existing tone tokens — same as the confidence panel from step 03.

## ByRepRollup

```jsx
export default function ByRepRollup({ reps }) {
  if (reps.length === 0) return null;
  return (
    <div className="byrep-section">
      <div className="byrep-header">By rep · Klo's read</div>
      <div className="byrep-list">
        {reps.map(rep => (
          <div key={rep.user_id} className="byrep-row">
            <div className="byrep-avatar">{(rep.name?.[0] ?? '?').toUpperCase()}</div>
            <div className="byrep-details">
              <div className="byrep-name">{rep.name ?? '—'}</div>
              <div className="byrep-summary">
                {rep.active_count} active
                {rep.slipping_count > 0 ? ` · ${rep.slipping_count} slipping` : ''}
                {rep.silent_count > 0 ? ` · ${rep.silent_count} silent` : ''}
                {' · '}weighted {formatCurrency(rep.weighted)}
              </div>
            </div>
            <div className="byrep-amount">{formatCurrency(rep.weighted)}</div>
            <div className={`byrep-flag flag-${rep.flag ?? 'neutral'}`}>{flagLabel(rep)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function flagLabel(rep) {
  if (rep.flag === 'at_risk') return rep.slipping_count === 1
    ? `${rep.slipping_first_deal_title ?? '1 deal'} at risk`
    : `${rep.slipping_count} slipping`;
  if (rep.flag === 'silent') return `${rep.silent_count} silent`;
  if (rep.flag === 'strong') return 'strong';
  return '';
}
```

## KloQuarterTake (deferred to next step)

For step 09, render a placeholder:

```jsx
export default function KloQuarterTake({ teamId, commit, stretch }) {
  return (
    <div className="klo-quarter-take placeholder">
      <div className="quarter-tag">◆ Klo</div>
      <div className="quarter-numbers">
        Realistic Q3 commit: <strong>{formatCurrency(commit)}</strong>.
        Stretch: <strong>{formatCurrency(stretch)}</strong>.
      </div>
      <div className="quarter-narrative-placeholder">
        Klo's narrative quarter take will appear here once you've connected the manager forecast Edge Function.
      </div>
    </div>
  );
}
```

The Klo-narrated paragraph comes from extending the existing `klo-manager` function in step 10 below — but the static commit/stretch numbers work today.

## Empty state

If `reps.length === 0` or `data.deals.length === 0`:
- Show: "No active deals in this team yet. Forecasts will appear once your reps create deals."
- Hide all the buckets and rollups

## Refresh strategy

The forecast tab loads fresh on mount. No realtime subscription needed — managers don't need second-by-second updates of the forecast number. Just refetch when they switch to the tab.

If you want to be slightly fancier, refetch every 30 seconds while the tab is active. But that's optional.

## Acceptance

- New "Forecast" tab visible on the Team page for managers
- Three buckets render with correct counts and dollar amounts
- By-rep rollup shows each team member with their flag (strong / at_risk / silent / neutral)
- Numbers match what `bucketDeals` and `rollupByRep` return
- Switching between tabs is fast (tab content cached after first load)
- Mobile (375px): buckets stack vertically; rep rows wrap cleanly
- No regression to Pipeline, People, Ask Klo tabs

→ Next: `10-manager-forecast-byrep.md`
