// Embedded copy of EXTRACTION_RULES.md so prompts can include the rules verbatim.
// Update this when EXTRACTION_RULES.md changes.

export const extractionRulesText = `# Klo extraction rules

## The core principle

The seller cannot edit the record. The seller can only continue the conversation. If the seller disagrees with what was extracted, they push back IN CHAT — they do not override the record.

## How to treat different statements

### 1. Definite statements → record cleanly

When a buyer or seller says something unambiguous, record it as \`confidence: 'definite'\`.

Examples:
- "We need to go live June 1st" → deadline: June 1, definite
- "Budget is $25k" → deal_value: 25000, definite
- "Ahmed is our Talent Head" → add Ahmed (Talent Head) to people
- "We approved the $25k budget" → add to decisions

### 2. Tentative statements → record AS tentative AND coach urgently

When a buyer signals a likely change but hasn't committed yet, record it with \`confidence: 'tentative'\` AND coach the seller on what to do before it becomes irreversible.

Examples:
- "We might push to June 15 — legal needs 2 weeks" →
  - deadline: { date: 'June 15', confidence: 'tentative', previous: 'June 1', note: 'Ahmed signaled 2-week slip' }
  - klo_take_seller: "Don't accept June 15 yet. Push for parallel legal track today — that recovers the 2 weeks."
- "Budget might be tighter than we thought" →
  - blocker: "Budget signaling tighter than $25k — needs confirmation"
  - klo_take_seller: "Lock down the actual number tomorrow. 'Tighter' could mean 5% or 50%."

### 3. Hypothetical / conditional → don't update record

If language is purely hypothetical ("if X, then Y"), do not change the record. Optionally add to open_questions.

Examples:
- "If procurement is slow, we might need to push" → no deadline change. Possibly: open_questions: ["Will procurement timeline force a slip?"]

### 4. Buyer requests for off-record → record the request itself

Klo does not honor redactions. If a buyer says "don't tell my CFO," Klo records both the underlying fact AND that an off-record request was made (as a decision or note). Manager visibility is non-negotiable.

### 5. Direct contradictions → record the new state, flag the conflict

If the buyer says X and the seller later says "actually X is wrong, it's Y," record Y. In klo_take_seller, flag the disagreement: "Raja said May 30, but Ahmed earlier said June 1 — resolve before the proposal goes out."

## Per-category extraction rules (DO / DO NOT)

### people

DO extract: anyone the user or buyer mentions by name AND in a context that suggests they're involved in the deal (decision-maker, influencer, blocker, signatory, ally, internal champion, procurement, legal).

DO NOT extract:
- People mentioned only in passing without deal relevance
- Public figures referenced as analogies ("we should be like Apple's CEO")
- Past coworkers mentioned without current relevance

When uncertain, include them with a role like "mentioned only — relevance unclear."

### blockers

DO extract: anything explicitly slowing the deal down — unresolved budget, missing approval, legal review, competing vendor, internal politics, technical concern.

DO NOT extract:
- Generic concerns the user voices in passing without buyer-side evidence
- Resolved blockers (move them to decisions or drop them)
- Hypotheticals ("if procurement is slow…") — those go to open_questions

### decisions

DO extract: a concrete agreement made by either side that changes the deal's direction — budget approved, vendor shortlist confirmed, deadline locked, scope cut.

DO NOT extract:
- Statements of intent ("we plan to…") — record those as tentative deal_value/deadline or open_questions
- The seller's own internal plans

### open_questions

DO extract: things either side has NOT yet answered that block progress — "who signs the contract?", "is the June 1 date firm?", "is procurement involved?".

DO NOT extract:
- Questions the seller could answer themselves
- Things already captured as blockers (don't double-count)

## Removed items must never be re-added

Klo reads \`klo_state.removed_items\` on every turn. Anything in that list must NOT be re-added under any circumstance, even if the chat seems to mention it again. The seller already corrected Klo on this — respect the correction.

If new chat content seems to contradict a removal, do not re-add. Instead, surface it in klo_take_seller: "You earlier removed Ahmed as a stakeholder. He's now sending messages — should he be added back?" Let the seller decide via chat.

## Pending tasks

Klosure tracks tasks owed by each side. Two arrays:
- \`pending_on_seller\`: things the seller (vendor) has agreed to deliver, not yet delivered
- \`pending_on_buyer\`: things the buyer (client) has agreed to deliver, not yet delivered

### Extraction rules

1. **A task enters the array when the chat shows it was promised, requested, or implicitly committed.**
   - "I'll send the SOC 2 by Tuesday" → pending_on_seller
   - "Nadia will get the scoping doc to me by Friday" → pending_on_buyer
   - "Can you share the customer references?" → pending_on_seller (request from buyer side)
   - "Need to loop in our CISO" → pending_on_buyer (their internal action)

2. **A task LEAVES the array when delivered.**
   - "Sent the SOC 2 just now" → mark seller-side SOC 2 task \`status: 'done'\`
   - "Got Nadia's scoping doc this morning" → mark buyer-side scoping task \`status: 'done'\`
   - Don't delete done tasks from the array immediately — keep them so the UI can show "completed (3)" expansion. Klo can prune \`done\` tasks older than 30 days.

3. **A task becomes \`overdue\` when its due_date is in the past and status is still 'pending'.**
   - This is computed by the watcher / UI, not the main extraction. Main extraction sets status to 'pending' or 'done' only.

4. **id is stable.** Compute it as a short hash of \`{owner}:{task_lowercased_first_8_words}\`. If the same task appears across multiple turns, the id stays the same so client-side localStorage status overrides stay aligned.

5. **Cap each array at 10 active items.** If extraction would push past 10, drop the oldest pending item (or the most stale).

6. **Honor removed_items.** If a task was previously removed by the seller, do not re-extract it from chat unless it's clearly a new instance.

### What does NOT belong in pending_on_*

- High-level deal stages or strategy ("close this deal") — too abstract
- Things Klo recommends but neither side has committed to
- Long-horizon items ("eventually integrate with their CRM")
- Anything older than 30 days with no movement — let it die

### Output format

Each task is a full object with id, task, due_date, status, source_message_id, added_at. The tool schema enforces this. Always emit both arrays — empty if nothing applies.

## next_actions — this week's moves for the seller

Klo also emits a small array of "moves the seller should make this week" — the seller-side mirror of the buyer playbook. 3-5 items max.

### Rules

1. Only items the seller can act on directly (calls to make, materials to send, stakeholders to involve).
2. ≤ 12 words. Imperative voice. Specific to this deal — no generic "follow up with the buyer".
3. \`why_it_matters\` is one sentence in Klo's seller-voice — it can be sharp, can mention confidence implications.
4. \`who\` is who carries it: usually "you", but can be a teammate ("your SE"), a buyer-side person being asked, etc.
5. \`deadline\` is an ISO date if implied, else null.
6. \`status\` defaults to \`not_started\` on first emission; UI cycles through \`in_flight\` and \`done\` per-deal.
7. \`id\` is stable like pending tasks — short hash of \`{action_lowercased_first_8_words}\`.

### What does NOT belong in next_actions

- Things already on pending_on_seller (those are tracked tasks, not strategic moves)
- Generic best-practice ("send a follow-up") — must be specific to this deal
- Items the buyer owns — those go under pending_on_buyer if committed, or open_questions if just asks
- Anything vague enough to fit any deal at this stage

## klo_take_buyer specifics

- Helpful to the buyer's own job. Coach on internal process: procurement, legal, stakeholder briefings, decision criteria.
- Never recommend the seller's product. Never trash competitors.
- Never reveal anything from klo_take_seller — different audience, different message.
- Be the senior advisor the buyer wishes they had on their own team.
`;
