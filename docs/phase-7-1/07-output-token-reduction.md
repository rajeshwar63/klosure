# Step 07 — Output token reduction

**Sprint:** C
**Goal:** Cap and trim Klo's structured output. This is where cost AND latency improve. Smaller output = cheaper AND faster.

## Why output is the lever

In a typical klo-respond call:
- Input: 5,400 tokens × $0.10/1M = $0.00054
- Output: 1,000 tokens × $0.40/1M = $0.0004
- **Output is 42% of cost despite being 16% of tokens.**

Latency is even more output-dominated. Each output token takes ~10-15ms on Flash-Lite. 1,000 output tokens = ~12 seconds of pure generation time (parallelized in streaming, but still the bottleneck).

Reducing output tokens by 25% saves ~$0.0001 per call AND ~250ms of latency. That's the win.

## File changes

- `supabase/functions/klo-respond/index.ts` — update tool schema
- `supabase/functions/_shared/prompts/sections.ts` — update OUTPUT_REQUIREMENTS_SECTION

## Tool schema changes

In `KLO_OUTPUT_TOOL`, tighten field constraints:

```typescript
const KLO_OUTPUT_TOOL: LlmToolDefinition = {
  name: "emit_klo_response",
  description: "...",
  parameters: {
    type: "object",
    properties: {
      reply_text: {
        type: "string",
        description: "Klo's chat reply. STRICT MAXIMUM: 4 sentences. Often 2-3 is enough."
      },
      klo_state: {
        type: "object",
        properties: {
          summary: {
            type: ["string", "null"],
            description: "ONE sentence describing the current deal state. Max 30 words. Null if deal is brand new."
          },

          // ... other fields ...

          confidence: {
            type: ["object", "null"],
            properties: {
              value: { type: "number" },
              trend: { type: "string", enum: ["up", "down", "stable"] },
              delta: { type: "number" },
              factors_dragging_down: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Max 12 words." },
                    impact: { type: "number" }
                  }
                },
                maxItems: 3,  // ← was 5, now 3
                description: "Top 3 factors dragging confidence down. Most impactful first."
              },
              factors_to_raise: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Max 12 words." },
                    impact: { type: "number" }
                  }
                },
                maxItems: 3,  // ← was 5, now 3
                description: "Top 3 actions that would raise confidence. Highest impact first."
              },
              rationale: {
                type: "string",
                description: "ONE sentence explaining the score. Max 25 words."
              }
            }
          },

          klo_take_seller: {
            type: ["string", "null"],
            description: "2-3 sentence coaching paragraph for the seller. Max 240 chars (~40 words). Direct and specific."
          },

          klo_take_buyer: {
            type: ["string", "null"],
            description: "2 sentence coaching for the buyer. Max 180 chars. ONLY populate if buyer has joined this deal (mode: 'shared'). If solo seller deal, set to null to save tokens."
          },

          // ... other fields ...
        }
      }
    }
  }
};
```

## OUTPUT_REQUIREMENTS section update

```typescript
export const OUTPUT_REQUIREMENTS_SECTION = `<output_requirements>
Every field in klo_state must be present. Use null for empty objects, [] for empty arrays.

STRICT LENGTH CAPS:
- reply_text: 2-4 sentences, max 60 words total
- summary: 1 sentence, max 30 words
- factor labels: max 12 words each
- rationale: 1 sentence, max 25 words
- klo_take_seller: max 240 chars (~40 words)
- klo_take_buyer: max 180 chars — and ONLY populate if mode is 'shared' (buyer has joined). If solo seller deal, set to null.

ARRAY CAPS:
- factors_dragging_down: top 3 only
- factors_to_raise: top 3 only
- people: no cap, but no duplicates
- decisions: no cap, but only material decisions
- blockers: no cap, but only currently-active blockers (resolved blockers stay in history, not the live list)
- open_questions: top 5 most important

EFFICIENCY PRINCIPLE:
If a field has not changed and you'd be writing the same content as in current_klo_state, you may write a shorter version. The merge layer keeps existing data when fields are similar.

DO NOT pad short content with extra clauses. "She confirmed budget" is better than "She has formally confirmed the budget allocation in our recent discussion."
</output_requirements>`;
```

## Why klo_take_buyer null for solo deals

This is the biggest single output saving. Today, every chat turn generates a `klo_take_buyer` paragraph (~40 words, ~80 tokens) even on solo deals where no buyer has joined.

If 80% of chat traffic is solo deals (likely true based on your usage so far), skipping `klo_take_buyer` saves ~64 tokens per call on average. That's $0.000026 per call × 3,000 calls/month = $0.08/month per seller. Small but free.

## Estimated output token reduction

| Field | Before | After | Saving |
|---|---|---|---|
| reply_text | ~80 tokens | ~60 tokens | 20 |
| summary | ~50 tokens | ~30 tokens | 20 |
| factors arrays (3 each, capped) | ~200 tokens | ~120 tokens | 80 |
| rationale | ~40 tokens | ~25 tokens | 15 |
| klo_take_seller | ~50 tokens | ~40 tokens | 10 |
| klo_take_buyer (often null on solo) | ~80 tokens | ~10 tokens (null) | 70 |
| **Total output** | ~1,000 | ~735 | **-265** |

Output drops by ~26%. Cost drops correspondingly. Latency improves by ~300-400ms.

## What this step does NOT do

It does NOT remove fields. Every field in the schema still exists. It just constrains length.

Don't be tempted to remove fields entirely (e.g., "drop klo_take_buyer entirely on solo deals"). The frontend code expects the field to exist (just null is fine). Removing it would break Phase 6 components.

## Acceptance

- [ ] Tool schema updated with new maxItems and description caps
- [ ] OUTPUT_REQUIREMENTS_SECTION updated with strict length rules
- [ ] Deploy
- [ ] Send 5 chat messages across 2-3 deals
- [ ] Check logs: average output tokens should drop from ~1,000 to ~700-800
- [ ] Latency: average response time should drop from ~2.5-3s to ~2-2.5s
- [ ] Cost per call: should drop from ~$0.0009 to ~$0.0007
- [ ] Quality check: replies should still feel complete and useful, not truncated mid-thought
- [ ] Solo deals: klo_take_buyer should be null in the output (verify in DB after a chat turn on a solo deal)

If reply_text feels truncated:
- Increase reply_text max to 5 sentences
- Verify it's the cap causing it, not the new voice section

If factors arrays feel insufficient (only 3 shown):
- This is acceptable for the compact strip view
- The expanded "Klo's full read" view will need to live with 3 factors instead of 5 — that's fine

→ Next: `08-acceptance-walkthrough.md`
