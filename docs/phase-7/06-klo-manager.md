# Step 06 — Migrate klo-manager

**Sprint:** C
**Goal:** Move the manager's coaching surfaces (Quarter Take + Ask Klo) to Gemini.

## File

- `supabase/functions/klo-manager/index.ts` — replace direct Anthropic call(s)

## Current behavior recap

`klo-manager` has two modes:

1. **`mode: 'quarter_take'`** — generates the manager's narrative paragraph about the team's quarter outlook. Uses team pipeline data. Output: text paragraph.

2. **`mode: 'chat'`** — manager's conversational chat with Klo about their team. Multi-turn conversation. Output: text reply (no tool schema).

Both are text-output, no tool calls.

## Migration

Same pattern as `klo-daily-focus`. Plain text generation, no tools.

```typescript
import { callLlm } from '../_shared/llm-client.ts';

// For quarter_take mode:
const result = await callLlm({
  systemPrompt: quarterTakeSystemPrompt,
  messages: [{
    role: 'user',
    content: pipelineDataAsUserMessage
  }],
  maxTokens: 800,
  temperature: 0.7
});

const takeText = result.toolCalled ? '' : result.text;

// For chat mode:
const chatResult = await callLlm({
  systemPrompt: managerChatSystemPrompt,
  messages: managerConversationHistory,
  maxTokens: 1200,
  temperature: 0.7
});

const chatReply = chatResult.toolCalled ? '' : chatResult.text;
```

## Prompt tweaks

The manager-facing voice differs from the seller-facing voice:

- Seller voice: tactical, "do this today"
- Manager voice: strategic, "here's the pattern across your team"

Make this explicit in the prompts:

```
You are Klo, briefing a sales manager. Your audience is more strategic than tactical.

Voice:
- Patterns over individual tactics. "Two of three deals are slipping for the same reason: signatory unknown" not "Send X to Y."
- Honest about reps' weaknesses. "Raja is stuck because he's avoiding the proposal — coach him on that" not "Raja could benefit from additional support."
- 4-6 sentences for chat replies. Manager replies can be longer than seller replies because the manager wants depth.
- DO NOT say: "Your team is doing great!" / "I notice some opportunities..."
- DO say: "Here's where to spend your 1:1 time this week..." / "Two reps need pricing approval support..."
```

## A note on Phase 6 Sprint D's reuse

Phase 6 Sprint D step 12 had `fetchManagerWeeklyBrief` reusing `mode: 'quarter_take'` as a stand-in for "this week" briefings. After Phase 7 migration:

- The function still works the same way
- Quality MAY drift because Flash-Lite is more literal than Sonnet — it might generate a "quarter outlook" when the manager wanted a "this week" view

Phase 8 should add a dedicated `mode: 'weekly_brief'` to `klo-manager` with a tighter prompt focused on this-week signals. Out of scope for Phase 7.

## Acceptance

- [ ] `klo-manager/index.ts` no longer has direct Anthropic code
- [ ] Both `quarter_take` and `chat` modes go through `callLlm`
- [ ] Deploy: `supabase functions deploy klo-manager --no-verify-jwt`
- [ ] As a manager: open `/team` — verify Klo's team brief renders with the right voice
- [ ] As a manager: send a message to `/team/askklo` — verify the chat reply is appropriately strategic (not tactical seller-style)

→ Next: `07-klo-watcher-and-removal.md`
