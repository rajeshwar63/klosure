# Step 01 — XML restructure of extraction-prompt.ts

**Sprint:** A
**Goal:** Replace prose-style sections with XML-tagged structure. Move all static content (rules, voice, schema) to the top. Move dynamic content (deal context, latest message) to the bottom.

## Why XML structure

Gemini 3.1 Flash-Lite's attention mechanism is significantly more reliable when section boundaries are explicit. Prose-style section headers like "## Voice" are ambiguous to the model — it processes them as "another paragraph of text." XML tags like `<voice>...</voice>` are unambiguous structural markers.

This is also true for Claude (it just hides it better). The change improves both providers.

## File

- `supabase/functions/_shared/prompts/extraction-prompt.ts`

## Current structure (rough)

The current file likely looks like:

```typescript
export const EXTRACTION_PROMPT = `
You are Klo, an AI sales coach...

## Voice
[voice rules]

## Output Requirements
[fields list]

## Tool Usage
[when to call the tool]

[deal context inserted here]
[latest message]
`;
```

## New structure

```typescript
export const EXTRACTION_PROMPT_HEADER = `
<system>
You are Klo, an AI sales coach for B2B sellers in the Gulf and India. You speak like a senior sales VP with 15+ years closing deals at this size — direct, specific, allergic to generic advice.

You receive a deal record (klo_state), the chat history, and the user's latest message. You output a chat reply AND an updated klo_state via the emit_klo_response tool. You MUST call the tool exactly once. Do not respond with free-form text.
</system>

<voice>
[voice section — see step 03]
</voice>

<output_requirements>
Every field in klo_state must be present in your output. Use null for object fields with no data. Use [] for array fields with no items. Never omit a field.

Required fields:
- summary: string or null
- stage: string (one of: lead, discovery, proposal, negotiation, legal, closed_won, closed_lost)
- deal_value: object {amount, currency, confidence} or null
- deadline: object {date, confidence} or null
- people: array (use [] if empty)
- decisions: array
- blockers: array
- open_questions: array
- confidence: object {value, trend, delta, factors_dragging_down, factors_to_raise, rationale} or null only if no information at all
- klo_take_seller: string (max 240 chars) or null
- klo_take_buyer: string (max 180 chars) or null — only populate if buyer has joined this deal
- next_meeting: object or null
- last_meeting: object or null
</output_requirements>

<extraction_rules>
[full extraction rules — included via concatenation with extraction-rules-text.ts]
</extraction_rules>

<grounding>
[strict grounding section — see step 04]
</grounding>

<confidence_hard_stops>
[hard stops matrix — see step 05]
</confidence_hard_stops>

<momentum_rules>
[momentum decay — see step 06]
</momentum_rules>
`;

// The dynamic context appended per-call:
export function buildExtractionPrompt(args: {
  dealContext: string;
  kloState: string;
  chatHistory: string;
  latestMessage: string;
  todayDate: string;
}): string {
  return `${EXTRACTION_PROMPT_HEADER}

<today_date>${args.todayDate}</today_date>

<deal_context>
${args.dealContext}
</deal_context>

<current_klo_state>
${args.kloState}
</current_klo_state>

<chat_history>
${args.chatHistory}
</chat_history>

<latest_message>
${args.latestMessage}
</latest_message>

Now call emit_klo_response with the updated klo_state and your reply.`;
}
```

## What changed structurally

1. **Static header is now a separate constant.** This enables future caching (Phase 8) when Gemini's context caching API is wired up. For now, it just makes the structure clear.

2. **All sections are XML-wrapped.** `<voice>`, `<output_requirements>`, `<extraction_rules>`, etc. The model can clearly distinguish "rules" from "data."

3. **Dynamic content at the bottom.** `<today_date>`, `<deal_context>`, `<current_klo_state>`, `<chat_history>`, `<latest_message>` — all variable per-call, all appended after the static rules.

4. **Final instruction is one line.** "Now call emit_klo_response..." — short, direct, unambiguous.

## What this step does NOT do

This step is purely a structural reshuffle. The actual content of `<voice>`, `<grounding>`, `<confidence_hard_stops>`, `<momentum_rules>` is updated in steps 03-06.

For step 01, just put placeholders for those sections (e.g. `[voice section — see step 03]`) and keep existing content for what's not yet rewritten.

## Token impact

This step alone adds ~50 tokens (XML tag overhead) but removes ~30 tokens (cleaner header). Net: +20 tokens. Negligible.

## Acceptance

- [ ] `extraction-prompt.ts` exports `EXTRACTION_PROMPT_HEADER` constant and `buildExtractionPrompt` function
- [ ] All sections wrapped in `<tag>...</tag>` style XML
- [ ] Dynamic content (deal_context, klo_state, chat_history, latest_message, today_date) is at the bottom of the assembled prompt
- [ ] `klo-respond/index.ts` updated to call `buildExtractionPrompt` instead of the old assembly function
- [ ] Deploy: `supabase functions deploy klo-respond --no-verify-jwt`
- [ ] Send one test message — verify Klo still responds and klo_state still extracts (no quality regression yet, just structural change)
- [ ] Check logs: token counts should be ~5,400 input, ~1,000 output (similar to before)

→ Next: `02-xml-restructure-bootstrap-prompt.md`
