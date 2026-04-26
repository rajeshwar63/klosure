# Step 04 — klo-respond prompt tweaks for Gemini

**Sprint:** B
**Goal:** Small adjustments to the system prompts (extraction-prompt.ts, bootstrap-prompt.ts, extraction-rules-text.ts) to compensate for differences between Claude's and Gemini Flash-Lite's behavior.

## Why this is needed

Claude Sonnet was trained to be unusually good at following nuanced instructions and inferring conventions. Gemini Flash-Lite needs more explicit guidance:

- More direct phrasing
- Explicit "do" and "don't" rather than implicit conventions
- Stronger reminders to use the tool
- Explicit handling of common failure modes

These changes make the prompts work for both models. They don't degrade Claude — they just become more explicit, which is good prompt hygiene.

## Files

- `supabase/functions/_shared/prompts/extraction-prompt.ts`
- `supabase/functions/_shared/prompts/bootstrap-prompt.ts`
- `supabase/functions/_shared/prompts/extraction-rules-text.ts`

## Changes — extraction-prompt.ts

### Open with a direct instruction

The current opening starts with context. Replace it with a direct command:

```
You are Klo, an AI sales coach. You will receive:
1. A deal record (klo_state JSON) — what's currently known about the deal
2. The full chat history
3. A new message from the user

Your job:
1. Generate a coaching reply (Klo's voice — see VOICE section below)
2. Update the klo_state with anything new from the message
3. Output BOTH by calling the emit_klo_response tool

You must call the tool exactly once. Do not output free-form text.

[... rest of the prompt continues as before ...]
```

The "you must call the tool" reminder appears at the top AND repeats in the tool description (step 02). This redundancy is intentional for Flash-Lite reliability.

### Make the VOICE section more explicit

Today's prompt likely has Klo's voice described conversationally ("Klo is direct, etc."). Make it concrete:

```
## VOICE

Klo speaks like a senior sales VP coaching a rep:
- Direct, not corporate. "You need to send the proposal today" not "It might be advisable to consider sending the proposal."
- Specific, not generic. "Ask Ahmed who signs the contract" not "Try to identify the decision-maker."
- 2-4 sentences for chat replies. Never more than 5.
- Never apologetic. Never hedges with "I think" or "perhaps."
- Acknowledges what the user said before pivoting to advice.

DO NOT say:
- "Great question!" / "I understand!" / "I'd be happy to..."
- "It depends..."
- "Have you considered..."

DO say:
- "Send X to Y today." / "Ask Z about W."
- "The next move is..."
- "Here's why this matters: ..."
```

This pre-empts Flash-Lite's tendency to drift toward generic chatbot voice.

### Tighten the extraction rules introduction

Add an explicit "fields you must always emit" section:

```
## OUTPUT REQUIREMENTS

When calling emit_klo_response, you must include EVERY field listed below in klo_state. Use null for object fields when there's nothing to put. Use [] for array fields when there's nothing to list. Never omit a field.

Required fields and their handling when empty:
- summary: string or null
- stage: string (always one of the enum values, never null)
- deal_value: object with amount/currency/confidence, or null
- deadline: object with date/confidence, or null
- people: array (use [] if no people identified)
- decisions: array (use [] if none)
- blockers: array (use [] if none)
- open_questions: array (use [] if none)
- confidence: object with value/trend/delta/factors_to_raise/rationale, or null only if literally no information
- klo_take_seller: string or null
- klo_take_buyer: string or null
- next_meeting: object or null
- last_meeting: object or null
```

This duplicates the schema's `required` list as plain English. Flash-Lite responds well to redundant explicit rules.

## Changes — bootstrap-prompt.ts

The bootstrap prompt is used for legacy deals that don't have a `klo_state` yet. It does the first-time extraction from full chat history.

Apply the same opening reframe and OUTPUT REQUIREMENTS section. Bootstrap and extraction prompts should look near-identical structurally — they differ only in whether there's an existing state to merge into.

## Changes — extraction-rules-text.ts

This file contains the detailed per-field extraction rules (people, blockers, decisions, etc.) — the same rules that come from EXTRACTION_RULES.md.

Two changes:

### 1. Add explicit DO/DON'T pairs to each rule section

Today's rules might say "extract people who are stakeholders." Change to:

```
## people

DO extract: anyone the user or buyer mentions by name AND in a context that suggests they're involved in the deal (decision-maker, influencer, blocker, signatory, ally).

DO NOT extract:
- People mentioned only in passing without deal relevance
- Public figures referenced as analogies ("we should be like Apple's CEO")
- Past coworkers mentioned without current relevance

When uncertain, include them with a note in role like "mentioned only — relevance unclear."
```

Apply this DO/DON'T pattern across all extraction categories.

### 2. Add confidence calibration anchors

Today's confidence rule might describe how to score confidence in general terms. Add concrete anchors:

```
## confidence.value

Score from 0-100 based on the deal's likelihood of closing by the deadline.

Anchors:
- 85+ : Verbal commit + signed paper imminent. Budget approved. Decision-maker engaged.
- 65-84: Strong intent, decision-maker known, no major blockers, but not yet signed.
- 50-64: Active engagement, but ≥1 unresolved blocker (signatory unknown, budget uncertain, competitor in play).
- 30-49: Stuck. Stakeholders silent OR major blocker not being addressed.
- <30: Effectively dead. No buyer-side energy in 2+ weeks.

Use these anchors. Don't invent intermediate values without justification.
```

Concrete anchors prevent Flash-Lite from drifting toward generic-feeling 50% scores on every deal.

## What this step delivers

After step 04:
- Klo's voice in chat replies stays sharp on Gemini Flash-Lite
- Extraction reliability stays high (every field always emitted)
- Confidence scoring stays calibrated against real-world anchors
- The prompts also work fine on Claude (the changes are improvements, not Gemini-specific hacks)

## Acceptance

- [ ] All three prompt files updated with the changes above
- [ ] Deploy: `supabase functions deploy klo-respond --no-verify-jwt`
- [ ] Send 5 test messages in DIB chat — varied content (one tactical question, one factual update, one short ack, one meeting reference, one open question)
- [ ] Verify Klo's reply voice feels like Klo (direct, specific, 2-4 sentences) — NOT generic chatbot ("Great question!")
- [ ] Verify each turn's `klo_state` has all fields (no omitted fields, even when null)
- [ ] Verify `confidence.value` feels calibrated (e.g., DIB's 58% reflects real factors, not a default-feeling number)

If voice quality has clearly degraded vs. Claude, two options:
- Option 1: Tighten the VOICE section more aggressively
- Option 2: Override `klo_take_seller` / `klo_take_buyer` to use a Pro model (Phase 7.5)

For Phase 7 we evaluate after step 09 (full acceptance walkthrough). Don't decide on this until you've used Klosure for a couple of days on the new model.

→ Next (Sprint C): `05-klo-daily-focus.md`
