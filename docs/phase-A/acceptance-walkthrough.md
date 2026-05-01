# Phase A — acceptance walkthrough

Manual test checklist tied to the four roadmap acceptance criteria. Run on
the deployed Vercel preview branch before merging Phase A to main.

## Pre-flight

- [ ] All sprint acceptance lists checked (sprints 02–10)
- [ ] `nylas-validation-notes.md` shows all 3 validation tests PASS
- [ ] Vercel preview deployment is green
- [ ] Supabase functions all deploy: `supabase functions list` shows 6 nylas-* functions
- [ ] Razorpay test mode plan has the new `klosure` plan_id wired in `PLAN_ID_TO_SLUG`
- [ ] Two real test accounts ready (Gmail + outlook.com)
- [ ] At least 2 active deals with stakeholder emails populated in `klo_state.people`

## Acceptance 1 — Email signal within 60 seconds

1. Confirm `/settings/connections` shows Gmail connected
2. Pick a deal where you've added a stakeholder email
3. From a separate inbox, send the stakeholder an email about that deal
4. Watch the deal chat with a stopwatch

**Pass criteria:**
- [ ] Klo message arrives in chat within 60 seconds
- [ ] Message references the email naturally
- [ ] `klo_state` updated to reflect the email content

## Acceptance 2 — Meeting capture and 5-minute extraction

1. Schedule a Google Meet with the stakeholder, starting 5 minutes from now
2. Within 1 min: `meeting_events.notetaker_state = 'scheduled'`
3. At meeting start: "Klo (Klosure)" joins the Meet
4. Hold a 10+ min conversation
5. End the meeting

**Pass criteria:**
- [ ] Bot joined the meeting
- [ ] Klo message appears in chat within 5 minutes of meeting end
- [ ] Takeaways match meeting content
- [ ] `klo_state` updated with at least one new commitment / decision
- [ ] `team_pool.current_meeting_minutes` increased by ~meeting duration
- [ ] `meeting_usage` has a new row

## Acceptance 3 — Manager dashboard shows pool usage

1. Sign in as a team manager (team owner with 2+ members)
2. Navigate to the manager home
3. Verify the "Team Pool" panel renders

**Pass criteria:**
- [ ] Panel shows current period (e.g. "TEAM POOL · MAY 2026")
- [ ] Meeting capture progress bar reflects usage
- [ ] Per-rep breakdown matches `select * from get_team_usage_by_rep(...)`
- [ ] Reset date shows the 1st of next month
- [ ] Solo user (seat_count=1) does NOT see the panel

**Stress test:**
1. Set `team_pool.current_meeting_minutes` to 85% of total
2. Reload — bar turns amber, status reads "Approaching pool limit"
3. Team owner receives an 80% notification email
4. Reset counters before continuing

## Acceptance 4 — Pricing migration without disruption

**Test 1: New signup goes to trial**
- [ ] Fresh signup creates `users.plan = 'trial'`, status `trial_active`

**Test 2: Old test users were migrated**
- [ ] `select email, plan from users where plan in ('pro', 'team_starter', 'team_growth', 'team_scale')` returns zero rows

**Test 3: Razorpay checkout works for new plan**
- [ ] BillingPage shows exactly 2 cards (Klosure, Enterprise)
- [ ] Clicking "Upgrade" opens Razorpay with the new test plan ID
- [ ] After test payment: `users.plan = 'klosure'`, team auto-created, team_pool row exists
- [ ] `razorpay-webhook` logs show no `unresolved_plan` errors

## Phase A done definition

When all 4 acceptance walkthroughs pass:

1. Update roadmap doc Section 11 to mark Phase A as ✓ Complete with date
2. Tag the merge commit `phase-a-complete`
3. Use Klosure on at least 2 real deals for a full week before starting Phase B

## What COULD go wrong post-launch

- Email volume spike kills costs (high inbound activity → token burn)
- Notetaker bot denied entry on locked-down corporate Zoom accounts
- Transcript quality below par for non-English speakers
- 80% notification fires at month-rollover boundary (gate on current_period_start)
- Microsoft `grant.expired` arrives without warning — Phase B should add a passive nudge
