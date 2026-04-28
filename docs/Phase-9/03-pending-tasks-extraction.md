# Step 03 — Pending tasks extraction

**Goal:** Extend the main extraction (`klo-respond`) to populate two arrays in `klo_state`: `pending_on_seller[]` and `pending_on_buyer[]`. These are the structured replacement for the dropped commitments table.

## Why

Without this, the "On you / On vendor" sections on both Overview and Buyer view have nothing to render. Klo already mentions these items in chat replies — we just need to extract them as structured data.

## Files to modify

- `supabase/functions/_shared/klo-state-types.ts` — add types
- `supabase/functions/_shared/extraction-rules-text.ts` — add extraction rules
- `supabase/functions/klo-respond/index.ts` — extend `KLO_OUTPUT_TOOL` schema

## Type additions

In `klo-state-types.ts`, add:

```typescript
// =============================================================================
// Phase 9 — Pending tasks (replaces commitments table)
// =============================================================================

export type PendingTaskStatus = 'pending' | 'overdue' | 'done'

export interface PendingTask {
  id: string                   // stable id derived from task hash — for client-side localStorage status overrides
  task: string                 // ≤ 12 words, imperative if possible. "Send SOC 2 report"
  due_date: string | null      // ISO date or null
  status: PendingTaskStatus
  source_message_id: string | null
  added_at: string             // ISO timestamp — when Klo first detected this task
}

export interface KloState {
  // ... all existing fields unchanged ...

  // NEW — Phase 9
  pending_on_seller?: PendingTask[]
  pending_on_buyer?: PendingTask[]
}
```

## Extraction rules

In `supabase/functions/_shared/prompts/extraction-rules-text.ts`, add a new section near the top (after the existing `removed_items` rules):

```markdown
## Pending tasks

Klosure tracks tasks owed by each side. Two arrays:
- `pending_on_seller`: things the seller (vendor) has agreed to deliver, not yet delivered
- `pending_on_buyer`: things the buyer (client) has agreed to deliver, not yet delivered

### Extraction rules

1. **A task enters the array when the chat shows it was promised, requested, or implicitly committed.**
   - "I'll send the SOC 2 by Tuesday" → pending_on_seller
   - "Nadia will get the scoping doc to me by Friday" → pending_on_buyer
   - "Can you share the customer references?" → pending_on_seller (request from buyer side)
   - "Need to loop in our CISO" → pending_on_buyer (their internal action)

2. **A task LEAVES the array when delivered.**
   - "Sent the SOC 2 just now" → mark seller-side SOC 2 task `status: 'done'`
   - "Got Nadia's scoping doc this morning" → mark buyer-side scoping task `status: 'done'`
   - Don't delete done tasks from the array immediately — keep them so the UI can show "completed (3)" expansion. Klo can prune `done` tasks older than 30 days.

3. **A task becomes `overdue` when its due_date is in the past and status is still 'pending'.**
   - This is computed by `klo-watcher`, not the main extraction. Main extraction sets status to 'pending' or 'done' only.

4. **id is stable.** Compute it as a short hash of the task text + owner side. If the same task appears across multiple turns, the id stays the same so client-side state survives re-extractions.

5. **Cap each array at 10 active items.** If extraction would push past 10, drop the oldest pending item (or the most stale).

6. **Honor removed_items.** If a task was previously removed by the seller, do not re-extract it from chat unless it's clearly a new instance.

### What does NOT belong in pending_on_*

- High-level deal stages or strategy ("close this deal") — too abstract
- Things Klo recommends but neither side has committed to
- Long-horizon items ("eventually integrate with their CRM")
- Anything older than 30 days with no movement — let it die

### Output format

Each task is a full object with id, task, due_date, status, source_message_id, added_at. The tool schema enforces this.
```

## Tool schema extension

In `supabase/functions/klo-respond/index.ts`, find the existing `KLO_OUTPUT_TOOL` definition and add to the `klo_state.properties`:

```typescript
pending_on_seller: {
  type: 'array',
  description: 'Tasks the seller (vendor) owes — extracted from chat. Max 10 active items. See extraction rules for what qualifies.',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Stable hash-derived ID. Same task across turns gets same ID.' },
      task: { type: 'string', description: '≤ 12 words.' },
      due_date: { type: ['string', 'null'], description: 'ISO date or null.' },
      status: { type: 'string', enum: ['pending', 'overdue', 'done'] },
      source_message_id: { type: ['string', 'null'] },
      added_at: { type: 'string', description: 'ISO timestamp when first detected.' },
    },
    required: ['id', 'task', 'due_date', 'status', 'source_message_id', 'added_at'],
  },
  maxItems: 10,
},
pending_on_buyer: {
  // identical shape to pending_on_seller
  // ... copy the schema above
},
```

Add both fields to the tool's `required` array (they should always be present, even as empty arrays).

## ID hashing

For consistency across turns, the model should generate IDs deterministically. Add to extraction rules:

> When generating `id` for a pending task, use a short stable hash of `{owner}:{task_lowercased_first_8_words}`. This way the same task across multiple turns gets the same id, and client-side localStorage status overrides stay aligned.

Note: the model may not produce truly deterministic hashes, but it'll be close enough. The UI should be defensive — if an id changes between renders, treat it as a new task.

## What this step does NOT do

- Does NOT add buyer-view-side `pending_on_*` arrays — that's step 04 (those are buyer-facing projections, separate from these)
- Does NOT update klo-watcher to flip overdue status — defer to a follow-up if needed; for now the UI computes overdue client-side from due_date

## Claude Code instructions

```
1. Add PendingTask type and pending_on_seller / pending_on_buyer to KloState in supabase/functions/_shared/klo-state-types.ts.
2. Add the new extraction rules section to supabase/functions/_shared/prompts/extraction-rules-text.ts.
3. Extend KLO_OUTPUT_TOOL in supabase/functions/klo-respond/index.ts with both array fields.
4. Typecheck: cd supabase/functions && deno check klo-respond/index.ts.
5. Deploy: supabase functions deploy klo-respond --no-verify-jwt.
6. Test: send a chat message on the Emirates deal that includes a clear commitment from each side. Verify in DB:
   select klo_state->'pending_on_seller', klo_state->'pending_on_buyer' from deals where title ilike '%Emirates%';
7. Commit: "Phase 9 step 03: pending tasks extraction"
8. Push.
```

## Acceptance

- [ ] After a chat turn with commitments mentioned, both arrays populate in `klo_state`
- [ ] Done items show `status: 'done'`
- [ ] Repeated commitments across turns keep the same `id`
- [ ] Tool always emits both arrays (empty if no tasks), never undefined
- [ ] No regression to existing extraction (klo_take_seller, confidence, etc.)

→ Next: `04-buyer-view-pending-arrays.md`
