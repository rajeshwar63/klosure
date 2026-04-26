# Step 07 — Migrate klo-watcher and klo-removal

**Sprint:** C
**Goal:** Final two functions. Both small. Wrap up the migration.

## Files

- `supabase/functions/klo-watcher/index.ts`
- `supabase/functions/klo-removal/index.ts`

## klo-watcher

This runs on an hourly cron and generates email nudges for overdue commitments. Each nudge is 1-2 sentences of Klo's voice telling the seller "X is overdue, here's what to do."

Replace the Anthropic call with `callLlm`:

```typescript
import { callLlm } from '../_shared/llm-client.ts';

// For each overdue commitment, generate a nudge:
const result = await callLlm({
  systemPrompt: nudgeSystemPrompt,
  messages: [{
    role: 'user',
    content: `Deal: ${deal.title}. Overdue commitment: "${commitment.task}". Days overdue: ${daysOverdue}.`
  }],
  maxTokens: 200,
  temperature: 0.5  // tighter — nudges should be consistent
});

const nudgeText = result.toolCalled ? '' : result.text;
```

Voice for nudges: short, direct, action-focused. Add to the system prompt:

```
Generate ONE short nudge (1-2 sentences) for an overdue sales commitment.
- Direct: "Your proposal to Nina is 3 days overdue."
- Followed by ONE action: "Send it before EOD or call her to reset expectations."
- Total length: under 30 words.
- No filler ("Hi there!" / "Just a friendly reminder").
```

## klo-removal

This handles when the seller clicks × on a blocker, person, decision, etc. and provides a removal reason. Klo logs the removal and may briefly comment.

The current behavior either:
- Logs the removal (no LLM call needed)
- OR generates a short acknowledgment via Anthropic

If there's an LLM call here, replace with `callLlm`:

```typescript
const result = await callLlm({
  systemPrompt: removalSystemPrompt,
  messages: [{
    role: 'user',
    content: `User removed "${item}" with reason: "${reason}". Acknowledge briefly.`
  }],
  maxTokens: 100,
  temperature: 0.3
});

const ackText = result.toolCalled ? '' : result.text;
```

If `klo-removal` doesn't currently make an LLM call (just logs to `klo_state_history`), this step is a no-op for it. Verify by reading the function code.

## Acceptance

- [ ] `klo-watcher/index.ts` uses `callLlm`
- [ ] `klo-removal/index.ts` uses `callLlm` (or this step is a no-op if it doesn't call an LLM)
- [ ] Deploy both: `supabase functions deploy klo-watcher --no-verify-jwt` and `supabase functions deploy klo-removal --no-verify-jwt`
- [ ] Manually trigger watcher (or wait for the next hourly cron) and check for nudge emails generated with appropriate voice
- [ ] Click × on a blocker, provide a removal reason — verify removal logs correctly

After step 07, **all six functions are on Gemini.** Phase 7's migration is technically complete. Step 08 verifies quality, step 09 is the full acceptance walkthrough.

→ Next (Sprint D): `08-quality-calibration.md`
