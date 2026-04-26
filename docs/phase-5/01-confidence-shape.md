# Step 01 — Extend `klo_state` with confidence

**Sprint:** 1 (Per-deal confidence)
**Goal:** Add the confidence fields to `klo_state` types. No prompt changes yet, no UI yet — just types.

## Deliverable

Modify `supabase/functions/_shared/klo-state-types.ts` to add three new fields to `KloState`:

```typescript
export interface ConfidenceFactor {
  label: string;            // "Signing authority unknown" — short, scannable
  impact: number;           // signed integer percentage points (e.g., -22, +15, +8)
  // Negative values are dragging the score DOWN; positive are pushing UP
  // The frontend renders negatives in the explanation, positives in "what would move this up"
}

export interface ConfidenceScore {
  value: number;            // 0-100, integer
  trend: 'up' | 'down' | 'flat';   // since last computed
  delta: number;            // signed integer — points changed since previous turn
  factors_dragging_down: ConfidenceFactor[]; // 0-5 items, ordered worst-first
  factors_to_raise: ConfidenceFactor[];      // 0-5 items, ordered highest-impact first
  rationale: string;        // 1-2 sentence narrative — "Two things dragged this score: ..."
  computed_at: string;      // ISO timestamp
}
```

Then add these fields to the `KloState` interface:

```typescript
export interface KloState {
  // ... existing fields ...
  confidence?: ConfidenceScore;             // optional — null on freshly-bootstrapped deals
  previous_confidence_value?: number;       // tracks the previous score so we can compute trend/delta
}
```

## Rules

- `confidence` is optional. Old deals without it shouldn't break — the frontend handles `confidence == null` by showing nothing or a "Klo is still reading" placeholder.
- `factors_dragging_down` and `factors_to_raise` are capped at 5 items each. The prompt will ask Klo to keep them tight.
- `previous_confidence_value` is the only place we track score history at the state level — it's enough to compute trend without bloating storage. Detailed history goes through `klo_state_history` (which already logs every state change).

## Why we keep `confidence` inside `klo_state` rather than separate columns

Three reasons:
1. It's regenerated on every Klo turn alongside everything else — keeping it in `klo_state` means one write, not two
2. The history log automatically captures changes to confidence (because `klo_state_history` already tracks `klo_state` diffs)
3. Frontend already subscribes to `deals.klo_state` realtime updates — no new subscription needed

## Acceptance

- File compiles with no errors
- Existing imports of `KloState` still work (new fields are optional)
- Committed and pushed before moving to step 02

→ Next: `02-confidence-prompt.md`
