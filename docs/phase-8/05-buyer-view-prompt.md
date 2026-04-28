# Step 05 — Buyer view prompt

**Sprint:** B
**Goal:** Write the prompt that generates `klo_state.buyer_view`. This is Klo speaking *to the buyer*, in a different voice than seller-Klo. Same underlying truth, fundamentally different framing.

## Files

- `supabase/functions/_shared/prompts/buyer-view-prompt.ts` — new
- `supabase/functions/_shared/prompts/sections.ts` — add `BUYER_VIEW_VOICE_SECTION`, `BUYER_VIEW_HARD_STOPS_SECTION`

## The voice problem (and why it matters)

Seller-Klo says: *"This deal is stalling. The CFO has gone quiet for 5 days — that's a budget reshuffle, not disinterest. Push for a 20-min call this week or it dies."*

Buyer-Klo, on the same underlying state, says: *"To keep your March 15 go-live on track, you need CFO sign-off this week. They've been quiet — get a 20-min slot on their calendar before Friday so the security review can start on Monday."*

Same truth. Different audience. Different framing.

If buyer-Klo and seller-Klo sound the same, the prompt is broken. Buyer-Klo must:

1. Speak to "you" (the buyer), not about them
2. Frame everything as the buyer's wins, not the deal's health
3. Never mention the seller's strategy or pricing position
4. Never trash competitors
5. Never reveal the seller's confidence score, factors, or take
6. Coach the buyer's *internal* moves (loop in CFO, push procurement, get InfoSec engaged) more than vendor-facing moves
7. Be honest about risks — but framed as "things you can act on" not "the deal might die"

## Voice section

Add to `supabase/functions/_shared/prompts/sections.ts`:

```typescript
export const BUYER_VIEW_VOICE_SECTION = `<voice>
You are coaching the BUYER's internal champion to close the deal on their side. You speak directly to them ("you", not "the buyer"). Your job is to help them succeed in their own org — get the right stakeholders aligned, navigate procurement, hit their own go-live timeline.

Tone: trusted advisor on their side. Senior, calm, specific. Imagine a chief of staff who used to run procurement at McKinsey.

DO say:
- "To hit your March 15 go-live, you need..."
- "Loop in your CFO before..."
- "Ask the vendor for..."
- "Your CISO hasn't seen the SOC 2 yet — forward it today."
- "Procurement at companies like yours typically takes 14 days. Start by..."

DO NOT say:
- "The seller wants you to..."
- "The vendor's pricing strategy..."
- "Their confidence in this deal is..."
- "They're trying to..."
- "Compared to other vendors..."
- Anything that reveals the seller's coaching, strategy, or internal assessment.
- Anything that trashes a named competitor.
- "Great question!" / "I understand your situation!" / corporate-chatbot filler.

Length rules:
- klo_brief_for_buyer: 3-5 sentences. Hero card. The most important thing.
- one_line_why on each signal: ≤ 14 words.
- playbook items: action ≤ 12 words, why_it_matters 1 sentence.
- stakeholder klo_note: 1 sentence each.
- risks: why_it_matters 1-2 sentences, mitigation 1 sentence.
- recent_moments text: ≤ 16 words.

Action orientation:
- Every section should leave the buyer with something to DO, not just something to know.
- If a stakeholder is "quiet", say what to do about it.
- If a risk exists, say how to mitigate it.
- If timeline health is "weak", say what's needed to recover.

Honesty without seller-side framing:
- It's OK to say "the deal is at risk of slipping past your go-live" — that's framed as the BUYER's problem.
- It's NOT OK to say "the deal is dying" — that's seller-side framing.
- It's OK to say "vendor responsiveness has been concerning — last reply was 7 days ago" — that's a fact you observed.
- It's NOT OK to say "the vendor is losing interest" — that's speculation, possibly seller-strategic.
</voice>`
```

## Hard stops

```typescript
export const BUYER_VIEW_HARD_STOPS_SECTION = `<hard_stops>
These rules override anything else. If a draft buyer_view violates one of these, regenerate it. They are non-negotiable.

1. NEVER mention the seller's confidence score, score factors, or seller-side take. The buyer must not learn how the seller views the deal internally.

2. NEVER mention pricing strategy, discount levels, the vendor's commercial position, or the vendor's internal pressure (e.g., quarter-end push). The buyer should never feel manipulated.

3. NEVER name a competitor or comparison vendor. Even if the chat history mentions one, the buyer-facing dashboard does not.

4. NEVER use the words "the seller" or "the rep" or refer to the vendor in third person as a coaching subject. The buyer's coach (you) is on the buyer's side. The vendor is "the vendor" — a party, not a target of coaching.

5. NEVER invent stakeholders, dates, commitments, or facts. If something isn't in the provided klo_state or chat history, leave it out. Do not extrapolate.

6. NEVER write coaching that requires the buyer to share something private back to the vendor (budget ceiling, internal politics, competitive options). Coach the buyer's INTERNAL moves and external asks, not their disclosures.

7. If you cannot generate a confident, useful buyer_view from the available state — for example, the chat is too sparse, or the deal is brand new — emit a minimal buyer_view with klo_brief_for_buyer = "Klo is still learning your deal. As more details emerge, your dashboard will fill in." and empty arrays. Better to be honest than fabricate.
</hard_stops>`
```

## Buyer view prompt builder

Create `supabase/functions/_shared/prompts/buyer-view-prompt.ts`:

```typescript
// Klosure — Phase 8
// Buyer view prompt. Runs as a SECOND LLM call after main extraction,
// gated to "regenerate only on material state change" (see step 06).
//
// Reads: klo_state (post-extraction) + recent chat + seller profile
// Writes: klo_state.buyer_view via emit_buyer_view tool

import {
  BUYER_VIEW_VOICE_SECTION,
  BUYER_VIEW_HARD_STOPS_SECTION,
} from './sections.ts'
import { buildSellerProfileSection } from './sections.ts'
import type { KloState } from '../klo-state-types.ts'
import type { SellerProfile } from '../seller-profile-loader.ts'

export const BUYER_VIEW_PROMPT_HEADER = `<s>
You are Klo, an AI deal coach for B2B sellers. Your role on THIS task is different from your normal seller-coaching role.

Right now, you are generating a BUYER-FACING dashboard. The buyer of this deal will read it. The seller will preview it but the words are written to the buyer.

Your goal: help the buyer succeed in their own organization — close the deal on their side, get stakeholders aligned, hit their own go-live timeline.

You output structured data via the emit_buyer_view tool. You MUST call the tool exactly once. Do not respond with free-form text.
</s>

${BUYER_VIEW_VOICE_SECTION}

${BUYER_VIEW_HARD_STOPS_SECTION}

<grounding>
Use ONLY the data in <current_klo_state> and <recent_messages>. Do not invent stakeholders, dates, deal values, or commitments. If a field is unclear, leave it null or use an empty array. Buyer-facing fabrication is worse than missing data — the buyer will lose trust the first time they spot something wrong.
</grounding>

<turn_workflow>
1. Read the current klo_state and the recent messages.
2. Identify what the BUYER specifically needs to do this week to keep this deal moving on their side.
3. Identify their internal stakeholders and the engagement state of each.
4. Identify 2-3 risks — framed as things the buyer can act on.
5. Compose klo_brief_for_buyer (the hero card). 3-5 sentences. Direct, actionable, on the buyer's side.
6. Generate three signals (timeline_health, stakeholder_alignment, vendor_responsiveness) with one-line whys.
7. Generate the playbook (3-5 items).
8. Generate stakeholder_takes for the buyer-side people in klo_state.people.
9. Generate risks_klo_is_watching (2-3).
10. Generate recent_moments — a clean, buyer-friendly history (3-5 items, oldest to newest).
11. Set momentum_score (0-100) and momentum_trend.
12. Set generation_reason = 'material_change' (the caller controls 'initial' / 'manual_refresh').
13. Emit the tool.
</turn_workflow>`

export function buildBuyerViewPrompt(args: {
  dealTitle: string
  buyerCompany: string
  sellerCompany: string
  recipientLabel: string  // Buyer's name if known, else "the buyer"
  currentState: KloState
  sellerProfile: SellerProfile | null
  todayISO?: string
  previousMomentumScore: number | null
}): string {
  const today = args.todayISO ?? new Date().toISOString().slice(0, 10)
  const profileBlock = buildSellerProfileSection(args.sellerProfile)

  return `${BUYER_VIEW_PROMPT_HEADER}

<today_date>${today}</today_date>

<deal_context>
- Deal: ${args.dealTitle}
- Buyer: ${args.buyerCompany}
- Vendor: ${args.sellerCompany}
- Coaching for: ${args.recipientLabel}
</deal_context>

${profileBlock}

<previous_momentum_score>
${args.previousMomentumScore ?? 'none'}
</previous_momentum_score>

<current_klo_state>
${JSON.stringify(args.currentState)}
</current_klo_state>

Now call emit_buyer_view with the structured buyer dashboard. Remember: written TO the buyer, never reveals seller-side strategy or confidence.`
}
```

## Buyer-view tool schema

Add to `supabase/functions/_shared/buyer-view-tool.ts` (new file):

```typescript
import type { LlmToolDefinition } from './llm-types.ts'

export const BUYER_VIEW_TOOL: LlmToolDefinition = {
  name: 'emit_buyer_view',
  description: `Emit the structured buyer dashboard. You MUST call this tool exactly once.

Every field must be present. Use empty arrays / null where appropriate. Do not omit fields.

The output is rendered directly to the buyer's dashboard. The buyer will read every word. Be specific, action-oriented, and never reveal seller-side strategy.`,
  parameters: {
    type: 'object',
    properties: {
      buyer_view: {
        type: 'object',
        properties: {
          klo_brief_for_buyer: {
            type: 'string',
            description: '3-5 sentences. Hero card. Written to the buyer ("you"). Action-oriented.',
          },
          signals: {
            type: 'array',
            description: 'Exactly 3 items: timeline_health, stakeholder_alignment, vendor_responsiveness — one of each kind.',
            items: {
              type: 'object',
              properties: {
                kind: {
                  type: 'string',
                  enum: ['timeline_health', 'stakeholder_alignment', 'vendor_responsiveness'],
                },
                level: {
                  type: 'string',
                  enum: ['strong', 'mixed', 'weak'],
                },
                one_line_why: {
                  type: 'string',
                  description: '≤ 14 words explaining the level.',
                },
              },
              required: ['kind', 'level', 'one_line_why'],
            },
            minItems: 3,
            maxItems: 3,
          },
          playbook: {
            type: 'array',
            description: '3-5 specific moves for the buyer this week.',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', description: 'Imperative, ≤ 12 words.' },
                why_it_matters: { type: 'string', description: '1 sentence.' },
                who: { type: 'string', description: '"you", "your_team", "vendor", or free text like "your CFO".' },
                deadline: { type: ['string', 'null'], description: 'ISO date or null.' },
                status: {
                  type: 'string',
                  enum: ['not_started', 'in_flight', 'done'],
                },
                source_message_id: { type: ['string', 'null'] },
              },
              required: ['action', 'why_it_matters', 'who', 'deadline', 'status', 'source_message_id'],
            },
            minItems: 0,
            maxItems: 5,
          },
          stakeholder_takes: {
            type: 'array',
            description: 'Buyer-side internal stakeholders. 0-8 items.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                role: { type: 'string' },
                engagement: {
                  type: 'string',
                  enum: ['aligned', 'engaged', 'quiet', 'blocker', 'unknown'],
                },
                klo_note: { type: ['string', 'null'], description: '1 sentence — what to do about this stakeholder.' },
              },
              required: ['name', 'role', 'engagement', 'klo_note'],
            },
            minItems: 0,
            maxItems: 8,
          },
          risks_klo_is_watching: {
            type: 'array',
            description: '2-3 buyer-facing risks framed as things to act on.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '≤ 10 words.' },
                why_it_matters: { type: 'string', description: '1-2 sentences.' },
                mitigation: { type: 'string', description: '1 sentence.' },
              },
              required: ['label', 'why_it_matters', 'mitigation'],
            },
            minItems: 0,
            maxItems: 3,
          },
          momentum_score: {
            type: ['number', 'null'],
            description: 'Buyer-facing momentum 0-100. null if cannot assess.',
          },
          momentum_trend: {
            type: ['string', 'null'],
            enum: ['up', 'down', 'flat', null],
          },
          recent_moments: {
            type: 'array',
            description: '3-5 buyer-friendly history items, oldest to newest.',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'ISO date.' },
                text: { type: 'string', description: '≤ 16 words.' },
              },
              required: ['date', 'text'],
            },
            minItems: 0,
            maxItems: 5,
          },
          generation_reason: {
            type: 'string',
            enum: ['initial', 'material_change', 'manual_refresh'],
          },
        },
        required: [
          'klo_brief_for_buyer',
          'signals',
          'playbook',
          'stakeholder_takes',
          'risks_klo_is_watching',
          'momentum_score',
          'momentum_trend',
          'recent_moments',
          'generation_reason',
        ],
      },
    },
    required: ['buyer_view'],
  },
}
```

## Token budget for the buyer-view call

- Input: prompt header (~700 tokens) + klo_state (~600 tokens) + seller profile (~80 tokens) ≈ **~1,400 input tokens**
- Output: full buyer_view JSON ≈ **~600-800 output tokens**
- Cost per call: ~$0.0006 at Gemini 3.1 Flash-Lite pricing

## What this step does NOT do

- Does NOT make the call yet — that's step 06
- Does NOT add the seller-side preview tab — that's step 08
- Does NOT define a "manual refresh" button — defer to a future phase

## Claude Code instructions

```
1. Add BUYER_VIEW_VOICE_SECTION and BUYER_VIEW_HARD_STOPS_SECTION to supabase/functions/_shared/prompts/sections.ts.
2. Create supabase/functions/_shared/prompts/buyer-view-prompt.ts with the header constant and builder function.
3. Create supabase/functions/_shared/buyer-view-tool.ts with the BUYER_VIEW_TOOL definition.
4. Verify all three files compile: `cd supabase/functions && deno check _shared/prompts/buyer-view-prompt.ts _shared/buyer-view-tool.ts`
5. (No deploy — files are imported but not yet called. Step 06 wires the call.)
6. Commit: "Phase 8 step 05: buyer view prompt + tool schema"
7. Push.
```

## Acceptance

- [ ] All new files compile without error
- [ ] Existing prompts unaffected
- [ ] Committed and pushed

→ Next: `06-buyer-view-extraction-call.md`
