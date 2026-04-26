# Step 13 — Render patterns on the manager forecast tab

**Sprint:** 5 (deferrable)
**Goal:** Show the team's patterns at the bottom of the manager forecast tab.

## Files touched

- `src/components/team/PatternsList.jsx` — new
- `src/components/team/ForecastTab.jsx` — add patterns section at the bottom
- `src/services/team.js` — add `getTeamPatterns(teamId)` query

## Service

```javascript
// services/team.js
export async function getTeamPatterns(teamId) {
  const { data } = await supabase
    .from('team_patterns')
    .select('*')
    .eq('team_id', teamId)
    .order('close_rate', { ascending: false });
  return data ?? [];
}
```

## Component

```jsx
// PatternsList.jsx
export default function PatternsList({ patterns, closedDealCount }) {
  if (closedDealCount < 5) {
    return (
      <div className="patterns-section patterns-empty">
        <div className="patterns-header">Patterns Klo found across your closed deals</div>
        <div className="patterns-empty-text">
          Klo will start finding patterns once you've closed 5+ deals. ({closedDealCount} closed so far.)
        </div>
      </div>
    );
  }

  if (!patterns || patterns.length === 0) {
    return (
      <div className="patterns-section patterns-empty">
        <div className="patterns-header">Patterns Klo found across your closed deals</div>
        <div className="patterns-empty-text">
          Klo didn't find any high-confidence patterns yet — close rates are too similar across signals. Patterns will surface as your data grows.
        </div>
      </div>
    );
  }

  return (
    <div className="patterns-section">
      <div className="patterns-header">Patterns Klo found across your closed deals</div>
      <div className="patterns-list">
        {patterns.map(p => (
          <div key={p.id} className="pattern-row">
            <span className="pattern-text">{p.text}</span>
            <span className="pattern-meta">based on {p.sample_size} closed</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## ForecastTab integration

```jsx
// ForecastTab.jsx — add this state + render at the bottom

useEffect(() => {
  Promise.all([
    getTeamPipeline(teamId),
    getTeamPatterns(teamId),
    getClosedDealCount(teamId)
  ]).then(([pipeline, patterns, closedCount]) => {
    setData({ ...pipeline, patterns, closedCount });
  });
}, [teamId]);

// In the render, below ByRepRollup:
<PatternsList patterns={data.patterns} closedDealCount={data.closedCount} />
```

Add the `getClosedDealCount` helper:

```javascript
export async function getClosedDealCount(teamId) {
  const { data: members } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId);
  const memberIds = (members ?? []).map(m => m.user_id);
  if (memberIds.length === 0) return 0;
  const { count } = await supabase
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .in('seller_id', memberIds)
    .in('status', ['won', 'lost', 'archived']);
  return count ?? 0;
}
```

## Visual treatment

Each pattern row:
- Text in primary color, normal weight
- Meta in muted color, smaller font, right-aligned
- Subtle background (matches existing `byrep-row` styling)

Patterns are listed in close-rate descending order — the strongest signals first. No other sorting controls.

## Refresh button (optional)

Add a small "refresh patterns" button to the header that calls `klo-patterns`:

```jsx
<button onClick={() => refreshPatterns(teamId)} className="patterns-refresh">
  Recompute
</button>
```

This is a manager-only affordance for re-running pattern detection on demand. Useful if they've recently closed several deals and want fresh analysis.

```javascript
// services/team.js
export async function refreshPatterns(teamId) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/klo-patterns`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ team_id: teamId })
  });
}
```

## Acceptance

- Forecast tab loads patterns from `team_patterns` and renders them
- Empty state (< 5 closed) shows the "need 5" message with the actual current count
- Empty state (≥ 5 closed but no patterns found) shows the appropriate message
- Patterns sort by close-rate descending
- Refresh button (if implemented) re-runs detection and updates the list
- RLS prevents non-managers from seeing other teams' patterns
- No regression to other sections of the forecast tab

→ Next: `14-acceptance-walkthrough.md`
