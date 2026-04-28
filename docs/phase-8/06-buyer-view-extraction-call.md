# Step 06 — Buyer view extraction call

**Sprint:** B
**Goal:** Wire the second LLM call into `klo-respond` that generates `buyer_view`. Crucially, this call is **gated** — it only runs when the seller's chat turn produced a material change to the deal. Trivial messages do not pay the buyer-view cost.

## Files

- `supabase/functions/klo-respond/index.ts` — add post-extraction gating + call
- `supabase/functions/_shared/material-change-detector.ts` — new

## Why gating matters

Without gating, every chat turn runs two LLM calls (~$0.00115 + ~$0.0006 = ~$0.00175 per turn). At 3,000 turns/month per seller that's ~$5.25/month vs the $4 budget.

With gating (estimated 30% of turns are material): ~$0.00115 + (0.3 × $0.0006) = **~$0.00133 per turn average**. Stays under budget.

## What counts as a "material change"

A turn produces a material change to the buyer view when, comparing post-extraction `klo_state` to pre-extraction:

1. Any new entry in `people` (new stakeholder mentioned)
2. Any entry removed from `people`
3. `stage` changed
4. `deadline.date` changed
5. `deal_value.amount` changed by ≥ 10%
6. Any new entry in `blockers` or any blocker resolved
7. Any new entry in `decisions`
8. `next_meeting` added, removed, or rescheduled
9. `last_meeting` newly populated (a meeting just happened)
10. Any commitment status changed (kept / missed / new) — note: this comes from the `commitments` table, not klo_state
11. `confidence.value` changed by ≥ 10 points
12. The seller has sent ≥ 5 chat messages since the last buyer-view generation (so the buyer view doesn't get stale on slow-moving deals)

If NONE of the above are true, skip the buyer-view call. Use the existing `buyer_view` (it stays valid).

## Material change detector

Create `supabase/functions/_shared/material-change-detector.ts`:

```typescript
// Klosure — Phase 8
// Detects whether a klo_state update warrants regenerating buyer_view.
// Pure function — no side effects, no DB calls.

import type { KloState } from './klo-state-types.ts'

export interface MaterialChangeResult {
  isMaterial: boolean
  reasons: string[]  // for telemetry — why we decided to regenerate (or why not)
}

export function detectMaterialChange(args: {
  before: KloState | null
  after: KloState
  messagesSinceLastBuyerView: number
}): MaterialChangeResult {
  const reasons: string[] = []

  // First-ever generation
  if (!args.before || !args.before.buyer_view) {
    reasons.push('first_generation')
    return { isMaterial: true, reasons }
  }

  const b = args.before
  const a = args.after

  // 1. People changes (added or removed)
  const beforePeople = new Set((b.people ?? []).map((p) => p.name))
  const afterPeople = new Set((a.people ?? []).map((p) => p.name))
  if (afterPeople.size !== beforePeople.size) {
    reasons.push('people_count_changed')
  } else {
    for (const n of afterPeople) if (!beforePeople.has(n)) { reasons.push('person_added'); break }
    for (const n of beforePeople) if (!afterPeople.has(n)) { reasons.push('person_removed'); break }
  }

  // 2. Stage
  if (b.stage !== a.stage) reasons.push('stage_changed')

  // 3. Deadline
  if ((b.deadline as any)?.date !== (a.deadline as any)?.date) reasons.push('deadline_changed')

  // 4. Deal value (≥ 10% change)
  const beforeValue = (b.deal_value as any)?.amount ?? null
  const afterValue = (a.deal_value as any)?.amount ?? null
  if (beforeValue !== afterValue) {
    if (beforeValue && afterValue) {
      const delta = Math.abs(afterValue - beforeValue) / beforeValue
      if (delta >= 0.1) reasons.push('deal_value_changed_significantly')
    } else {
      reasons.push('deal_value_set_or_cleared')
    }
  }

  // 5. Blockers
  const beforeBlockers = (b.blockers ?? []).length
  const afterBlockers = (a.blockers ?? []).length
  if (beforeBlockers !== afterBlockers) reasons.push('blockers_count_changed')

  // 6. Decisions
  const beforeDecisions = (b.decisions ?? []).length
  const afterDecisions = (a.decisions ?? []).length
  if (afterDecisions > beforeDecisions) reasons.push('decision_added')

  // 7. Next meeting
  const beforeMeeting = (b as any).next_meeting?.date ?? null
  const afterMeeting = (a as any).next_meeting?.date ?? null
  if (beforeMeeting !== afterMeeting) reasons.push('next_meeting_changed')

  // 8. Last meeting (newly populated)
  const beforeLast = (b as any).last_meeting?.date ?? null
  const afterLast = (a as any).last_meeting?.date ?? null
  if (!beforeLast && afterLast) reasons.push('meeting_just_happened')

  // 9. Confidence delta ≥ 10
  const beforeConf = (b as any).confidence?.value ?? null
  const afterConf = (a as any).confidence?.value ?? null
  if (beforeConf != null && afterConf != null) {
    if (Math.abs(afterConf - beforeConf) >= 10) reasons.push('confidence_shifted')
  }

  // 10. Slow-moving deal staleness
  if (args.messagesSinceLastBuyerView >= 5) {
    reasons.push('staleness_threshold')
  }

  return {
    isMaterial: reasons.length > 0,
    reasons,
  }
}
```

(Note: commitments-table changes are detected separately, see "Commitment-driven invalidation" below.)

## Wire into klo-respond

In `supabase/functions/klo-respond/index.ts`, after the main extraction call returns the new `klo_state` and you've persisted it, add:

```typescript
import { detectMaterialChange } from '../_shared/material-change-detector.ts'
import { buildBuyerViewPrompt } from '../_shared/prompts/buyer-view-prompt.ts'
import { BUYER_VIEW_TOOL } from '../_shared/buyer-view-tool.ts'

// ... after main extraction completes and new klo_state is persisted ...

// Decide if buyer_view should be regenerated
const messagesSinceLastBuyerView = await countMessagesSince(
  sb,
  deal.id,
  beforeState?.buyer_view?.generated_at ?? null
)

const materialCheck = detectMaterialChange({
  before: beforeState,
  after: newKloState,
  messagesSinceLastBuyerView,
})

console.log(JSON.stringify({
  event: 'buyer_view_gating_decision',
  deal_id: deal.id,
  is_material: materialCheck.isMaterial,
  reasons: materialCheck.reasons,
}))

if (!materialCheck.isMaterial) {
  // Skip the buyer-view call — keep existing buyer_view as-is.
  // The main extraction response is already returned to the client.
  return // or whatever the existing flow does
}

// Material change — generate buyer_view
try {
  const buyerViewPrompt = buildBuyerViewPrompt({
    dealTitle: deal.title,
    buyerCompany: deal.buyer_company ?? 'the buyer',
    sellerCompany: deal.seller_company ?? 'the vendor',
    recipientLabel: 'the buyer',  // Phase 9 can use buyer's actual name
    currentState: newKloState,
    sellerProfile,
    previousMomentumScore: beforeState?.buyer_view?.momentum_score ?? null,
  })

  const buyerViewResult = await callLlm({
    systemPrompt: buyerViewPrompt,
    messages: [{ role: 'user', content: 'Emit the buyer dashboard.' }],
    tool: BUYER_VIEW_TOOL,
    maxTokens: 1500,
    temperature: 0.6,
  })

  if (!buyerViewResult.toolCalled) {
    console.warn('buyer_view tool not called — skipping update', buyerViewResult)
  } else {
    const buyerView = (buyerViewResult.input as any).buyer_view
    buyerView.generated_at = new Date().toISOString()
    buyerView.generation_reason = beforeState?.buyer_view ? 'material_change' : 'initial'

    // Merge into klo_state — preserve everything else
    const mergedState = { ...newKloState, buyer_view: buyerView }

    await sb
      .from('deals')
      .update({ klo_state: mergedState })
      .eq('id', deal.id)

    console.log(JSON.stringify({
      event: 'buyer_view_generated',
      deal_id: deal.id,
      reason: buyerView.generation_reason,
      momentum_score: buyerView.momentum_score,
    }))
  }
} catch (err) {
  // Non-fatal — buyer view is best-effort. Don't fail the chat turn over it.
  console.error('buyer_view generation failed', err)
}
```

### Helper: countMessagesSince

```typescript
async function countMessagesSince(
  sb: any,
  dealId: string,
  sinceISO: string | null
): Promise<number> {
  if (!sinceISO) return 999  // force regeneration
  const { count } = await sb
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('deal_id', dealId)
    .gt('created_at', sinceISO)
    .neq('sender_type', 'klo')  // don't count Klo's own messages
  return count ?? 0
}
```

## Commitment-driven invalidation

Commitments are in their own table, not in `klo_state`. The `klo-watcher` Edge Function (existing) detects overdue commitments. Extend it to also mark `buyer_view` for regeneration on the next chat turn:

In `klo-watcher/index.ts`, when a commitment is flipped to overdue, set a flag on the deal:

```sql
update deals set klo_state = jsonb_set(klo_state, '{buyer_view, generation_reason}', '"stale_commitment"') where id = $1
```

Then in the gating logic above, treat `buyer_view.generation_reason === 'stale_commitment'` as material. (Alternative: just trigger regeneration directly from `klo-watcher` — but that adds an LLM call from a cron-style function, which I'd avoid until needed.)

For Phase 8, **defer commitment-driven regeneration** to a follow-up. The 5-message staleness rule already covers the common case. Add this as a sub-task in `10-phase-8-4-deferred.md`.

## Cost ceiling enforcement

Add a safety log if too many buyer-view calls happen in a short window:

```typescript
// Light rate limit: count buyer_view generations for this seller in the last hour
const { count: recentBuyerViewGens } = await sb
  .from('klo_state_history')
  .select('id', { count: 'exact', head: true })
  .eq('change_kind', 'buyer_view_generated')
  .gte('changed_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
  // ... filter by seller via deal join — or simplify by tracking on the deal directly

if (recentBuyerViewGens && recentBuyerViewGens > 30) {
  console.warn('buyer_view generation rate high', { sellerId: deal.seller_id, recent: recentBuyerViewGens })
  // Don't block — just log. If this fires repeatedly, gating logic needs tuning.
}
```

This is observability only — no hard cutoff. Tune in Sprint D acceptance.

## What this step does NOT do

- Does NOT touch the UI — buyer dashboard is step 07
- Does NOT add a manual "regenerate buyer view" button — defer to step 08 (seller preview tab)
- Does NOT version `buyer_view` separately from `klo_state` — they share `klo_state.version`

## Claude Code instructions

```
1. Create supabase/functions/_shared/material-change-detector.ts with the detectMaterialChange function.
2. Add the buyer-view extraction block to supabase/functions/klo-respond/index.ts AFTER the main extraction has persisted klo_state. Wrap in try/catch — never let buyer-view failure fail the chat turn.
3. Add the countMessagesSince helper.
4. Deploy: `supabase functions deploy klo-respond --no-verify-jwt`
5. Test: send 3 chat messages on a real deal. Verify in logs:
   - First message: `buyer_view_gating_decision` with reason `first_generation`, then `buyer_view_generated`
   - Second trivial message ("got it, thanks"): `buyer_view_gating_decision` with empty reasons, no `buyer_view_generated`
   - Third message that mentions a new stakeholder: gating with reason `person_added`, then `buyer_view_generated`
6. Verify in Supabase: `select klo_state->'buyer_view' from deals where id = '<test-deal>';` — should return the structured buyer view.
7. Commit: "Phase 8 step 06: buyer view extraction call with material-change gating"
8. Push.
```

## Acceptance

- [ ] Function deploys without error
- [ ] First-time chat on a deal generates buyer_view
- [ ] Trivial follow-up messages do NOT regenerate buyer_view (verified in logs)
- [ ] Material messages (new person, stage change, etc.) DO regenerate
- [ ] After 5 non-material seller messages, staleness threshold triggers regeneration
- [ ] buyer_view JSON in DB matches the type shape from step 04
- [ ] No regression to chat reply latency (the buyer-view call is async / does not block the chat reply to the user — verify in client)
- [ ] Cost per turn (averaged over 20 mixed turns): under $0.002
- [ ] Committed and pushed

→ Next: `07-buyer-dashboard-ui.md`
