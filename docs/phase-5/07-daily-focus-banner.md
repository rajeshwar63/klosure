# Step 07 — "Today's focus" banner on the dashboard

**Sprint:** 3
**Goal:** Render the daily focus paragraph at the top of the seller's dashboard, above the deals list and stat strip.

## Files touched

- `src/components/DailyFocusBanner.jsx` — new
- `src/services/dailyFocus.js` — small wrapper for the Edge Function call
- `src/pages/DealsListPage.jsx` (or equivalent) — render the banner at the top

## Component

```jsx
// DailyFocusBanner.jsx
import { useState, useEffect } from 'react';
import { fetchDailyFocus } from '../services/dailyFocus';

export default function DailyFocusBanner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(force = false) {
    setLoading(!data); // only show full loading on first load
    setRefreshing(force);
    try {
      const result = await fetchDailyFocus(force);
      setData(result);
    } catch (err) {
      console.error('daily focus load failed', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading && !data) {
    return <div className="daily-focus-banner skeleton" />;
  }

  if (!data || !data.focus_text) return null;

  return (
    <div className="daily-focus-banner">
      <div className="daily-focus-header">
        <span className="daily-focus-tag">◆ Klo</span>
        <span className="daily-focus-when">{formatWhen(data.generated_at)}</span>
        <button
          className="daily-focus-refresh"
          onClick={() => load(true)}
          disabled={refreshing}
          title="Recompute focus"
        >
          {refreshing ? 'refreshing…' : 'refresh'}
        </button>
      </div>
      <div className="daily-focus-text">{data.focus_text}</div>
    </div>
  );
}

function formatWhen(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return d.toLocaleDateString();
}
```

## Service

```javascript
// services/dailyFocus.js
export async function fetchDailyFocus(forceRefresh = false) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error('not signed in');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/klo-daily-focus${forceRefresh ? '?refresh=1' : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  if (!res.ok) throw new Error(`Daily focus failed (${res.status})`);
  return res.json();
}
```

## Where to render in `DealsListPage.jsx`

```jsx
// Render order on the dashboard:
<header>
  <DailyFocusBanner />          {/* new */}
  <DashboardStats deals={deals} />  {/* existing or new from step 04 */}
</header>

<DealList deals={deals} />        {/* existing */}
```

## Visual treatment

- Banner sits at the top of the page, full content width
- Light amber/blue background (matches Klo's voice — same color as `<KloTake>` in the deal Overview)
- Large readable text for the focus paragraph (15-16px line-height 1.55)
- Small tag "◆ Klo" + timestamp + refresh button in a row above the text
- Skeleton loading state on first load (just shape, no spinner)
- If empty (no active deals), don't render the banner at all

## Refresh behavior

- Manual: click "refresh" → calls function with `?refresh=1` → bypasses cache → generates fresh
- Automatic: on dashboard mount → checks cache → returns cached if fresh, generates if stale (handled server-side per step 06)
- Realtime invalidation: when a deal's confidence changes ≥10 pts or status changes, the cache is marked stale (per step 06's triggers). Next dashboard mount picks up the new version.

We do NOT auto-refresh on every dashboard mount — that would defeat the cache. The trigger-based invalidation handles the "something meaningful happened, regenerate" case.

## Empty / error states

- **Loading first time**: skeleton block (gray rectangle with the right dimensions)
- **No active deals**: hide the banner entirely (DailyFocusBanner returns null)
- **Function errored**: log to console, hide the banner. Don't show error UI — the dashboard works fine without focus.

## Mobile

At 375px:
- Banner stacks vertically
- Tag and timestamp stay on one line
- Refresh button moves to a smaller touch target (still ≥24px tap area)
- Focus text wraps cleanly

## Acceptance

- Banner appears on the dashboard above stats and the deal list
- First load shows the cached version if available, generates if not
- Refresh button works — generates fresh content and updates the timestamp
- After ≥10 pt confidence change on any deal, the next dashboard mount shows updated content
- Sellers with 0 active deals: banner hidden entirely, dashboard still works
- Mobile layout clean
- No console errors

→ Next (Sprint 4): `08-manager-forecast-buckets.md`
