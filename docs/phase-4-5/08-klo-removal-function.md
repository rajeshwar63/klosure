# Step 08 — `klo-removal` Edge Function

**Goal:** New small Edge Function that handles × button clicks. Removes an item from `klo_state`, appends to `removed_items`, logs to history.

## Deliverable

Create `supabase/functions/klo-removal/index.ts`.

```typescript
// Klosure — Phase 4.5 klo-removal
// Handles user × removals from the Overview.
// Inserts the removed item into klo_state.removed_items so Klo never re-adds it.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { KloState, RemovedItem } from '../_shared/klo-state-types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type Kind = 'people' | 'blockers' | 'open_questions' | 'decisions';

Deno.serve(async (req) => {
  try {
    const { deal_id, kind, match, reason } = await req.json() as {
      deal_id: string;
      kind: Kind;
      match: Record<string, unknown>;  // e.g. { name: 'Ahmed' } for people
      reason: string;
    };

    if (!deal_id || !kind || !match || !reason || !reason.trim()) {
      return new Response('deal_id, kind, match, reason all required', { status: 400 });
    }

    // Verify caller is the deal's seller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('not authorized', { status: 401 });
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return new Response('not authorized', { status: 401 });

    const { data: deal, error: dealErr } = await sb
      .from('deals')
      .select('seller_id, klo_state')
      .eq('id', deal_id)
      .single();
    if (dealErr || !deal) return new Response('deal not found', { status: 404 });
    if (deal.seller_id !== userData.user.id) return new Response('only seller can remove', { status: 403 });

    const state = deal.klo_state as KloState | null;
    if (!state) return new Response('no klo_state yet', { status: 400 });

    // Locate the item and remove it
    const arr = (state[kind] as any[]) ?? [];
    const idx = arr.findIndex(item => Object.entries(match).every(([k, v]) => (item as any)[k] === v));
    if (idx < 0) return new Response('item not found', { status: 404 });

    const removedValue = arr[idx];
    const newArr = arr.slice(0, idx).concat(arr.slice(idx + 1));

    const removedItem: RemovedItem = {
      kind,
      value: removedValue,
      reason: reason.trim(),
      removed_at: new Date().toISOString()
    };

    const newState: KloState = {
      ...state,
      [kind]: newArr,
      removed_items: [...(state.removed_items ?? []), removedItem]
    };

    // Update state
    const { error: updErr } = await sb.from('deals').update({ klo_state: newState }).eq('id', deal_id);
    if (updErr) throw updErr;

    // Log history
    const { error: histErr } = await sb.from('klo_state_history').insert({
      deal_id,
      triggered_by_role: 'seller',
      change_kind: 'removed',
      field_path: `${kind}[removed]`,
      before_value: removedValue,
      after_value: null,
      reason: reason.trim()
    });
    if (histErr) throw histErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('klo-removal error', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
```

## Deploy

```powershell
supabase functions deploy klo-removal
```

Note: this one **needs JWT verification** (no `--no-verify-jwt`). Removals are seller-only.

## Acceptance

- File created and deploys
- Calling it with a valid auth token + valid args removes an item from `klo_state` and appends to `removed_items`
- A `klo_state_history` row appears with `change_kind='removed'` and `reason` populated
- Calling without auth returns 401
- Calling as a buyer (or wrong user) returns 403
- Calling with empty reason returns 400

→ Next: `09-overview-rewrite.md`
