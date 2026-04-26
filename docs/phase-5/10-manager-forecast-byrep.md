# Step 10 — Klo's narrated quarter take

**Sprint:** 4
**Goal:** Replace the placeholder in `KloQuarterTake` with a real Klo-generated paragraph that synthesizes the team's forecast in plain language.

## Decision: extend `klo-manager` or create a new function?

**Extend `klo-manager`.** Reasons:
- The function already has team-deal-loading + RLS + auth wired up
- A "quarter take" is a specialized question the manager asks Klo
- We don't need a separate cache; the existing manager-thread mechanism already handles caching of conversation context

We'll add a new endpoint mode to `klo-manager`: when called with `{ mode: 'quarter_take', team_id }`, it returns the synthesized paragraph instead of running the chat thread.

## Files touched

- `supabase/functions/klo-manager/index.ts` — add the new mode
- `src/components/team/KloQuarterTake.jsx` — call it on mount

## Edge function changes

In `klo-manager`, near the top of the request handler:

```typescript
const body = await req.json();
const mode = body.mode ?? 'chat'; // existing default

if (mode === 'quarter_take') {
  return await handleQuarterTake(body.team_id, userData.user.id);
}

// (existing chat handling continues here)
```

Then implement `handleQuarterTake`:

```typescript
async function handleQuarterTake(teamId: string, userId: string) {
  // Verify the caller is a manager of this team
  const { data: membership } = await sb
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!membership || (membership.role !== 'manager' && membership.role !== 'owner')) {
    return new Response('not authorized', { status: 403 });
  }

  // Load all the team's active deals + reps
  const { data: members } = await sb
    .from('team_members')
    .select('user_id, role, users!inner(name)')
    .eq('team_id', teamId);

  const memberIds = (members ?? []).map(m => m.user_id);

  const { data: deals } = await sb
    .from('deals')
    .select('id, title, buyer_company, klo_state, value, deadline, stage, seller_id, users!deals_seller_id_fkey(name)')
    .in('seller_id', memberIds)
    .eq('status', 'active');

  if (!deals || deals.length === 0) {
    return Response.json({
      take: "No active deals in this team yet. Once your reps start creating deals and chatting in them, Klo will start forecasting here.",
      generated_at: new Date().toISOString()
    });
  }

  // Build a digest for the prompt — just what Klo needs
  const digest = deals.map(d => ({
    title: d.title,
    buyer: d.buyer_company,
    rep: d.users?.name ?? '—',
    stage: d.klo_state?.stage ?? d.stage,
    value: d.klo_state?.deal_value?.amount ?? d.value,
    deadline: d.klo_state?.deadline?.date ?? d.deadline,
    confidence: d.klo_state?.confidence?.value ?? null,
    trend: d.klo_state?.confidence?.trend ?? null,
    delta: d.klo_state?.confidence?.delta ?? null,
    summary: d.klo_state?.summary ?? null,
    top_factor_dragging: d.klo_state?.confidence?.factors_dragging_down?.[0]?.label ?? null
  }));

  const systemPrompt = `You are Klo, the AI deal coach inside Klosure. You are advising a sales manager on their quarter forecast.

You'll receive a digest of all active deals across the team. Output a short narrative (3-5 sentences) that:

1. States a realistic Q-commit number (sum of weighted-dollar across confident deals — those scoring 65+)
2. States a stretch number if there are in-play deals (30-65 confidence) that could come through
3. Names the 1-2 specific deals or reps that need attention to hit the stretch
4. If you spot a pattern across the team's struggling deals, mention it ("two deals stuck on signatory unknown")
5. Keep it to 3-5 sentences. Specific over generic. Manager voice — not coaching the rep, briefing the boss.

Don't list every deal. Don't make a forecast table. Synthesize.`;

  const userMessage = `Active pipeline:\n\n${JSON.stringify(digest, null, 2)}\n\nGive me your quarter take.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: KLO_MODEL,
      max_tokens: 400,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';

  return Response.json({
    take: text.trim(),
    generated_at: new Date().toISOString()
  });
}
```

## Frontend wiring

```jsx
// KloQuarterTake.jsx
import { useState, useEffect } from 'react';

export default function KloQuarterTake({ teamId, commit, stretch }) {
  const [take, setTake] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/klo-manager`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'quarter_take', team_id: teamId })
        });
        const json = await res.json();
        if (!cancelled) setTake(json.take);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [teamId]);

  return (
    <div className="klo-quarter-take">
      <div className="quarter-tag">◆ Klo</div>
      {loading && !take ? (
        <div className="quarter-narrative skeleton" style={{ height: 60 }} />
      ) : (
        <div className="quarter-narrative">{take}</div>
      )}
      <div className="quarter-numbers">
        <span className="quarter-stat">
          <span className="quarter-stat-label">Commit</span>
          <span className="quarter-stat-value">{formatCurrency(commit)}</span>
        </span>
        <span className="quarter-stat">
          <span className="quarter-stat-label">Stretch</span>
          <span className="quarter-stat-value">{formatCurrency(stretch)}</span>
        </span>
      </div>
    </div>
  );
}
```

## Cost note

This call costs roughly $0.005-0.01 per generation. Manager opens the forecast tab → one call. Cache it client-side for the session — refetch only on tab re-mount (i.e., not on every render). Going further would require a server-side cache table similar to the daily-focus one — premature for now.

## Acceptance

- Manager opens the Forecast tab → sees Klo's quarter take render
- The take references actual deals by name and reps by name (drawn from real data)
- The commit/stretch numbers below match what the buckets display in step 09
- A second visit within the same session re-uses the cached take (no extra Claude call)
- No regression to the manager's chat thread (the existing `mode: 'chat'` path still works)

→ Next (Sprint 5): `11-pattern-detection-spec.md`
