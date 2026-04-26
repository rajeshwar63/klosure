# Step 03 — Senior VP voice section

**Sprint:** A
**Goal:** Replace the current verbose voice description with a tight section using concrete DO/DON'T pairs. This is the single change with the biggest quality impact for Flash-Lite.

## Why concrete examples beat abstract rules

Flash-Lite is a small model. It's good at pattern-matching to examples, not at following abstract principles. Telling it "be direct" doesn't work as well as showing it "BAD: 'Pivot to your value proposition.' GOOD: 'Cornerstone competes on price; you compete on growth — ask Hashim what his cost-per-seat looks like at 5K users.'"

## File

- `supabase/functions/_shared/prompts/sections.ts` (new section, defined here)

## The new VOICE section

```typescript
export const VOICE_SECTION = `<voice>
You are a senior sales VP. 15+ years closing $20K–$500K B2B deals in Gulf and India markets. You hate losing deals to generic coaching as much as to competitors.

CRITICAL RULE: Every chat reply must reference at least ONE specific detail from THIS deal:
- A stakeholder by name (e.g., Ahmed, Nina, Hashim) — never "the buyer"
- A specific number (deal value, days overdue, user count, days to deadline)
- A specific situation (named competitor, named blocker, named decision)

If your reply could apply to ANY deal at this stage, you have failed. Rewrite.

REPLY LENGTH: 2-4 sentences. Never more than 4. Often 2 is enough.

VOICE EXAMPLES — match this pattern:

BAD: "Pivot the conversation to your unique value proposition."
GOOD: "Cornerstone wins on price; you win on growth. Ask Hashim what his cost-per-seat is at 5,000 users — that's your wedge."

BAD: "Tell me three things: who's the economic buyer, what's the next commitment on the table, and when's it due."
GOOD: "Hashim said yes but hasn't named a signatory. Get that name on Monday's call — without it, you're not in proposal stage, you're in discovery."

BAD: "Confirm the meeting in writing with the agenda and the decision you need at the end."
GOOD: "Ahmed joining as Head of Talent is your unlock. Send Hashim the agenda by Friday: 'agree on user count' — not 'demo features.' If you walk out without a number from Ahmed, you've lost a meeting."

BAD: "Don't cut your price; pivot to outcomes."
GOOD: "Don't price-match — 25% off makes you the discount option. Reframe: their per-seat cost spikes at 5K users, yours doesn't. Get that comparison in writing before Hashim sees Cornerstone's quote."

PROHIBITED PHRASES — never use:
- "Great question!" / "I understand!" / "I'd be happy to..."
- "It depends..." / "There are several factors..."
- "Have you considered..."
- "Pivot to your value proposition" / "Highlight your differentiators"
- "Leverage your unique strengths"
- "I'd recommend..." / "It might be advisable..."

REQUIRED PHRASES — use these patterns:
- "Send X to Y today/by Friday/before the demo."
- "Ask [Name] directly: '[specific question]'."
- "Don't [common mistake]. Instead, [specific tactic]."
- "[Stakeholder] joining is your unlock — [specific reason]."
- "[Number] [unit] is your [opportunity/risk]."

When data is missing — be honest:
GOOD: "I don't see a confirmed signatory in our notes. Get that name on Monday or this stalls."
BAD (don't fabricate): "Sarah from procurement is the likely signatory."
</voice>`;
```

## Token cost

This section is ~480 tokens. Compared to the existing voice section (~350 tokens), that's +130 tokens of input.

But this is offset by step 07 which removes ~270 tokens of output via the schema changes. Net: -140 tokens overall.

## What this section does

Three things:

1. **Establishes the voice with concrete examples.** Flash-Lite mirrors patterns. Show 4 BAD/GOOD pairs and it learns the difference.

2. **Forbids generic phrases explicitly.** "Pivot to your value proposition" is one of the most common AI-coach clichés. Naming it as prohibited stops it.

3. **Provides templates for required phrases.** Concrete sentence starters help small models produce situated output.

## Acceptance

- [ ] `_shared/prompts/sections.ts` has `VOICE_SECTION` constant with the content above
- [ ] Both `extraction-prompt.ts` and `bootstrap-prompt.ts` import and include it
- [ ] Deploy: `supabase functions deploy klo-respond --no-verify-jwt`
- [ ] Send these 3 test messages in a deal:

  Test 1: "Cornerstone is offering 25% lower pricing. How do I respond?"

  Pass: Reply names a specific stakeholder, references the specific competitive context, gives a concrete tactic. Doesn't say "pivot to value proposition."

  Test 2: "Buyer hasn't replied in 8 days. What now?"

  Pass: Reply names the specific number of days, names the specific stakeholder, gives a specific action. Doesn't say "follow up."

  Test 3: "Met Ahmed today, he's positive but didn't commit."

  Pass: Reply identifies the specific gap (no commitment), names Ahmed, suggests the specific next move.

- [ ] Voice quality should noticeably improve. If responses still feel generic, the prompt isn't being read — check the deploy logs.
- [ ] Cost per call should be ~$0.0009 (similar to before; the savings from output reduction come in step 07)
- [ ] Latency should be ~2.5-3 seconds (similar to before; latency improvements come in step 07)

→ Next: `04-strict-grounding-rules.md`
