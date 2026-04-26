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
