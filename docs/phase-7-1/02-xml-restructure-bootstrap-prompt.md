# Step 02 — XML restructure of bootstrap-prompt.ts

**Sprint:** A
**Goal:** Apply the same XML restructure to the bootstrap prompt (used for first-time deals with no prior klo_state).

## File

- `supabase/functions/_shared/prompts/bootstrap-prompt.ts`

## Difference from extraction-prompt

The bootstrap prompt does the SAME job as extraction-prompt EXCEPT it has no prior `klo_state` to merge into — it's building the initial state from scratch. The structure should be near-identical.

```typescript
export const BOOTSTRAP_PROMPT_HEADER = `
<s>
You are Klo, an AI sales coach for B2B sellers in the Gulf and India. You speak like a senior sales VP with 15+ years closing deals at this size — direct, specific, allergic to generic advice.

This deal is new — there is no prior klo_state. Build the initial state from scratch using the deal context and any chat history. You output a chat reply AND an initial klo_state via the emit_klo_response tool. You MUST call the tool exactly once.
</s>

<voice>
[same voice section as extraction-prompt — share via constant]
</voice>

<output_requirements>
[same as extraction-prompt — share via constant]
</output_requirements>

<extraction_rules>
[same as extraction-prompt]
</extraction_rules>

<grounding>
[same as extraction-prompt]
</grounding>

<confidence_hard_stops>
[same as extraction-prompt]
</confidence_hard_stops>

<momentum_rules>
[same as extraction-prompt]
</momentum_rules>
`;

export function buildBootstrapPrompt(args: {
  dealContext: string;
  chatHistory: string;
  latestMessage: string;
  todayDate: string;
}): string {
  return `${BOOTSTRAP_PROMPT_HEADER}

<today_date>${args.todayDate}</today_date>

<deal_context>
${args.dealContext}
</deal_context>

<chat_history>
${args.chatHistory}
</chat_history>

<latest_message>
${args.latestMessage}
</latest_message>

Now call emit_klo_response. Build the initial klo_state from scratch.`;
}
```

## Share content via constants

Both prompts share `<voice>`, `<output_requirements>`, `<extraction_rules>`, `<grounding>`, `<confidence_hard_stops>`, and `<momentum_rules>`. To avoid drift, define them once and reuse:

```typescript
// In _shared/prompts/sections.ts (new file)
export const VOICE_SECTION = `<voice>...</voice>`;
export const OUTPUT_REQUIREMENTS_SECTION = `<output_requirements>...</output_requirements>`;
export const GROUNDING_SECTION = `<grounding>...</grounding>`;
export const HARD_STOPS_SECTION = `<confidence_hard_stops>...</confidence_hard_stops>`;
export const MOMENTUM_SECTION = `<momentum_rules>...</momentum_rules>`;
```

Then both `extraction-prompt.ts` and `bootstrap-prompt.ts` import these. One source of truth, no drift.

## What this step does NOT do

Same as step 01 — just structural. Content of voice/grounding/etc. comes in later steps.

## Token impact

Negligible. Same as step 01.

## Acceptance

- [ ] `bootstrap-prompt.ts` exports `BOOTSTRAP_PROMPT_HEADER` and `buildBootstrapPrompt`
- [ ] New file `_shared/prompts/sections.ts` exports shared section constants
- [ ] Both prompts import shared sections (no copy-paste)
- [ ] `klo-respond/index.ts` calls the right function based on whether klo_state exists
- [ ] Deploy and verify: create a brand-new deal, send first message, verify Klo bootstraps the klo_state correctly

→ Next: `03-senior-vp-voice-section.md`
