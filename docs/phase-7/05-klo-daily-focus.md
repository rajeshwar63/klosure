# Step 05 — Migrate klo-daily-focus

**Sprint:** C
**Goal:** Move the seller's daily morning briefing from Anthropic to Gemini via the abstraction.

## File

- `supabase/functions/klo-daily-focus/index.ts` — replace direct Anthropic call

## Current behavior recap

`klo-daily-focus` runs when:
- A seller loads the dashboard and the cache is stale (24+ hours old)
- A deal's confidence drops ≥10 points
- A deal status changes
- The user explicitly clicks "refresh"

Output: a single paragraph (3-5 sentences) telling the seller where to focus today, with `deals_referenced` array. Stored in `klo_daily_focus` cache table.

## Migration

This is simpler than `klo-respond` because:
- The output is plain text, not a complex tool schema
- It runs ~1-2 times/day per seller (not per chat turn) — quality matters less in aggregate
- No retry logic needed

Replace the existing call with:

```typescript
import { callLlm } from '../_shared/llm-client.ts';

// ... build systemPrompt and the user message describing all of the seller's deals ...

const result = await callLlm({
  systemPrompt,
  messages: [{ role: 'user', content: userMessage }],
  maxTokens: 600,         // tighter cap — focus paragraph is always short
  temperature: 0.7
});

if (result.toolCalled) {
  // Shouldn't happen — we didn't pass a tool. Defensive check.
  throw new Error('Unexpected tool call in daily-focus');
}

const focusText = result.text;
const dealsReferenced = extractDealsReferenced(focusText, sellerDeals);

// Save to cache as before
await supabase.from('klo_daily_focus').upsert({
  seller_id: sellerId,
  focus_text: focusText,
  deals_referenced: dealsReferenced,
  generated_at: new Date().toISOString()
});
```

## Prompt tweaks

Apply the same direct-instruction pattern from step 04. The key principle: the daily focus paragraph's voice IS the user-facing voice. It needs to feel like a senior sales VP, not a generic AI.

Ensure the system prompt explicitly:

```
You are Klo, an AI sales coach. Generate ONE paragraph (3-5 sentences) telling this seller where to focus today.

Rules:
- Pick ONE deal to anchor the focus on (the most urgent/highest-leverage situation)
- Open with the recommended action
- Then explain why in 1-2 sentences
- Mention the deal name explicitly so the UI can link to it
- Klo's voice: direct, specific, no hedging
- DO NOT say "Good morning!" or "I'd recommend..." or "It might be helpful..."
- DO say things like "Send the LXP proposal to Nina before Monday" or "DIB needs your attention today"
```

## What about deals_referenced?

The current implementation parses the focus paragraph to extract which deal IDs Klo referenced. This is a frontend service, not part of the LLM call. No changes needed.

## Acceptance

- [ ] `klo-daily-focus/index.ts` no longer has direct Anthropic code
- [ ] All API calls go through `callLlm`
- [ ] Deploy: `supabase functions deploy klo-daily-focus --no-verify-jwt`
- [ ] Manually trigger a focus regeneration (e.g., update a deal's confidence by 15 points to invalidate cache, then load dashboard)
- [ ] Verify the new focus paragraph feels like Klo's voice (not generic)
- [ ] Verify the paragraph mentions a real deal name and the UI links to that deal correctly

→ Next: `06-klo-manager.md`
