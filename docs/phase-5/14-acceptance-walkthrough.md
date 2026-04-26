# Step 14 — Acceptance walkthrough

**Goal:** Verify each sprint with a manual checklist before declaring Phase 5 done. If a test fails, fix and re-test before moving on.

## Pre-flight

```powershell
cd C:\Users\rajes\Documents\klosure
git pull
```

Apply any pending SQL migrations:
- `supabase/phase5_daily_focus.sql` (if Sprint 3 shipped)
- `supabase/phase5_patterns.sql` (if Sprint 5 shipped)

Deploy any new/modified Edge Functions:
- `klo-respond` (modified in Sprint 1)
- `klo-daily-focus` (new in Sprint 3)
- `klo-manager` (modified in Sprint 4)
- `klo-patterns` (new in Sprint 5)

```powershell
supabase functions deploy klo-respond --no-verify-jwt
supabase functions deploy klo-daily-focus
supabase functions deploy klo-manager --no-verify-jwt
supabase functions deploy klo-patterns
```

## Sprint 1 — Per-deal confidence

### Test 1.1 — Confidence appears
- [ ] Open any active deal that has `klo_state` populated
- [ ] After sending one chat message, the deal Overview shows the confidence panel
- [ ] Score is a sensible 0-100 integer
- [ ] Tone color matches score (green ≥60, amber 35-59, red <35)

### Test 1.2 — Honest scoring
- [ ] A deal with overdue commitments + missing signatory + tentative deadline scores below 50
- [ ] A clean deal (no overdue, all stakeholders identified, definite dates) scores above 60
- [ ] If scores feel uniformly inflated (everything 70+), iterate the prompt in step 02

### Test 1.3 — Trend updates
- [ ] Send a chat message that makes the deal worse (e.g., "we might push this to next quarter")
- [ ] Confidence drops; trend chip shows "↓ N pts"
- [ ] Send a positive message ("budget is approved"); trend recovers

### Test 1.4 — "What would move this up"
- [ ] Each item in the list is a specific, actionable task — not generic
- [ ] Impacts are positive integers
- [ ] At least one item references something specific to this deal

### Test 1.5 — Buyer view hides confidence
- [ ] Open the same deal as buyer (incognito + share link)
- [ ] Confidence panel is NOT visible to the buyer
- [ ] Other Overview sections still render normally

## Sprint 2 — Dashboard reorder

### Test 2.1 — Sort order
- [ ] Dashboard active-deals list is ordered by confidence descending
- [ ] Within the same confidence value, most recently updated deal is on top

### Test 2.2 — Trend chips
- [ ] Each row shows the confidence number and a trend arrow
- [ ] Slipping deals (down trend, delta ≤ -10) have an amber background

### Test 2.3 — Stat strip
- [ ] Weighted pipeline matches `sum(value * confidence/100)` across active deals
- [ ] "Likely this quarter" count matches deals with confidence ≥ 60
- [ ] "Need attention" count matches deals where `isSlipping = true`

### Test 2.4 — Realtime
- [ ] Send a message in one deal that changes its confidence
- [ ] Dashboard reorders within 1-2 seconds without page refresh

## Sprint 3 — Today's focus

### Test 3.1 — Banner appears
- [ ] On dashboard load, "Today's focus" banner appears at the top
- [ ] Text is 3-5 sentences
- [ ] At least one specific deal is mentioned by name

### Test 3.2 — Cache works
- [ ] Refresh the dashboard — banner appears instantly (cached)
- [ ] In SQL: `select generated_at from klo_daily_focus where seller_id = '<seller-id>'` — same timestamp as before

### Test 3.3 — Cache invalidation
- [ ] In SQL: `update deals set klo_state = jsonb_set(klo_state, '{confidence,value}', '20'::jsonb) where id = '<deal-id>'`
- [ ] Refresh dashboard — banner regenerates (new timestamp)
- [ ] (Or: send a message that drops a deal's confidence ≥10 pts; refresh → fresh banner)

### Test 3.4 — Manual refresh
- [ ] Click "refresh" button on the banner
- [ ] New text appears, new timestamp shown

### Test 3.5 — Empty state
- [ ] As a brand-new seller with no active deals: banner is hidden, dashboard still works

## Sprint 4 — Manager forecast

### Test 4.1 — Tab renders
- [ ] As a team manager, navigate to Team page
- [ ] "Forecast" tab is visible alongside Pipeline / People / Ask Klo
- [ ] Click it — content loads

### Test 4.2 — Buckets correct
- [ ] Three bucket cards (Likely close / In play / Long shots)
- [ ] Each shows count and weighted dollar amount
- [ ] Counts sum to the total active-deals count for the team
- [ ] Numbers match what `bucketDeals(deals)` returns when called manually

### Test 4.3 — By-rep rollup
- [ ] Each team member appears with their counts and weighted total
- [ ] Reps with slipping deals show "at risk" flag
- [ ] Reps with strong pipelines show "strong" flag
- [ ] Sort: highest weighted first

### Test 4.4 — Klo's quarter take
- [ ] Top of the forecast tab shows a Klo-narrated paragraph
- [ ] References specific deals or reps by name
- [ ] States commit and stretch numbers
- [ ] Numbers match the buckets below

### Test 4.5 — Privacy
- [ ] Open in incognito as a non-manager from a different team
- [ ] They cannot access this team's forecast (RLS blocks)

## Sprint 5 — Pattern detection (skip if <5 closed deals)

### Test 5.1 — Pattern list
- [ ] On forecast tab, scroll to "Patterns Klo found"
- [ ] At least 1 pattern is listed (if team has ≥5 closed deals and signals are strong)
- [ ] Each pattern shows the trigger + close rate + sample size
- [ ] Sample sizes are all ≥5

### Test 5.2 — Insufficient data state
- [ ] As a team with <5 closed deals: "Klo will start finding patterns once you've closed 5+ deals" message appears
- [ ] Actual closed count is shown

### Test 5.3 — Refresh button
- [ ] Click "recompute"
- [ ] After ~5 seconds, patterns refresh
- [ ] In SQL: `select count(*) from team_patterns where team_id = '<team-id>'` — reflects current count

### Test 5.4 — Auto-refresh on close
- [ ] Close a deal as Won
- [ ] Within ~5 seconds, the team's patterns recompute (verify by checking `team_patterns.generated_at`)
- [ ] If close was the 5th, patterns appear for the first time

## Cross-cutting tests

### Test X.1 — Cost
- [ ] In Anthropic console (https://console.anthropic.com/usage), today's spend should be in line with expectations
- [ ] Per-turn cost stays around $0.01-0.015 (Sprint 1 adds ~$0.002 to per-turn cost)
- [ ] Daily-focus calls are infrequent (cached)
- [ ] Quarter-take calls happen only when manager opens the forecast tab

### Test X.2 — No regression
- [ ] All Phase 4.5 tests still pass (×, removal, provenance, buyer view, "what changed?")
- [ ] All Phase 4 tests still pass (Stripe, manager pipeline view, archive)
- [ ] All Phase 3 tests still pass (commitments, watcher, nudges)

### Test X.3 — Mobile
- [ ] Confidence panel readable at 375px
- [ ] Dashboard with confidence column readable at 375px
- [ ] Manager forecast tab usable at 375px (buckets stack, reps wrap)

## When all relevant tests pass

You've shipped Phase 5. Klosure now does pipeline analysis natively. The seller has clear daily focus. The manager has a forecast they can trust. Patterns emerge as the team's data grows.

Next conversations to have:
- **Show this to a real customer.** This is the strongest pitch material yet.
- **Watch for inflation.** If sellers report Klo's scores feel high, tighten the prompt. If they feel too harsh, calibrate the score guidance ranges.
- **Track which factors Klo cites most often.** That's free research on what actually drives deals in your team's market.

→ Phase 5 complete.
