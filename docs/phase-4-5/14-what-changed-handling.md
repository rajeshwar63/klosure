# Step 14 — "What changed?" handling in `klo-respond`

**Goal:** When a seller or buyer types a "what changed?" / "when did X happen?" / "why is X different now?" question in chat, Klo answers from `klo_state_history` — not from current state alone.

This is small but important: it's the entire history-browsing UX. No tabs, no version diffs — just ask Klo.

## Files touched

- `supabase/functions/_shared/prompts/extraction-prompt.ts` — add a section to the system prompt
- (No code changes — just prompt iteration)

## What to add to the extraction prompt

Already in step 05 we had Klo loading the recent history. Now we explicitly instruct Klo on how to use it:

Add this to the system prompt, in the "Your task this turn" section:

```
## Handling "what changed?" questions

If the user's most recent message is asking about CHANGES — not the current state — answer from history.

Trigger phrases include:
- "what changed"
- "what happened"
- "when did [X] change"
- "why is [X] different"
- "show me the history"
- "what did [seller name] remove"
- "is anything new"
- "what's new since [date or event]"

When you detect one of these, your chat_reply should:

1. Reference SPECIFIC history rows by their actual content (dates, before/after values, triggers)
2. Cite the message that triggered each change when relevant ("on April 27, after Ahmed mentioned procurement needs 3 weeks")
3. If the user asked about removals (change_kind='removed'), mention what was removed AND the reason given
4. Stay 1-3 sentences when possible, but allow 4-5 sentences for genuinely complex history questions
5. Do NOT update klo_state in response to a history question — leave the state unchanged from your read of the chat. Only update if the chat itself contains new facts.

If the user asks about something that has no history (e.g. "when did the budget change?" but the budget never changed), say so directly: "Budget hasn't changed — it's been $25k since the deal opened."
```

## Examples of expected behavior

| User asks | Klo answers (drawing on history) |
|---|---|
| "What changed in the last 3 days?" | "Two things: deadline shifted from June 1 to June 15 on Apr 27 (Ahmed mentioned procurement needs 3 weeks), and the proposal commitment went overdue Apr 25." |
| "Why is the date June 15 now?" | "It moved from June 1 on Apr 27 — Ahmed signaled legal review needs 2 extra weeks." |
| "Did Raja remove anyone?" | "Yes — he removed Ahmed (Talent Head) on Apr 23, said 'not actually a stakeholder, just CC'd.' Note that Ahmed has since sent 4 messages, so this might warrant a second look." |
| "What's new?" | (Lists recent extracted history rows briefly) |

## Why this approach is right

- No new UI surface — chat is the only interface for history
- No history "tab" or "version slider" to maintain
- Klo's answers are narrative, not a diff dump — matches how humans actually want to consume change information
- Manager and seller both benefit from the same mechanism

## Acceptance

- Deploy `klo-respond` with the updated prompt
- In a deal with several recent changes, ask: "What changed in the last 24 hours?"
  - Klo's reply references specific changes with dates and triggers
- Ask: "Why is the deadline different now?"
  - Klo's reply traces the deadline change through the relevant message
- Force a removal, then ask: "What did I remove from this deal?"
  - Klo's reply mentions the removal with the reason
- Asking a history question must NOT cause Klo to invent state changes — verify by checking that no new history rows were inserted on the question turn (other than possibly noisy field rewrites)

→ Next: `15-mobile-pass.md`
