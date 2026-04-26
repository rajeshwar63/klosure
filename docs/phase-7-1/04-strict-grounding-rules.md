# Step 04 — Strict grounding rules

**Sprint:** B
**Goal:** Prevent Klo from inventing facts — names, roles, dates, budgets, decisions — that aren't explicitly stated in the chat or deal context.

## Why this matters

Flash-Lite (and small models in general) tend to "fill gaps helpfully." Asked about a signatory, they may infer "probably the CFO" without the seller having said anything about a CFO. In B2B sales, a hallucinated stakeholder is worse than no stakeholder — the seller may waste time pursuing the wrong person.

This is the single biggest reliability risk with Flash-Lite. The grounding section is the mitigation.

## File

- `supabase/functions/_shared/prompts/sections.ts` — add `GROUNDING_SECTION`

## The new GROUNDING section

```typescript
export const GROUNDING_SECTION = `<grounding>
ZERO TOLERANCE FOR HALLUCINATED FACTS.

If something is not explicitly stated in the chat or deal context, mark it as null/unknown. Never infer.

Specifically:

PEOPLE
- Only extract a person if they were named in chat or deal context
- Their role is what was stated, NOT what's typical for someone with that name
- If their company is unstated, leave company as null
- If their role is unstated, leave role as "unknown — mentioned by [who mentioned them]"

SIGNATORY
- Only mark someone as the signatory if it was explicitly stated
- "VP of People said yes" does NOT mean VP of People is the signatory
- If signatory is unknown, the blocker "Signatory not yet identified" must be in blockers[]

BUDGET / DEAL VALUE
- Only set deal_value.amount if a specific number was stated
- If discussed in ranges ("around $30-50k"), set amount to the lower number with confidence: 'tentative'
- "It will probably be approved" does NOT mean budget is approved — it remains tentative

DATES
- Only set deadline.date if a specific date was stated or strongly implied ("Q3 launch")
- "Soon" is not a date. Mark as null and add an open_question: "Confirm specific deadline"
- "Next week" with no anchor message timestamp is ambiguous — resolve relative to today_date or mark tentative

COMPETITORS
- Only list competitors that were named ("they're also looking at Cornerstone")
- "Evaluating other options" without naming specifics → add to open_questions, not blockers

DECISIONS
- A "decision" is something the buyer or seller has firmly committed to
- "We're leaning toward X" is NOT a decision — it's a signal
- "Y will go ahead" is NOT a decision unless the speaker has authority to commit

FORBIDDEN INFERENCES
Do NOT infer:
- Seniority from a name (e.g., "Khalid" is not automatically senior)
- Budget from company size (don't assume a bank has unlimited budget)
- Approval from interest (interest ≠ approval)
- Authority from title (a "VP" might not be the buyer)

When you're tempted to infer, instead add an entry to open_questions or blockers. That's the right place for "things we don't yet know."
</grounding>`;
```

## How this interacts with the voice section

Step 03's voice section says "every reply must reference a specific detail." This grounding section says "only use details that are actually stated."

Together: Klo is required to be specific AND honest. If there's no specific detail to reference, the reply must explicitly say "we don't know X yet — find out by asking Y."

## Token cost

~280 tokens. Replaces ~150 tokens of existing similar guidance. Net: +130 tokens input.

## Acceptance

- [ ] `GROUNDING_SECTION` added to `sections.ts`
- [ ] Imported into both extraction and bootstrap prompts
- [ ] Deploy
- [ ] Send these test messages in a fresh deal:

  Test 1: "Met Hashim from Noor Bank. He's interested but I'm not sure who signs."

  Pass: people[] contains only Hashim with stated role. blockers[] contains "Signatory not yet identified." Klo's reply acknowledges the signatory gap directly.

  Fail: people[] invents a CFO or "likely signatory." Klo's reply assumes someone is the signatory without evidence.

  Test 2: "They mentioned budget but didn't say how much."

  Pass: deal_value.amount remains null. open_questions[] contains "Confirm specific budget amount."

  Fail: deal_value.amount is filled in with a guess.

  Test 3: "Called Khalid — he's the head of something."

  Pass: people[] contains Khalid with role "unknown — mentioned by [seller name]" or similar. Doesn't invent a department.

  Fail: people[] gives Khalid a specific senior role.

- [ ] Cost per call should remain ~$0.0009
- [ ] Latency should remain ~2.5-3 seconds

→ Next: `05-confidence-hard-stops.md`
