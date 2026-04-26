# Step 08 — Next meeting extraction (the one prompt change)

**Sprint:** B
**Goal:** Extend Klo's extraction prompt so it pulls scheduled events out of conversations into a new `klo_state.next_meeting` field. This is the only prompt change in Phase 6.1.

## Why we need this

The next meeting chip (step 09) and the recency strip's "Last meeting" line (step 07) both need structured data about scheduled events. Klo already mentions meetings in its coaching ("Monday's demo with Ahmed") but never structures it.

This step adds:

1. A new optional field `next_meeting` in `KloState` types
2. Extraction rule to pull future events from chat
3. Tool schema update so Anthropic enforces the structure

## Files

- `supabase/functions/_shared/klo-state-types.ts` — add type
- `supabase/functions/_shared/EXTRACTION_RULES.md` — add rule
- `supabase/functions/_shared/prompts/extraction-prompt.ts` — reference the rule
- `supabase/functions/_shared/prompts/bootstrap-prompt.ts` — same
- `supabase/functions/klo-respond/index.ts` — add to `KLO_OUTPUT_TOOL` schema

## Type addition

In `klo-state-types.ts`:

```typescript
export interface NextMeeting {
  date: string;          // ISO datetime — YYYY-MM-DDTHH:MM:SSZ when known, YYYY-MM-DD when only date is known
  title: string;         // "Demo with Ahmed", "Budget review call", "Follow-up with Nina"
  with: string[];        // names of attendees mentioned, e.g. ["Ahmed", "Nina"]
  confidence: 'definite' | 'tentative';  // explicitly confirmed vs. proposed
  source_message_id: string | null;
}

export interface LastMeeting {
  date: string;          // ISO date when the meeting happened
  title: string;
  outcome_note: string | null;  // 1 sentence — what came out of the meeting, if Klo can infer
  source_message_id: string | null;
}

export interface KloState {
  // ... existing fields ...
  next_meeting?: NextMeeting | null;
  last_meeting?: LastMeeting | null;
}
```

Both fields are optional — they default to null on deals that haven't had any meetings discussed.

## Extraction rule

Add to `EXTRACTION_RULES.md`:

```markdown
## Meetings

### next_meeting

Extract the most imminent FUTURE meeting/demo/call mentioned in the conversation.

Triggers:
- Buyer or seller proposes a specific date/time: "Let's meet Monday at 3pm"
- A meeting is confirmed: "Demo Monday afternoon — confirmed"
- A meeting is on the calendar: "We have a call scheduled for next Tuesday"

Rules:
1. Only ONE next_meeting at a time — the closest upcoming one
2. If a date has passed, do NOT promote it to next_meeting; instead, move it to last_meeting
3. confidence is "definite" if both parties confirmed, "tentative" if only proposed
4. with[] is best-effort — only include names actually mentioned in the meeting context
5. If there's no future meeting in the conversation, set next_meeting to null
6. Resolve relative dates ("Monday", "next week") against TODAY'S DATE provided in the system context

Examples:
- Chat: "Confirmed for Monday at 4pm with Ahmed" → { date: "2026-04-28T16:00:00Z", title: "Demo with Ahmed", with: ["Ahmed"], confidence: "definite" }
- Chat: "Maybe a call sometime next week?" → { date: "2026-05-04", title: "Follow-up call", with: [], confidence: "tentative" }
- Chat (no meeting mentioned) → null

### last_meeting

When a meeting passes, transition next_meeting → last_meeting. Also extract any post-meeting summary mentioned in chat ("the demo went well — they're committed to budget review next week").

Rules:
1. If a date in next_meeting has now passed AND no replacement meeting is scheduled: move it to last_meeting with an empty outcome_note
2. If chat references a past meeting outcome: update last_meeting.outcome_note with one sentence
3. last_meeting is overwritten when a new meeting completes — only the most recent one is stored
```

## Prompt prompt — extraction-prompt.ts

Add to the existing extraction prompt, in the section that walks Klo through the structured fields:

```markdown
## Meetings

Extract `next_meeting` if there's a scheduled future event mentioned in the conversation. Move passed meetings to `last_meeting`. See EXTRACTION_RULES for full guidance.

If no meeting is mentioned, both fields are null. Don't invent meetings that weren't discussed.
```

Same addition to `bootstrap-prompt.ts` (which handles legacy deals without prior `klo_state`).

## Tool schema update

Extend `KLO_OUTPUT_TOOL.input_schema.properties.klo_state.properties` in `klo-respond/index.ts`:

```javascript
next_meeting: {
  type: ["object", "null"],
  properties: {
    date: { type: "string" },
    title: { type: "string" },
    with: {
      type: "array",
      items: { type: "string" }
    },
    confidence: { type: "string", enum: ["definite", "tentative"] },
    source_message_id: { type: ["string", "null"] }
  },
  required: ["date", "title", "with", "confidence"]
},
last_meeting: {
  type: ["object", "null"],
  properties: {
    date: { type: "string" },
    title: { type: "string" },
    outcome_note: { type: ["string", "null"] },
    source_message_id: { type: ["string", "null"] }
  },
  required: ["date", "title"]
}
```

## Date awareness in the prompt

Klo needs to know today's date to resolve relative references like "Monday" or "next week." The `klo-respond` function already injects the current date via system context — verify it's still being passed. If not, add it:

```typescript
const todayISO = new Date().toISOString().slice(0, 10);
const systemPrompt = `... TODAY'S DATE: ${todayISO} ...`;
```

This was likely added in earlier phases. Just verify it's still there.

## Backfill — what about existing deals?

Existing deals in production have `klo_state` without `next_meeting` or `last_meeting`. That's fine — both fields are optional. On the next chat turn, Klo's extraction will populate them if relevant. No migration needed.

## Acceptance

- [ ] Type definitions compile cleanly
- [ ] Tool schema accepts the new fields without rejecting tool calls
- [ ] Send a chat message in DIB like "Demo confirmed for Monday at 3pm with Ahmed"
- [ ] After Klo responds, query the deal's klo_state:
  ```sql
  select klo_state->'next_meeting' from deals where id = 'dd7c0455-...';
  ```
- [ ] Result has the structured next_meeting object with date, title, with, confidence
- [ ] Send "We just finished the demo — they want to do a follow-up next week"
- [ ] After Klo responds: next_meeting updated to follow-up, last_meeting populated with the demo
- [ ] Existing deals still work — next_meeting is null on deals where no meeting was mentioned

→ Next: `09-next-meeting-chip.md`
