# Step 12 — `klo-patterns` Edge Function

**Sprint:** 5 (deferrable)
**Goal:** New Edge Function that mines patterns from a team's closed deals and stores them in `team_patterns`.

## Schema

Create `supabase/phase5_patterns.sql`:

```sql
create table if not exists team_patterns (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  text text not null,
  close_rate integer not null check (close_rate between 0 and 100),
  sample_size integer not null check (sample_size >= 5),
  category text not null,
  generated_at timestamptz default now()
);

create index if not exists idx_team_patterns_team on team_patterns (team_id, generated_at desc);

alter table team_patterns enable row level security;

create policy "Managers read their team's patterns"
on team_patterns for select
to authenticated
using (
  exists (
    select 1 from team_members tm
    where tm.team_id = team_patterns.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('manager', 'owner')
  )
);

-- No INSERT/UPDATE/DELETE policies — only the service role writes (via Edge Function)
```

## Edge function: `klo-patterns/index.ts`

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KLO_MODEL = Deno.env.get('KLO_MODEL') ?? 'claude-sonnet-4-5';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    const { team_id } = await req.json();
    if (!team_id) return new Response('team_id required', { status: 400 });

    // 1. Load all closed deals for this team
    const { data: members } = await sb.from('team_members').select('user_id').eq('team_id', team_id);
    const memberIds = (members ?? []).map(m => m.user_id);

    const { data: closedDeals } = await sb
      .from('deals')
      .select('id, title, status, value, deadline, klo_state, created_at, updated_at')
      .in('seller_id', memberIds)
      .in('status', ['won', 'lost', 'archived']);

    if (!closedDeals || closedDeals.length < 5) {
      return Response.json({
        patterns: [],
        message: `Only ${closedDeals?.length ?? 0} closed deals — need at least 5 to find patterns.`
      });
    }

    // 2. For each closed deal, also load its history (compact form)
    const dealIds = closedDeals.map(d => d.id);
    const { data: histories } = await sb
      .from('klo_state_history')
      .select('deal_id, change_kind, field_path, before_value, after_value, changed_at')
      .in('deal_id', dealIds)
      .order('changed_at', { ascending: true });

    // Group history by deal
    const historyByDeal = new Map<string, any[]>();
    for (const h of histories ?? []) {
      const arr = historyByDeal.get(h.deal_id) ?? [];
      arr.push(h);
      historyByDeal.set(h.deal_id, arr);
    }

    // 3. Build the digest for Klo
    const digest = closedDeals.map(d => ({
      id: d.id,
      title: d.title,
      outcome: d.status,
      value: d.value,
      duration_days: Math.round((new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) / 86400000),
      final_state: d.klo_state,
      change_count: historyByDeal.get(d.id)?.length ?? 0
    }));

    // 4. Ask Klo to mine patterns
    const systemPrompt = `You are Klo, the AI deal coach. You're analyzing a team's closed deals (won and lost) to find patterns that meaningfully correlate with closing.

You'll receive a digest of all closed deals — outcome, final state, duration, history count.

Find patterns where deals matching a specific signal close at a meaningfully different rate than overall.

Rules:
- A pattern needs at least 5 matching deals to count. If fewer match, skip it.
- The close rate must differ from the overall close rate by at least 10 points to be worth surfacing.
- State patterns concretely: "Deals where X close Y% of the time" — name the trigger, give the rate, give the sample size.
- Don't speculate. If you can't see strong evidence, output an empty patterns array.
- Maximum 5 patterns. Better to show 2 strong than 5 weak.
- Categories: stakeholders | commitments | engagement | stage | confidence

Output JSON via the tool.`;

    const tool = {
      name: 'emit_patterns',
      description: 'Emit patterns Klo found across closed deals',
      input_schema: {
        type: 'object',
        properties: {
          patterns: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                close_rate: { type: 'integer', minimum: 0, maximum: 100 },
                sample_size: { type: 'integer', minimum: 5 },
                category: { type: 'string', enum: ['stakeholders', 'commitments', 'engagement', 'stage', 'confidence'] }
              },
              required: ['text', 'close_rate', 'sample_size', 'category']
            }
          }
        },
        required: ['patterns']
      }
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: KLO_MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Closed deals digest:\n\n${JSON.stringify(digest, null, 2)}\n\nFind the patterns.` }],
        tools: [tool],
        tool_choice: { type: 'tool', name: 'emit_patterns' }
      })
    });

    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const toolUse = data.content?.find((b: any) => b.type === 'tool_use' && b.name === 'emit_patterns');
    if (!toolUse) throw new Error('No tool_use in pattern response');
    const patterns = (toolUse.input as any).patterns ?? [];

    // 5. Replace stored patterns for this team
    await sb.from('team_patterns').delete().eq('team_id', team_id);
    if (patterns.length > 0) {
      await sb.from('team_patterns').insert(
        patterns.map((p: any) => ({ ...p, team_id }))
      );
    }

    return Response.json({ patterns, refreshed_at: new Date().toISOString() });
  } catch (err) {
    console.error('klo-patterns error', err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
```

## Trigger pattern refresh

Patterns refresh when a deal closes. Add to the existing Phase 4 close/archive flow — when a deal's status changes to `won` or `lost`, fire the function:

Option 1 — Postgres trigger that calls `pg_net.http_post` to invoke the Edge Function.
Option 2 — Frontend triggers it after the close action succeeds.

Either works. Frontend is simpler:

```javascript
// In wherever you handle close/archive in the frontend, after the deal status change succeeds:
fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/klo-patterns`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ team_id })
}).catch(err => console.warn('pattern refresh failed (non-fatal)', err));
```

The `.catch(...).warn` is intentional — pattern refresh is non-critical. If it fails, the close still succeeds.

## Acceptance

- SQL migration applies cleanly
- Calling the function with a valid `team_id` and ≥5 closed deals returns a `patterns` array
- Calling with fewer than 5 closed deals returns the helpful "need 5" message
- Patterns are stored in `team_patterns` (verify via SQL)
- Calling again replaces the previous patterns (delete-then-insert)
- A non-manager calling the function: returns 403 (we'll add this auth check; the manager-only RLS on `team_patterns` already prevents read leaks)

→ Next: `13-pattern-display.md`
