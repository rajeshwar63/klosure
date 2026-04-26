# Step 16 — Acceptance walkthrough

**Goal:** Walk through each criterion manually before declaring Phase 4.5 done. If any fails, fix and re-test before moving on.

## Pre-flight

Make sure your local repo is up to date with the branch:

```powershell
cd C:\Users\rajes\Documents\klosure
git pull
```

## Test data setup

You'll want at least three deals in the database for this:

1. **A new deal you create from scratch** (will be born with `klo_state` after first turn)
2. **An existing pre-Phase-4.5 deal** (will lazy-bootstrap on its first new chat turn)
3. **A deal in shared mode with both seller and buyer** (for buyer-view tests)

If you don't have all three yet, create them now using the app.

## The 16 acceptance criteria

Run each. Mark pass or fail.

### 1. Existing deals continue to work
- [ ] Open any pre-Phase-4.5 deal. Chat works. Klo coaches. Commitments load. No errors in browser console.

### 2. First chat turn after migration produces a full `klo_state`
- [ ] In a deal with `klo_state IS NULL`, send a message
- [ ] After Klo replies, run in SQL: `select klo_state from deals where id = '<id>'`
- [ ] `klo_state` is now populated with summary, stage, and any people/blockers/etc. that the chat established

### 3. Definite statements update the Overview
- [ ] Type: "We need to go live on June 30"
- [ ] After Klo replies, the Overview deadline cell shows June 30 (not tentative)
- [ ] Hover the deadline cell → tooltip points to your message

### 4. Tentative statements update with tentative marker AND trigger coaching
- [ ] Type (as the buyer side): "We might push to July — legal might be slow"
- [ ] Deadline cell shows July, in amber, with "was June 30" underneath
- [ ] `klo_take_seller` (in the Klo's-take banner at top, when viewed as seller) urgently coaches the seller about pushing back

### 5. People auto-add
- [ ] In chat: "Adding Sarah from procurement"
- [ ] Within one Klo turn, Sarah appears in the People grid with role "Procurement"

### 6. × Remove works
- [ ] Click × on Sarah's card
- [ ] Reason prompt appears
- [ ] Type "actually she's just CC'd, not a stakeholder" → Submit
- [ ] Sarah disappears within 1 second
- [ ] Toast shows
- [ ] Send another message: "Sarah said the procurement timeline is fine"
- [ ] Klo does NOT re-add Sarah to People

### 7. Removal without reason rejects
- [ ] Click × on a person, leave reason empty, try to submit
- [ ] Submit button stays disabled, no removal

### 8. Provenance tooltips work
- [ ] Hover any person card → tooltip with source message
- [ ] Hover deadline cell → tooltip
- [ ] Hover any blocker → tooltip

### 9. Buyer view differs
- [ ] Open the same deal in incognito as a buyer (via /join/:token)
- [ ] Klo's take at top is buyer-oriented (talks about procurement, briefing CFO, etc.)
- [ ] No Open Questions section visible
- [ ] No × buttons visible anywhere

### 10. Both takes are role-honest
- [ ] In a deal with active changes, read both `klo_take_seller` and `klo_take_buyer`
- [ ] Seller's coaches on closing (parallel tracks, push back on slip, etc.)
- [ ] Buyer's coaches on internal process (loop in legal, brief CFO, decision criteria)
- [ ] Buyer's coaching never recommends the seller's product or trashes competitors

### 11. "What changed?" works
- [ ] In a deal with at least 5 history rows, type: "What changed in the last 24 hours?"
- [ ] Klo's reply references specific changes with dates and triggers
- [ ] Type: "Why is the deadline different now?"
- [ ] Klo traces the deadline change

### 12. Manager view shows truth
- [ ] As manager, ask: "What's happening with [DealName]?"
- [ ] Klo's reply accurately summarizes current state and recent changes
- [ ] Force a removal, then ask: "What did [seller] remove?"
- [ ] Klo mentions the removal AND the reason

### 13. Removed items in `klo_state.removed_items` persist
- [ ] After several Klo turns following a removal, run in SQL:
  `select klo_state->'removed_items' from deals where id = '<id>'`
- [ ] The removed item is still there with its reason

### 14. History grows correctly
- [ ] After 5+ chat turns with state changes:
  `select count(*) from klo_state_history where deal_id = '<id>'`
- [ ] Count is at least 5
- [ ] Each row has `triggered_by_message_id` set
- [ ] At least one row has `change_kind='removed'` if you did a removal

### 15. Mobile renders correctly
- [ ] At 375px, all sections of the Overview render cleanly
- [ ] × buttons are tappable
- [ ] Long-press for tooltip works
- [ ] No horizontal scroll

### 16. No regressions
- [ ] Phase 3 commitment proposal/confirm/done flow still works
- [ ] Phase 3.5 Chat/Overview tab toggle still works
- [ ] Phase 4 manager pipeline view loads
- [ ] Stripe billing page still loads (don't need to test full payment again)
- [ ] Won/Lost archive flow still works on a test deal

## If any test fails

- **Failures in 3, 4, 5** → prompt issue. Iterate the system prompt in step 05.
- **Failures in 6, 7, 13** → `klo-removal` function or removed_items handling. Check function logs.
- **Failures in 9, 10** → buyer-side prompt issue. Re-read step 12 quality check.
- **Failures in 11, 12** → "what changed?" prompt section. Re-read step 14.
- **Failures in 1 or 16** → regression. Roll back the last commit and bisect.

## When all 16 pass

You've shipped Phase 4.5. The seller no longer enters data into a CRM. Klo runs the deal record. Reality is preserved. The product matches its founding principle.

Time to dogfood it on a real deal.

→ Phase 4.5 complete.
