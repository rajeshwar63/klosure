# Step 03 — Replace klo-respond's API call

**Sprint:** B
**Goal:** Replace the direct Anthropic API call inside `klo-respond` with a call to `callLlm` from the shared abstraction. This is the moment Gemini takes over for the highest-traffic Edge Function.

## Files

- `supabase/functions/klo-respond/index.ts` — replace the existing call

## Find the current call

The current code in `klo-respond/index.ts` has a function that calls Anthropic directly. It looks roughly like:

```typescript
async function callAnthropic(systemPrompt: string, messages: any[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: KLO_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages,
      tools: [KLO_OUTPUT_TOOL],
      tool_choice: { type: 'tool', name: 'emit_klo_response' }
    })
  });
  // ... parse tool_use response, return parsed input ...
}
```

## Replace with the abstraction

Delete the local `callAnthropic` function. Replace it with one call:

```typescript
import { callLlm } from '../_shared/llm-client.ts';
import { KloResponse } from '../_shared/klo-state-types.ts';

// ... build systemPrompt and messages as before ...

const result = await callLlm<KloResponse>({
  systemPrompt,
  messages,
  tool: KLO_OUTPUT_TOOL,
  maxTokens: 4096,
  temperature: 0.7
});

if (!result.toolCalled) {
  // Gemini sometimes returns text instead of a tool call when uncertain.
  // Treat as an error so we can log + retry.
  throw new Error(`Expected tool call but got text: ${result.text.slice(0, 200)}`);
}

const kloResponse = result.input;  // typed as KloResponse
const replyText = kloResponse.reply_text;
const newKloState = kloResponse.klo_state;
```

## Add the `KloResponse` type

In `_shared/klo-state-types.ts`, add the wrapper type that matches the tool schema's outer shape:

```typescript
export interface KloResponse {
  reply_text: string;
  klo_state: KloState;
}
```

This gives `result.input` the right type so TypeScript knows what to expect.

## Handle the "text instead of tool call" case

Gemini Flash-Lite occasionally returns text instead of calling the tool. This is a known small-model behavior — it happens roughly 1-2% of the time on complex schemas, especially when the input is ambiguous (e.g., user typed gibberish).

Three handling strategies, in order of preference:

### Strategy A — Retry once with a stronger prompt

```typescript
let result = await callLlm<KloResponse>({ ... });

if (!result.toolCalled) {
  // Retry with explicit reminder
  result = await callLlm<KloResponse>({
    systemPrompt,
    messages: [
      ...messages,
      {
        role: 'user',
        content: 'You must call the emit_klo_response function. Do not respond with text.'
      }
    ],
    tool: KLO_OUTPUT_TOOL,
    maxTokens: 4096
  });
}

if (!result.toolCalled) {
  // Both attempts failed — fall through to error path
  throw new Error(`Klo failed to emit tool call after retry. Got: ${result.text.slice(0, 200)}`);
}
```

### Strategy B — Use the text response as a fallback reply

```typescript
if (!result.toolCalled) {
  // Use the text as Klo's reply but skip state extraction
  await saveMessage(replyText);
  return { reply_text: result.text, klo_state: existingState };  // unchanged state
}
```

This is more graceful for the user but loses the extraction opportunity for that turn.

### Strategy C — Combination

Try strategy A. If it fails, fall back to B.

**Recommendation: Strategy A only for Phase 7.** If retry rates climb above 5%, we add B as a safety net in Phase 8. For now, an error logged once in a while is fine.

## Logging the cost win

After the call succeeds, log the model used and approximate token counts so we can verify the cost reduction on real traffic:

```typescript
const usage = result.rawResponse?.usageMetadata;  // Gemini-specific
console.log(JSON.stringify({
  event: 'klo_respond_complete',
  model: USE_GEMINI ? KLO_MODEL_GEMINI : KLO_MODEL_ANTHROPIC,
  prompt_tokens: usage?.promptTokenCount,
  completion_tokens: usage?.candidatesTokenCount,
  cached_tokens: usage?.cachedContentTokenCount,
  deal_id: dealId
}));
```

This goes into Supabase logs and lets us compare per-call cost before/after.

## What about the Anthropic prompt cache?

Anthropic supports prompt caching (`cache_control: { type: 'ephemeral' }`) on the system prompt — Phase 4.5 set this up. When `USE_GEMINI=true`, we don't use that mechanism (Gemini has its own caching, not configured in Phase 7).

In the abstraction's Anthropic path, the `cache_control` flag is currently NOT being passed because step 01's `callAnthropic` doesn't include it. If we ever roll back to Anthropic, we lose that ~30% savings.

For Phase 7, that's an acceptable risk — we're not planning to roll back. If we do roll back, Phase 8 adds the cache_control plumbing back through the abstraction.

## Acceptance

- [ ] `klo-respond/index.ts` no longer has a local `callAnthropic` function
- [ ] All API calls go through `callLlm`
- [ ] The "text instead of tool call" fallback (Strategy A) is wired in
- [ ] Token usage is logged on every call
- [ ] Deploy `supabase functions deploy klo-respond --no-verify-jwt`
- [ ] Send a test chat message in DIB
- [ ] Verify in Supabase logs: the log entry shows `model: gemini-3.1-flash-lite-preview`
- [ ] Verify in DB: `klo_state` was updated correctly (check `klo_state.confidence.value`, `next_meeting`, etc.)
- [ ] Run a few more turns — confirm no errors, no missing fields, reply quality feels acceptable

If acceptance fails (Klo's quality is clearly worse), set `USE_GEMINI=false` and redeploy. That's the rollback path.

→ Next: `04-klo-respond-prompt-tweaks.md`
