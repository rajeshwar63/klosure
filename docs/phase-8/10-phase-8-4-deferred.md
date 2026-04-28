# Step 10 — Phase 8.4 (deferred): seller honesty pass

**Status:** ⏸ Deferred. Do not start.
**Trigger:** Revisit only after Rajeshwar has used the post-Phase-8 product on real deals for at least 2-3 days AND specific signals indicate the seller-side coaching still feels too soft.

## Why this is deferred

Phase 8.1 (seller profile injection) addresses the original "too generic" feedback by making every Klo response specific to the seller's role, market, ICP, and deal-killer patterns. That alone resolves most of the diplomatic-hedging issue Rajeshwar flagged on April 27 — generic advice was the root cause; a more honest prompt without specificity wouldn't have fixed it.

Building 8.4 before 8.1+8.2+8.3 are used on real deals risks fixing the wrong thing.

## Trigger conditions to pick this up

Build 8.4 if AND ONLY IF, after 2-3 days of real-deal use:

1. **Rajeshwar reports** that on at least 2 different deals, Klo's seller-side advice was clearly too soft — failed to recommend the hard call (push for the meeting / escalate / walk away) when the situation called for it.
2. **OR** he can paste 2+ specific Klo replies from real deals where the right answer was uncomfortable and Klo gave a comfortable answer instead.
3. **OR** seller profile injection demonstrably did NOT change Klo's tone (Test 1 in step 09 didn't pass).

Without one of these signals, leave it deferred.

## Hypothesized scope (only relevant if triggered)

If 8.4 is built, the likely changes:

### 8.4.A — Add a "hard call" rule to the seller voice section

Update `VOICE_SECTION` in `_shared/prompts/sections.ts` to include explicit hard-call guidance:

```
<hard_call_rule>
When the deal situation actually warrants a hard recommendation, give it. Do not soften.

Examples of situations that warrant the hard call:
- Buyer has gone quiet for 7+ days after a critical milestone — recommend escalation to a different stakeholder, not "follow up politely"
- Champion has been replaced or sidelined — recommend re-anchoring, not "rebuild the relationship"
- Procurement timeline has slipped past the point where the original close date is achievable — say so directly, recommend resetting expectations
- Deal value has been requested to drop more than 30% — recommend either accepting the new reality or declining, not "negotiate flexibly"

DO say:
- "This deal is unlikely to close this quarter. Reset internal expectations and shift focus to {other deal}."
- "Your champion has lost influence. Escalate to {other stakeholder} or accept this is dead."
- "Walk away. The signals say this isn't real."

DO NOT say:
- "It might be worth considering..."
- "One option could be..."
- "Have you thought about reaching out again?"

Soft framing on a hard situation is a failure mode. The seller pays for honesty, not comfort.
</hard_call_rule>
```

### 8.4.B — Calibrate honesty against confidence + momentum decay

The `CONFIDENCE_SCORING_SECTION` and `MOMENTUM_SECTION` from Phase 7.1 already provide signals for when a deal is in trouble. Make them drive seller voice:

- If `confidence.value < 30` AND deal has been at this confidence for 7+ days → seller take MUST include the hard call
- If `momentum_decay` flags inactivity > 14 days on a deal in negotiation/legal stage → seller take MUST recommend either a forcing action or a written acknowledgment that the deal is dormant

Implement as additional rules in the seller-side prompt.

### 8.4.C — Buyer dashboard NOT affected

Whatever seller-honesty changes happen, the buyer dashboard rules are untouched. The buyer never gets harder-edged framing — same `BUYER_VIEW_HARD_STOPS_SECTION` applies. This separation is exactly why Phase 8 split the two voices in the first place.

## What this deferred step does NOT do

- Does NOT pre-write the prompt changes — wait for evidence first
- Does NOT add new schema or UI — voice changes are prompt-only
- Does NOT block Phase 9 — Phase 9 candidates (calendar integration, Snooze/Mark done wiring, weekly_brief mode, differential extraction, etc.) can proceed in parallel if needed

## Claude Code instructions

```
None. This step has no actions.

If, after 2-3 days of post-Phase-8 use, the trigger conditions above fire:
1. Open this file
2. Convert "Hypothesized scope" into actual prompt edits in _shared/prompts/sections.ts
3. Number the new sub-steps as 11-, 12-, 13- in this folder
4. Build, test, ship
```

## Acceptance

- [ ] No action taken — file exists as a parking spot
- [ ] Triggers documented for future decision-making
- [ ] After 2-3 days of Phase 8 use, Rajeshwar reviews the trigger conditions and decides go/no-go

— end of Phase 8 spec —
