# Step 05 — Confidence hard stops

**Sprint:** B
**Goal:** Add deterministic ceiling rules to confidence scoring. Prevent Happy Ears bias — sellers (and AI coaches) tend to inflate confidence on deals with serious unresolved risks.

## Why this matters

Without rules, Klo will sometimes score a stuck deal at 60-65% based on the seller's optimistic framing in chat. The seller then trusts that score and doesn't allocate enough urgency. Three weeks later the deal dies and the seller is surprised.

Hard stops force the score to reflect reality even when the conversation sounds positive.

## File

- `supabase/functions/_shared/prompts/sections.ts` — add `HARD_STOPS_SECTION`

## The new HARD STOPS section

```typescript
export const HARD_STOPS_SECTION = `<confidence_hard_stops>
After computing your initial confidence value, apply these hard ceiling rules. The hard stop wins if it's lower than your initial score.

HARD STOPS:

1. Signatory unknown + ≤30 days to deadline
   → Max confidence: 35
   → Reason: "Without a confirmed signatory this close to deadline, contracts will not close in time."

2. Signatory unknown (any deadline)
   → Max confidence: 55
   → Reason: "Cannot close without identified signing authority."

3. Buyer silent ≥10 days
   → Max confidence: 45
   → Reason: "Extended buyer silence is the strongest predictor of deal loss."

4. Buyer silent ≥7 days AND no next_meeting scheduled
   → Max confidence: 50
   → Reason: "Silence without a forcing function = drift."

5. Stage = 'Proposal' AND no proposal sent
   → Max confidence: 50
   → Reason: "Stage misalignment — labeled proposal but no proposal in buyer's hands."

6. Stage = 'Negotiation' AND ≥3 open blockers
   → Max confidence: 55
   → Reason: "Too many unresolved issues to be in genuine negotiation."

7. Named competitor in deal AND no defensive plan in decisions[]
   → Max confidence: 60
   → Reason: "Active competition without a counter-strategy is a coin flip at best."

8. Stuck at same stage ≥21 days
   → Max confidence: 40
   → Reason: "Three weeks without stage movement = deal-rot. Confidence does not recover until movement."

WHEN APPLYING A HARD STOP:
- Set confidence.value to the ceiling
- Set confidence.trend to 'down' if previous value was higher
- Add the matching reason to confidence.factors_dragging_down
- Reflect the hard stop in confidence.rationale: "Capped at [N]% — [reason]."
- klo_take_seller MUST acknowledge the hard stop directly: "This deal is at [N]%, not higher, because [reason]. Fix [specific gap] to unlock."

DO NOT:
- Apply multiple hard stops to compound (only the lowest applies)
- Override a hard stop with optimistic factors_to_raise
- Hide the hard stop from the seller

Hard stops are honest. The seller needs to face reality to act on it.
</confidence_hard_stops>`;
```

## How this affects scoring

Before this step, Klo might score a deal at 65% with reasoning like "buyer is engaged, value confirmed, demo scheduled." After this step, if the signatory is unknown and the deadline is in 28 days, confidence is forced to 35 with rationale: "Capped at 35% — without a confirmed signatory this close to deadline, contracts will not close in time."

That score change drives different UI behavior (deal appears in DealsSlippingList from Phase 6.1, sidebar dot turns amber/red), and the seller takes appropriate action.

## Token cost

~310 tokens. Replaces no existing content (this is genuinely new logic). Net: +310 tokens input.

This is the largest input increase in the spec. Justified because the value is high — preventing Happy Ears is a core product value.

## Risks

- **Too aggressive:** every deal shows below 50%. If after testing this happens, soften the values (e.g., signatory unknown at 30 days → 45 instead of 35).
- **Sellers stop trusting Klo:** if confidence keeps capping, sellers may feel the tool is being unfair. Test on 5-10 real deals before accepting.

## Acceptance

- [ ] `HARD_STOPS_SECTION` added to `sections.ts`
- [ ] Imported into both prompts
- [ ] Deploy
- [ ] Test scenarios:

  Test 1: Create a deal with confidence ~65, signatory: null, deadline 25 days out. Send any chat message.

  Pass: confidence.value drops to 35 (or whatever rule 1 caps at). klo_take_seller mentions the cap explicitly. Rationale references the signatory gap.

  Test 2: Deal with active competitor named, no defensive plan, otherwise healthy.

  Pass: confidence ≤ 60. factors_dragging_down includes the competitive risk. klo_take_seller calls out the missing counter-strategy.

  Test 3: Healthy deal — signatory known, recent buyer message, demo scheduled, no competitor.

  Pass: NO hard stop applies. Confidence reflects normal scoring (could be 70+).

- [ ] Run on the existing DIB and Noor Bank deals — verify scores don't go below current values inappropriately
- [ ] Cost per call should remain ~$0.0009-0.001
- [ ] Latency should remain ~2.5-3 seconds

→ Next: `06-momentum-decay-rules.md`
