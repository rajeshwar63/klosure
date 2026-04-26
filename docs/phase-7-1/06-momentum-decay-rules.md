# Step 06 — Momentum decay rules

**Sprint:** B
**Goal:** Make Klo's coaching time-aware. When a deal hasn't moved, Klo's voice should escalate from "advice" to "warning" to "alarm." This catches deals before they die.

## Why this matters

Sellers don't notice slow decay. A deal that hasn't progressed in 2 weeks doesn't feel like a problem — it feels like a "deal we're working on." Klo can quantify and surface that decay before it becomes terminal.

This complements step 05's hard stops. Hard stops are about state (signatory unknown, competitor in play). Momentum decay is about time (stage hasn't changed in N days, last buyer message was X days ago).

## File

- `supabase/functions/_shared/prompts/sections.ts` — add `MOMENTUM_SECTION`

## The new MOMENTUM section

```typescript
export const MOMENTUM_SECTION = `<momentum_rules>
Sales velocity matters more than activity volume. Apply these momentum checks against the chat history timestamps and deal stage history.

MOMENTUM SIGNALS (compute these from the data):

- days_since_last_buyer_message: based on chat_history timestamps
- days_since_seller_action: based on chat_history timestamps
- days_at_current_stage: based on stage history (estimate from chat if no history available)
- has_next_meeting: based on klo_state.next_meeting

DECAY TIERS — match the worst applicable tier:

TIER 0 (healthy):
- Buyer message within 5 days
- Stage moved within 10 days
- Next meeting scheduled OR active commitment in flight
→ klo_take_seller: normal advice tone

TIER 1 (mild decay — 5-10 days slow):
- Buyer silent 5-10 days, OR
- Same stage 10-20 days
→ klo_take_seller voice shifts to: "[Name] has been quiet [N] days. Send a forcing message before this drifts further."
→ Add to factors_dragging_down: "[N] days since buyer last engaged"

TIER 2 (warning — 10-15 days):
- Buyer silent 10-15 days, OR
- Same stage 21+ days, OR
- No next_meeting AND no active commitment
→ klo_take_seller voice shifts to: "This deal is drifting. [N] days of silence. Make ONE direct call this week — leave a voicemail if no answer. Email is dead at this point."
→ Apply hard stop #4 from confidence_hard_stops if applicable
→ confidence.trend = 'down' regardless of value movement

TIER 3 (deal rot — 15+ days):
- Buyer silent 15+ days
- No next_meeting
- No new information from any source in 10+ days
→ klo_take_seller voice shifts to: "This deal is dying. [N] days dark. Either escalate above [stakeholder] this week to revive it, or accept the loss and free up your pipeline. Sitting on it is the worst option."
→ confidence.value capped at 25 regardless of other factors
→ Add to blockers[]: "Deal-rot: [N] days dark — escalation or loss decision needed"

VOICE ESCALATION PRINCIPLE:

The same deal with the same facts but different time profiles should produce different coaching:

- Day 3 of buyer silence: "Send a follow-up to Hashim — keep it casual, just check on the proposal review."
- Day 10 of silence: "Hashim has been quiet 10 days. Call him — don't email. If voicemail, leave a clear next step."
- Day 18 of silence: "This is dying. Escalate to Hashim's boss this week or write it off. Don't keep emailing."

The voice should match the urgency. Soft when it's soft. Hard when it's hard.

DO NOT:
- Apply momentum tiers to deals less than 5 days old
- Treat seller silence as decay (sellers can be quiet because they're working other deals)
- Override momentum-driven warnings with optimistic framing
</momentum_rules>`;
```

## Token cost

~440 tokens. Net new content. +440 input tokens.

## Why this is worth the cost

Momentum decay is the #1 reason deals die. Sellers don't notice. The product's value proposition is "Klo catches things you miss." Momentum-aware coaching is THE feature that delivers on that promise.

If we skip this section, Klo treats day-3 and day-15 silence the same. That's a generic-coach failure, exactly what you complained about earlier.

## Total Sprint A+B input cost

So far:
- Step 03 (voice): +130 tokens
- Step 04 (grounding): +130 tokens
- Step 05 (hard stops): +310 tokens
- Step 06 (momentum): +440 tokens
- Total input increase: **+1,010 tokens**

This is a real cost: at $0.10/1M input tokens, that's $0.0001 per call. Over 3,000 messages/month, $0.30/seller/month additional input cost.

Step 07 (output reduction) will save more than this on the output side. Net: cost-neutral or slightly cheaper.

## Acceptance

- [ ] `MOMENTUM_SECTION` added to `sections.ts`
- [ ] Imported into both prompts
- [ ] Deploy
- [ ] Test scenarios:

  Test 1: Deal where buyer's last message was today.

  Pass: klo_take_seller is normal-toned coaching. No momentum-related factors_dragging_down.

  Test 2: Simulate a deal where buyer's last message was 12 days ago. Send a chat message about something unrelated.

  Pass: klo_take_seller's tone is now "warning" — explicitly mentions "12 days" and recommends a phone call (not email). factors_dragging_down includes the silence factor.

  Test 3: Deal where last buyer message was 18 days ago AND no next_meeting AND no recent state changes.

  Pass: klo_take_seller's tone is "deal rot" — explicitly suggests escalation OR write-off. confidence.value capped at 25.

- [ ] Tone escalation should feel proportionate. Day 3 silence should NOT trigger alarm.
- [ ] Cost per call should be ~$0.0010 (slightly higher input, similar output)
- [ ] Latency should remain ~2.5-3 seconds

→ Next (Sprint C): `07-output-token-reduction.md`
