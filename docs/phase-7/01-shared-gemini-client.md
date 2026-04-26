# Step 01 — Shared Gemini client + abstraction layer

**Sprint:** A
**Goal:** A new shared module (`_shared/llm-client.ts`) that becomes the single point where the AI provider is chosen. Every Edge Function calls through this layer instead of directly invoking the Anthropic API.

This abstraction is the rollback insurance — if Gemini quality is bad, switching back to Claude is a one-line config change.

## Files

- `supabase/functions/_shared/llm-client.ts` — new
- `supabase/functions/_shared/llm-types.ts` — new (shared types)

## Environment variables

Add these to Supabase secrets (you've already added the API key):

```
GEMINI_API_KEY=<already set>
USE_GEMINI=true                                  # toggle: true/false
KLO_MODEL_GEMINI=gemini-3.1-flash-lite-preview   # the active Gemini model
KLO_MODEL_ANTHROPIC=claude-sonnet-4-5            # fallback if USE_GEMINI=false
```

We keep `KLO_MODEL_ANTHROPIC` as the rollback target. `KLO_MODEL` (the existing var) stays for backward compatibility but the new code reads the provider-specific vars.

## llm-types.ts

```typescript
// supabase/functions/_shared/llm-types.ts

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface LlmCallOptions {
  systemPrompt: string;
  messages: LlmMessage[];
  tool?: LlmToolDefinition;        // if set, model must call this tool
  maxTokens?: number;
  temperature?: number;
  model?: string;                  // override the env-default model
}

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmToolCallResult<T = unknown> {
  toolCalled: true;
  toolName: string;
  input: T;                        // the parsed structured output
  rawResponse: unknown;            // full provider response for debugging
}

export interface LlmTextResult {
  toolCalled: false;
  text: string;                    // free-text response
  rawResponse: unknown;
}

export type LlmResult<T = unknown> = LlmToolCallResult<T> | LlmTextResult;
```

## llm-client.ts

```typescript
// supabase/functions/_shared/llm-client.ts

import { LlmCallOptions, LlmResult } from './llm-types.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const USE_GEMINI = (Deno.env.get('USE_GEMINI') ?? 'true').toLowerCase() === 'true';
const DEFAULT_MODEL_GEMINI = Deno.env.get('KLO_MODEL_GEMINI') ?? 'gemini-3.1-flash-lite-preview';
const DEFAULT_MODEL_ANTHROPIC = Deno.env.get('KLO_MODEL_ANTHROPIC') ?? 'claude-sonnet-4-5';

export async function callLlm<T = unknown>(options: LlmCallOptions): Promise<LlmResult<T>> {
  if (USE_GEMINI) {
    return callGemini<T>(options);
  } else {
    return callAnthropic<T>(options);
  }
}

// ============================================================
// GEMINI IMPLEMENTATION
// ============================================================

async function callGemini<T>(options: LlmCallOptions): Promise<LlmResult<T>> {
  const model = options.model ?? DEFAULT_MODEL_GEMINI;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const body: any = {
    systemInstruction: {
      parts: [{ text: options.systemPrompt }]
    },
    contents: options.messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    generationConfig: {
      maxOutputTokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
    }
  };

  if (options.tool) {
    body.tools = [{
      functionDeclarations: [{
        name: options.tool.name,
        description: options.tool.description,
        parameters: convertSchemaToGemini(options.tool.parameters)
      }]
    }];
    body.toolConfig = {
      functionCallingConfig: {
        mode: 'ANY',                 // force the model to call a function
        allowedFunctionNames: [options.tool.name]
      }
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errorText}`);
  }

  const data = await res.json();

  // Gemini returns candidates[0].content.parts[]; each part is either text or functionCall
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const functionCallPart = parts.find((p: any) => p.functionCall);

  if (functionCallPart) {
    return {
      toolCalled: true,
      toolName: functionCallPart.functionCall.name,
      input: functionCallPart.functionCall.args as T,
      rawResponse: data
    };
  }

  const textPart = parts.find((p: any) => p.text);
  return {
    toolCalled: false,
    text: textPart?.text ?? '',
    rawResponse: data
  };
}

// Anthropic and Gemini have slightly different schema conventions.
// Anthropic uses standard JSON Schema. Gemini uses a subset with some quirks:
// - "type" field uses lowercase strings ("string", "object", etc.) — same as JSON Schema
// - Gemini does NOT support tuples / type unions like ["string", "null"]
//   We translate ["string", "null"] -> { type: "string", nullable: true }
// - Gemini supports the "format" field for some types (e.g., "format": "date-time")
function convertSchemaToGemini(schema: any): any {
  if (Array.isArray(schema)) {
    return schema.map(convertSchemaToGemini);
  }
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  const out: any = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && Array.isArray(value)) {
      // Convert ["string", "null"] -> { type: "string", nullable: true }
      const nonNullTypes = value.filter(t => t !== 'null');
      if (nonNullTypes.length === 1) {
        out.type = nonNullTypes[0];
        if (value.includes('null')) {
          out.nullable = true;
        }
      } else {
        // Multiple non-null types — Gemini doesn't fully support this; pick first
        out.type = nonNullTypes[0] ?? 'string';
        if (value.includes('null')) out.nullable = true;
      }
    } else if (typeof value === 'object' && value !== null) {
      out[key] = convertSchemaToGemini(value);
    } else {
      out[key] = value;
    }
  }

  return out;
}

// ============================================================
// ANTHROPIC IMPLEMENTATION (rollback path)
// ============================================================

async function callAnthropic<T>(options: LlmCallOptions): Promise<LlmResult<T>> {
  const model = options.model ?? DEFAULT_MODEL_ANTHROPIC;

  const body: any = {
    model,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    system: options.systemPrompt,
    messages: options.messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  };

  if (options.tool) {
    body.tools = [{
      name: options.tool.name,
      description: options.tool.description,
      input_schema: options.tool.parameters
    }];
    body.tool_choice = { type: 'tool', name: options.tool.name };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errorText}`);
  }

  const data = await res.json();

  if (options.tool) {
    const toolUse = data.content?.find((b: any) => b.type === 'tool_use');
    if (!toolUse) {
      throw new Error(`No tool_use in Anthropic response. Got: ${JSON.stringify(data.content)}`);
    }
    return {
      toolCalled: true,
      toolName: toolUse.name,
      input: toolUse.input as T,
      rawResponse: data
    };
  }

  const textBlock = data.content?.find((b: any) => b.type === 'text');
  return {
    toolCalled: false,
    text: textBlock?.text ?? '',
    rawResponse: data
  };
}
```

## Behavior

The abstraction returns the same shape regardless of provider:

- **For tool calls:** `{ toolCalled: true, toolName, input, rawResponse }` — the `input` is the parsed structured object, ready to use.
- **For text responses:** `{ toolCalled: false, text, rawResponse }` — `text` is the model's free-text reply.

Edge functions call this and don't care which provider runs.

## Schema translation

The `convertSchemaToGemini` function handles the main syntactic difference: Anthropic accepts `type: ["string", "null"]` for nullable fields; Gemini wants `{ type: "string", nullable: true }`. The function recursively walks schemas and rewrites them.

A few schema features won't translate perfectly:
- Anthropic's `oneOf` / `anyOf` — Gemini doesn't fully support these. If a tool schema uses these heavily, that part of the migration may need manual adjustment.

For Klosure's existing schemas, we don't use `oneOf`/`anyOf` — every schema is a flat structure of typed fields. Translation should be clean.

## What this step delivers

After step 01:

- The shared module exists and exports `callLlm`
- `USE_GEMINI=true` is set
- The module is importable but nothing calls it yet
- All existing functions still work (they're calling Anthropic directly, ignoring this new module)

The migration of each function happens in steps 02-07.

## Acceptance

- [ ] File `supabase/functions/_shared/llm-client.ts` exists
- [ ] File `supabase/functions/_shared/llm-types.ts` exists
- [ ] Code compiles without errors
- [ ] Build output of `supabase functions deploy klo-respond --no-verify-jwt` (no functional change to klo-respond yet — just confirming nothing broke)
- [ ] Env vars set: `USE_GEMINI=true`, `KLO_MODEL_GEMINI=gemini-3.1-flash-lite-preview`, `KLO_MODEL_ANTHROPIC=claude-sonnet-4-5`

→ Next: `02-klo-respond-tool-schema.md`
