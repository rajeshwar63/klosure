# Step 06 — `klo-respond` skeleton

**Goal:** Restructure `klo-respond` to support the new flow. No prompt logic yet — just the function shape with prompts referenced as imports.

## Deliverable

Modify `supabase/functions/klo-respond/index.ts` to use this structure. **Keep the file under 300 lines.** If it gets longer, extract helpers into `_shared/`.

## Structure

```typescript
// Klosure — Phase 4.5 klo-respond
// Per-turn pipeline: load context → call Klo → diff → write history → update state → post chat reply.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildBootstrapPrompt } from '../_shared/prompts/bootstrap-prompt.ts';
import { buildExtractionPrompt } from '../_shared/prompts/extraction-prompt.ts';
import type { KloState, KloRespondOutput } from '../_shared/klo-state-types.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KLO_MODEL = Deno.env.get('KLO_MODEL') ?? 'claude-sonnet-4-5';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    const { deal_id, triggering_message_id } = await req.json();
    if (!deal_id) return new Response('deal_id required', { status: 400 });

    // 1. Load context
    const ctx = await loadDealContext(deal_id);

    // 2. Decide path: bootstrap (state is null) vs normal turn
    const output = ctx.deal.klo_state == null
      ? await runBootstrap(ctx)
      : await runExtraction(ctx, triggering_message_id);

    // 3. Diff old state vs new state, append history rows
    await writeHistory(deal_id, ctx.deal.klo_state, output.klo_state, triggering_message_id, ctx.recipientRole);

    // 4. Update deals.klo_state (and sync legacy fields)
    await updateDealState(deal_id, output.klo_state);

    // 5. Insert chat_reply as a Klo message scoped to recipientRole
    await postKloMessage(deal_id, output.chat_reply, ctx.recipientRole);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('klo-respond error', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// --- Stubs (filled in step 07) ---

async function loadDealContext(deal_id: string) {
  // TODO step 07: load deal, deal_context, last 20 messages, current klo_state, last 20 history rows
  // also: figure out recipientRole = the role of the sender of the LAST non-Klo message
  throw new Error('loadDealContext not implemented');
}

async function runBootstrap(ctx: any): Promise<KloRespondOutput> {
  // TODO step 07: build bootstrap prompt, call Anthropic, parse JSON
  throw new Error('runBootstrap not implemented');
}

async function runExtraction(ctx: any, triggering_message_id: string | null): Promise<KloRespondOutput> {
  // TODO step 07: build extraction prompt, call Anthropic with prompt caching, parse JSON
  throw new Error('runExtraction not implemented');
}

async function writeHistory(
  deal_id: string,
  oldState: KloState | null,
  newState: KloState,
  triggering_message_id: string | null,
  triggered_by_role: 'seller' | 'buyer' | 'system'
) {
  // TODO step 07: diff old vs new, insert one klo_state_history row per change
  throw new Error('writeHistory not implemented');
}

async function updateDealState(deal_id: string, state: KloState) {
  // TODO step 07: update deals.klo_state, AND sync legacy columns (stage, value, deadline, summary)
  throw new Error('updateDealState not implemented');
}

async function postKloMessage(deal_id: string, content: string, visible_to: 'seller' | 'buyer') {
  // TODO step 07: insert into messages with sender_type='klo', visible_to set
  throw new Error('postKloMessage not implemented');
}
```

## Why this skeleton-first approach

- Each helper becomes its own commit in step 07. If any individual one hits a stream timeout, you only re-do that helper.
- The shape is correct from the start — no surprise architecture changes mid-build.
- Imports compile cleanly because steps 02–05 already exist.

## Acceptance

- File compiles with no errors (the throws are fine — they'll be replaced)
- All imports resolve
- Function deploys (it'll error at runtime, but it'll deploy)
- Committed and pushed

→ Next: `07-klo-respond-wireup.md`
