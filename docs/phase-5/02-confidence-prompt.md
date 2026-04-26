# Step 02 — Update extraction prompt to compute confidence

**Sprint:** 1
**Goal:** Klo computes a confidence score on every turn alongside the existing `klo_state` output. Also update the tool schema so Anthropic enforces the new fields.

## Files touched

- `supabase/functions/_shared/prompts/extraction-prompt.ts` — add a confidence-scoring section
- `supabase/functions/_shared/prompts/bootstrap-prompt.ts` — add the same section
- `supabase/functions/klo-respond/index.ts` — extend the `KLO_OUTPUT_TOOL` schema with the new fields

## What to add to BOTH prompts

Add this section after the extraction rules and before the output instructions:

```markdown
## Confidence scoring

After updating klo_state, compute a confidence score (0-100) representing your honest read of how likely this deal is to close by its deadline.

This is NOT a calibrated probability. It's your structured assessment based on:

- Stage progression vs. days remaining to deadline
- Commitment health (anything overdue, anything proposed-but-unconfirmed)
- Stakeholder coverage (signing authority identified? Multi-threaded?)
- Buyer engagement (silence > 5 days is a signal)
- Confidence levels of recorded facts (tentative deadline = lower confidence; tentative budget = lower confidence)
- Direct buyer signals (urgency expressed, specific dates committed, blockers raised)

### Score guidance

- 80-100: deal is on track, multiple positive signals, clear path to close
- 60-79: deal is moving but has visible risks
- 40-59: meaningful problems — overdue commitments, missing stakeholders, buyer hesitation
- 20-39: deal is slipping — multiple compounding issues
- 0-19: deal is dead or near-dead — long silence, missed deadlines, key facts contested

### Trend

Compare your new score to `previous_confidence_value` from current state:
- "up" if new score is at least 3 points higher
- "down" if new score is at least 3 points lower
- "flat" otherwise

`delta` = new score minus previous_confidence_value (signed integer). If no previous, delta = 0 and trend = "flat".

### Factors

Output 1-5 `factors_dragging_down` (negative impact items) and 1-5 `factors_to_raise` (specific actions that would meaningfully move the score up).

Each factor has:
- `label`: short, scannable, one phrase ("Signing authority unknown" not "There is no identified signatory at this stage of the deal")
- `impact`: signed integer percentage points

Rules for `impact`:
- factors_dragging_down: negative integers (e.g., -22, -15, -8)
- factors_to_raise: positive integers (e.g., +22, +15, +8)
- Be honest about magnitudes. A signing-authority gap on a deadline-critical deal is worth -20+ points. A 1-day commitment slip on a 60-day deal is -5 points at most.
- Don't pad with low-impact items. Three honest factors > five inflated ones.
- factors_to_raise must be specific actions the seller can take, not vague aspirations. "Identify signing authority this week" not "Improve stakeholder coverage."

### Rationale

1-2 sentences in plain language. State the score, name the top 1-2 things driving it, and (if relevant) compare to history. Examples:

- "Two things dragged this score: signatory still unknown 36 days out, and the proposal commitment is overdue. Across deals you've closed, this pattern is rough."
- "Strong forward momentum — three commitments confirmed this week, decision-maker engaged, no blockers."
- "Score is volatile because the buyer's go-live date is tentative. Until that's confirmed, treat the number as wide error bars."

### Honesty principle

Do not inflate the score to make the seller feel good. A 38% score is more useful than a fake 65%. The seller's pipeline forecast and the manager's quarter view depend on these numbers being honest.
```

## What to add to the tool schema

In `supabase/functions/klo-respond/index.ts`, extend `KLO_OUTPUT_TOOL.input_schema.properties.klo_state.properties` with:

```javascript
confidence: {
  type: ["object", "null"],
  properties: {
    value: { type: "integer", minimum: 0, maximum: 100 },
    trend: { type: "string", enum: ["up", "down", "flat"] },
    delta: { type: "integer" },
    factors_dragging_down: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          impact: { type: "integer", maximum: 0 }
        },
        required: ["label", "impact"]
      }
    },
    factors_to_raise: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          impact: { type: "integer", minimum: 0 }
        },
        required: ["label", "impact"]
      }
    },
    rationale: { type: "string" },
    computed_at: { type: "string" }
  },
  required: ["value", "trend", "delta", "factors_dragging_down", "factors_to_raise", "rationale", "computed_at"]
},
previous_confidence_value: {
  type: ["integer", "null"]
}
```

(`confidence` is in the schema but NOT in the `required` array of klo_state — it's optional.)

## Trend handling in `klo-respond`

After parsing the tool response in `callAnthropic`, before returning, ensure trend bookkeeping is correct:

```typescript
// In klo-respond/index.ts, after we have new state but before writing it to deals.klo_state:
if (output.klo_state.confidence) {
  // Set previous_confidence_value to the current state's value, for next turn
  output.klo_state.previous_confidence_value = ctx.deal.klo_state?.confidence?.value ?? null;
}
```

This preserves the chain so the next turn knows what the previous score was.

## Acceptance

- Both prompts include the confidence scoring section
- Tool schema accepts the new fields
- After deploy, send any chat message in a deal — verify `klo_state.confidence` is populated:
  ```sql
  select klo_state->'confidence' from deals where id = '<deal-id>';
  ```
- Score should be a sensible number (a real Phase 4.5 deal with overdue commitments should score 30-50, not 80)
- `factors_dragging_down` impacts are all negative integers
- `factors_to_raise` impacts are all positive integers
- `rationale` is 1-2 sentences, references actual facts from the deal

If Klo's first scores look inflated (everything 70+), iterate the prompt — add stricter examples in the Score guidance section until scores feel honest.

→ Next: `03-confidence-render.md`
