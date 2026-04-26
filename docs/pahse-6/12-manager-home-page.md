# Step 12 — Manager home page

**Sprint:** D (Manager home)
**Goal:** Replace the placeholder `/team` page with the manager's morning briefing. Same shape as the seller home — header, big Klo card, action list, glance strip — but scoped to the team.

## File

- `src/pages/ManagerHomePage.jsx` — replace placeholder

## Page structure

```jsx
import { useEffect, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { getTeamPipeline } from '../services/team';
import { fetchManagerWeeklyBrief } from '../services/managerBrief';
import KloTeamBriefCard from '../components/manager/KloTeamBriefCard';
import DealsSlippingList from '../components/manager/DealsSlippingList';
import QuarterGlanceStrip from '../components/manager/QuarterGlanceStrip';

export default function ManagerHomePage() {
  const { user, teamId } = useUser();
  const [pipeline, setPipeline] = useState(null);
  const [brief, setBrief] = useState(null);

  useEffect(() => {
    if (!teamId) return;
    getTeamPipeline(teamId).then(setPipeline);
    fetchManagerWeeklyBrief(teamId).then(setBrief);
  }, [teamId]);

  if (!teamId) return <NoTeamPlaceholder />;

  return (
    <div className="manager-home p-6 md:p-8 max-w-[960px] mx-auto">

      <header className="mb-6">
        <div className="text-xs text-tertiary mb-1">
          {pipeline?.teamName ?? '...'} · {pipeline?.members?.length ?? 0} reps · {pipeline?.deals?.length ?? 0} active deals
        </div>
        <h1 className="text-2xl font-medium">This week on your team.</h1>
      </header>

      <KloTeamBriefCard brief={brief} loading={brief === null} pipeline={pipeline} />

      <DealsSlippingList deals={pipeline?.deals ?? []} />

      <QuarterGlanceStrip deals={pipeline?.deals ?? []} />

    </div>
  );
}
```

## fetchManagerWeeklyBrief — backend reuse

This is a NEW function call but reuses an EXISTING Edge Function. From Phase 5 step 10, `klo-manager` has a `mode: 'quarter_take'` endpoint that produces a narrative paragraph. We extend that with `mode: 'weekly_brief'` (or use the existing one and adjust the prompt).

But — **no Edge Function changes in Phase 6.** So for now:

```javascript
// services/managerBrief.js
export async function fetchManagerWeeklyBrief(teamId) {
  // For Phase 6, reuse the existing quarter_take endpoint.
  // The text we get back is quarter-focused but works as a stand-in until Phase 7
  // adds a dedicated 'weekly_brief' mode.
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/klo-manager`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'quarter_take', team_id: teamId })
  });
  const json = await res.json();
  return { brief_text: json.take, generated_at: json.generated_at };
}
```

The text returned is quarter-take-flavored, which is OK as a starting point. Phase 7 can introduce a `weekly_brief` mode with a tighter prompt focused on "what's happening this week" rather than "what's the quarter outlook." For Phase 6, this is acceptable.

## NoTeamPlaceholder

If the user is on the manager page but has no team_id (shouldn't happen given route gating, but defensive):

```jsx
function NoTeamPlaceholder() {
  return (
    <div className="p-12 text-center">
      <h2 className="text-xl font-medium mb-2">No team linked to your account</h2>
      <p className="text-secondary mb-4">Set up a team to see the manager view, or switch back to your seller view.</p>
      <button onClick={() => navigate('/today')}>Go to seller view</button>
    </div>
  );
}
```

## Loading states

Same approach as seller home — header renders immediately with placeholder counts, sections fill in as data resolves.

## Acceptance

- [ ] Visit `/team` as a manager → see the new layout with header, Klo team brief, deals slipping, quarter glance
- [ ] Header shows team name, rep count, deal count
- [ ] Title "This week on your team."
- [ ] Three sections render in order
- [ ] Loading states render gracefully (no full-page spinner)
- [ ] Non-managers cannot access (existing route gating handles this)
- [ ] No regression to /team/forecast, /team/askklo (those still work via separate routes)

→ Next: `13-klo-team-brief-card.md`
