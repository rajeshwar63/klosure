# Step 09 — Acceptance walkthrough

**Goal:** Validate Phase 9 end-to-end on the Emirates Logistics deal that already has chat history. All 10 fixes need to land cleanly without regressing Phase 8.

## Pre-checks

- [ ] All steps 01-08 committed and pushed
- [ ] Edge functions deployed: `klo-respond`, `klo-daily-focus`, `klo-manager`
- [ ] Phase 9 SQL migrations applied (drop commitments, add seller_company)
- [ ] Optional backfill SQL for existing deals' seller_company run

## Test 1 — Commitments table dropped

Run in Supabase SQL Editor:

```sql
select exists(
  select 1 from information_schema.tables where table_name = 'commitments'
) as still_exists;
```

- [ ] Returns `false`
- [ ] No errors in any deal page (commitments queries removed)
- [ ] Buyer view "On you / On vendor" still renders (now reading from klo_state)
- [ ] Overview "On you / On vendor" still renders

## Test 2 — Pending tasks extracted from chat

On the Emirates deal, send a message:

> Just confirmed — I'll send the case study to Nadia by Wednesday, and Faisal will get me Omar's calendar slot for next Tuesday's ROI presentation by Monday EOD.

After Klo replies, check:

```sql
select klo_state->'pending_on_seller', klo_state->'pending_on_buyer'
from deals where title ilike '%Emirates%';
```

- [ ] `pending_on_seller` includes a "Send case study to Nadia" item with due_date around Wednesday
- [ ] `pending_on_buyer` includes a "Get Omar's calendar slot" item with due_date around Monday EOD
- [ ] Each task has a stable `id`
- [ ] Both arrays render in the Overview "On you / On vendor"
- [ ] Both arrays render in the Buyer view "On you / On vendor" with perspective inverted

Send a follow-up:

> Sent the case study to Nadia just now.

- [ ] Same task in `pending_on_seller` flips to `status: 'done'`
- [ ] UI hides it from default view, shows in "Show completed (1)" expansion
- [ ] Same `id` preserved across the status update

## Test 3 — Seller profile has company field

- [ ] `/settings/train-klo` shows Company field at the top
- [ ] Saving the form persists `seller_company`
- [ ] Klo's prompt now sees the company in `<seller_profile>` block (verify via log of full prompt)

## Test 4 — Onboarding modal

Sign up a new test user (or clear localStorage for current user):

```javascript
// In browser console:
localStorage.removeItem('klosure:onboarding:seen:<user-id>')
```

Refresh the dashboard.

- [ ] Modal appears
- [ ] Skip button dismisses, sets localStorage flag
- [ ] Refreshing dashboard does not re-show modal
- [ ] Banner ("Klo is using generic coaching") still shows on dashboard if profile was skipped
- [ ] Saving the modal persists profile and dismisses

## Test 5 — Deal creation has no "Your Company" field

- [ ] Click "+ New deal" in sidebar
- [ ] Form has fields: title, buyer_company, value, deadline, share toggle — NO seller_company field
- [ ] If profile has `seller_company`, deal creates with it auto-filled
- [ ] If profile lacks `seller_company`, inline prompt appears asking for it; saving updates profile and unlocks deal form
- [ ] Created deal's header shows `{seller_company} × {buyer_company}` correctly

## Test 6 — Overview redesign

Open the Emirates deal's Overview tab.

- [ ] No "Klo Recommends" + "Klo's Confidence" + "Klo's Full Read" three-card pattern
- [ ] Klo brief hero card at the top with seller-voice content
- [ ] Confidence card with score + factors moving it up
- [ ] Klo's Take card with klo_take_seller (full text)
- [ ] Playbook card with `next_actions` array (3-5 items, status dots)
- [ ] Stakeholder map (same component as buyer view)
- [ ] Vendor team card
- [ ] Timeline strip (same as buyer view)
- [ ] On you / On vendor (with seller perspective)
- [ ] Confidence chart (30-day, seller-only)
- [ ] Risks list (from `klo_state.blockers`)
- [ ] Recent moments feed

## Test 7 — Honesty split still holds

Open Overview tab and Buyer view tab side by side on the Emirates deal.

**Klo's Take (Overview, seller-side):** allowed to say things like "Omar is the gatekeeper, push for direct CFO contact this week or this slips" — hard call OK.

**Klo brief (Buyer view):** says "to keep your Q3 go-live on track, ensure Omar receives ROI evidence before security review" — buyer-side framing, no seller strategy reveal.

- [ ] Two voices, same underlying facts
- [ ] No competitor names anywhere
- [ ] No confidence scores or factors leaked to buyer side
- [ ] Pending tasks identical in both, just with column labels swapped

## Test 8 — UI polish

- [ ] Buyer view banner shows "Updated {timestamp}" instead of Refresh now button
- [ ] When seller sends a material message, banner timestamp pulses briefly to show freshness
- [ ] Chat background is white, no bubbles, hairline dividers between messages
- [ ] Sidebar shows "+ New deal" below My Deals
- [ ] Clicking "+ New deal" navigates to deal creation
- [ ] Deal room header has only Win / Lost / Share buttons
- [ ] Deal room footer has Archive / Delete in a danger zone
- [ ] No "Open in chat" anywhere

## Test 9 — Mobile responsiveness

Open browser devtools, set viewport to 375px (iPhone SE):

- [ ] Sidebar collapses to a hamburger or hidden state
- [ ] Overview renders single-column, all sections stack
- [ ] Buyer view renders single-column
- [ ] Onboarding modal fills screen with margin
- [ ] Chat is readable, input is full-width
- [ ] Danger zone footer renders without overflow

## Test 10 — Cost & latency

Run the same telemetry query as Phase 8:

```sql
select
  count(*) as turn_count,
  avg(input_tokens) as avg_input,
  avg(output_tokens) as avg_output,
  avg((input_tokens * 0.0000001) + (output_tokens * 0.0000004)) as avg_cost_usd
from llm_call_log
where created_at > now() - interval '24 hours'
  and fn_name = 'klo-respond';
```

- [ ] Average per-turn cost: under $0.002 (target ~$0.00145 per Phase 9 estimates)
- [ ] P95 chat reply latency: under 4 seconds (no regression vs Phase 8)
- [ ] Buyer-view generation rate: still around 30-40% of turns

## Telemetry to watch for 7 days

- Onboarding modal shown / saved / skipped rates
- Pending tasks count per deal (sanity: 0-10 per side, no runaway)
- Average per-turn cost (target: <$0.002)
- "+ New deal" sidebar button click rate (sanity check it's discoverable)

## What this step does NOT do

- Does NOT generate test data
- Does NOT include load testing
- Does NOT cover billing or Stripe (untouched)

## Claude Code instructions

```
1. Walk through each test in order on production.
2. For any failed test, file an issue with:
   - Test number and pass criteria failed
   - Logs or screenshots
   - Hypothesis
3. Do NOT mark Phase 9 complete until all tests pass.
4. After all tests pass, update /mnt/project/Klosure_Project_Document_v2.md with a brief Phase 9 ship note.
5. Tag the release: `git tag phase-9-shipped && git push --tags`.
```

## Acceptance

- [ ] Tests 1-10 all pass
- [ ] Cost/latency targets met
- [ ] Project document updated
- [ ] Release tagged and pushed
- [ ] Rajeshwar uses the product on a real deal for 2+ days post-ship before deciding next phase priorities

— end of Phase 9 spec —
