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
