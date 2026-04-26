# Step 02 — klo-respond tool schema translation

**Sprint:** B
**Goal:** Translate the existing Anthropic `KLO_OUTPUT_TOOL` schema into a format that works with both Anthropic and Gemini through the abstraction layer from step 01. This is the largest single piece of the migration because the tool schema has nested objects, enums, and many optional fields.

## Files

- `supabase/functions/klo-respond/index.ts` — refactor to define the schema once, in a provider-neutral shape, and pass it to `callLlm`

## The current schema (Anthropic-native)

The current `KLO_OUTPUT_TOOL` constant in `klo-respond/index.ts` looks roughly like this (abbreviated):

```typescript
const KLO_OUTPUT_TOOL = {
  name: "emit_klo_response",
  description: "...",
  input_schema: {
    type: "object",
    properties: {
      reply_text: { type: "string" },
      klo_state: {
        type: "object",
        properties: {
          summary: { type: ["string", "null"] },
          stage: { type: "string", enum: ["lead", "discovery", ...] },
          deal_value: {
            type: ["object", "null"],
            properties: {
              amount: { type: ["number", "null"] },
              currency: { type: "string" },
              confidence: { type: "string", enum: ["definite", "tentative"] }
            }
          },
          deadline: { ... },
          people: { type: "array", items: { ... } },
          decisions: { type: "array", items: { ... } },
          blockers: { type: "array", items: { ... } },
          open_questions: { type: "array", items: { ... } },
          confidence: {
            type: ["object", "null"],
            properties: {
              value: { type: "number" },
              trend: { type: "string", enum: ["up", "down", "stable"] },
              delta: { type: "number" },
              factors_dragging_down: { type: "array", items: { ... } },
              factors_to_raise: { type: "array", items: { ... } },
              rationale: { type: "string" }
            }
          },
          klo_take_seller: { type: ["string", "null"] },
          klo_take_buyer: { type: ["string", "null"] },
          next_meeting: {
            type: ["object", "null"],
            properties: {
              date: { type: "string" },
              title: { type: "string" },
              with: { type: "array", items: { type: "string" } },
              confidence: { type: "string", enum: ["definite", "tentative"] },
              source_message_id: { type: ["string", "null"] }
            }
          },
          last_meeting: { ... }
        }
      }
    },
    required: ["reply_text", "klo_state"]
  }
};
```

The schema uses `type: ["string", "null"]` patterns extensively. This is valid JSON Schema, accepted by Anthropic, but Gemini wants `{ type: "string", nullable: true }`.

## What changes in step 02

Two things:

1. **Define the schema using Anthropic's syntax** (since that's what we have today and it's valid JSON Schema). The abstraction's `convertSchemaToGemini` function (from step 01) auto-translates it for Gemini calls.

2. **Convert the tool definition to the new abstraction's shape** — `LlmToolDefinition` from `_shared/llm-types.ts`.

```typescript
// supabase/functions/klo-respond/index.ts
import { LlmToolDefinition } from '../_shared/llm-types.ts';

const KLO_OUTPUT_TOOL: LlmToolDefinition = {
  name: "emit_klo_response",
  description: "Emit Klo's chat reply and the updated structured deal record.",
  parameters: {
    type: "object",
    properties: {
      reply_text: {
        type: "string",
        description: "Klo's conversational response to the new message. 2-4 sentences."
      },
      klo_state: {
        type: "object",
        properties: {
          // ... all existing properties, unchanged ...
        },
        required: [
          "summary", "stage", "people", "decisions", "blockers",
          "open_questions", "confidence", "klo_take_seller", "klo_take_buyer"
        ]
      }
    },
    required: ["reply_text", "klo_state"]
  }
};
```

The shape is identical to today's schema EXCEPT:
- Renamed: `input_schema` → `parameters` (matches the abstraction's type)
- The whole object is now typed as `LlmToolDefinition`

## Why parameters and not input_schema

Anthropic uses `input_schema`. Gemini uses `parameters`. The abstraction layer normalizes to `parameters` because Gemini will be the active provider. Inside the abstraction (step 01), when Anthropic mode is active, the parameter is mapped back to `input_schema` automatically.

## Required-field semantics

Anthropic and Gemini handle `required` arrays slightly differently:

- **Anthropic:** Fields not in `required` may be omitted entirely from the tool call.
- **Gemini:** Fields not in `required` may be omitted, BUT in practice Gemini Flash-Lite tends to omit optional fields more aggressively — sometimes too aggressively.

To get reliable Klo extraction, we want EVERY field that has actual data to come back. The fix:

**Promote optional fields to required, but allow null values.** Something like:

```typescript
{
  next_meeting: {
    type: ["object", "null"],   // ← null is explicitly allowed
    properties: { ... }
  },
  // and add "next_meeting" to the required list
}
```

This way, Klo MUST emit the field (so we know it considered it), but it's allowed to emit null when there's no meeting.

Walk through the existing schema and apply this pattern:

| Field | Current | New |
|---|---|---|
| `summary` | optional `["string", "null"]` | required, allows null |
| `deal_value` | optional `["object", "null"]` | required, allows null |
| `deadline` | optional `["object", "null"]` | required, allows null |
| `confidence` | optional `["object", "null"]` | required, allows null |
| `klo_take_seller` | optional `["string", "null"]` | required, allows null |
| `klo_take_buyer` | optional `["string", "null"]` | required, allows null |
| `next_meeting` | optional `["object", "null"]` | required, allows null |
| `last_meeting` | optional `["object", "null"]` | required, allows null |

Arrays (`people`, `decisions`, `blockers`, `open_questions`) stay required and are never null — they're empty `[]` when there's nothing.

`stage` stays required as a string enum.

## Tool description tightening

Gemini Flash-Lite responds better to explicit, detailed tool descriptions. Tighten the `description` field to be very specific:

```typescript
description: `Emit Klo's response to the user's most recent message.

You MUST call this tool exactly once. Do not return free-form text.

The reply_text is what the user sees in chat — Klo's conversational coaching reply (2-4 sentences in Klo's voice).

The klo_state is the complete structured record of this deal AFTER incorporating any new information from the user's latest message. Every field in klo_state must be present. Use null (or empty arrays) for fields that don't apply yet. Do not omit any fields.`
```

This is a small change but materially affects Flash-Lite behavior. Smaller models follow explicit instructions better than implicit conventions.

## What stays in this step's diff

This step is mechanical:
- Type the existing tool as `LlmToolDefinition`
- Move all "optional" object fields into the `required` array (they remain nullable)
- Tighten the tool description
- Don't change the actual call site yet — that's step 03

## Acceptance

- [ ] `KLO_OUTPUT_TOOL` is now typed as `LlmToolDefinition`
- [ ] All major nullable fields are in the `required` array with explicit null-type support
- [ ] Tool description is explicit about "you must call this tool"
- [ ] `klo-respond/index.ts` still compiles (the actual call site in step 03 will reference the new tool shape)
- [ ] No functional behavior change yet (`klo-respond` still calls Anthropic directly until step 03)

→ Next: `03-klo-respond-call.md`
