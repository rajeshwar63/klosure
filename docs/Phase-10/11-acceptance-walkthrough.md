# Sprint 11 — Acceptance walkthrough

**Sprint:** 11 of 11
**Estimated:** 0.5 days
**Goal:** A manual test checklist tied to the four roadmap acceptance criteria. Run this on the deployed Vercel preview branch before merging Phase A to main. If any acceptance fails, fix the relevant sprint and re-run from that point.

## Why this matters

We've shipped 10 sprints of code. Each one had its own acceptance checklist verified in isolation. This sprint verifies the **integrated experience** — the four acceptance promises the roadmap made for Phase A:

> 1. Connect a Gmail account; emails with deal stakeholders appear as Klo updates within 60 seconds
> 2. Schedule a meeting on Google Calendar with a deal stakeholder; Notetaker bot joins automatically; transcript triggers klo_state update within 5 minutes of meeting end
> 3. Manager dashboard shows team-level pool usage with per-rep breakdown
> 4. Existing customers (zero today) migrate to new pricing without disruption

These are the deliverables. Internal acceptance for Rajeshwar; external acceptance for the first design partner.

## Pre-flight

Before running the walkthrough, confirm:

- [ ] All 10 prior sprint acceptance lists are checked
- [ ] `nylas-validation-notes.md` shows all 3 validation tests PASS
- [ ] Vercel preview deployment is green (no build errors)
- [ ] Supabase functions all deploy successfully (`supabase functions list` shows 6 nylas-* functions deployed)
- [ ] Razorpay test mode plan has the new `klosure` plan_id in PLAN_ID_TO_SLUG
- [ ] Two real test accounts ready:
  - `rajeshwar63@gmail.com` (your real account)
  - A test outlook.com account (free signup, takes 5 min)
- [ ] At least 2 active deals in your Klosure account, with stakeholder emails populated in `klo_state.people`

## Walkthrough scripts

### Acceptance 1: Email signal within 60 seconds

**Setup:**
- Open Klosure in browser, signed in
- Confirm `/settings/connections` shows your Gmail as connected (or connect it now)
- Pick an active deal where you've added a stakeholder email — let's say "ATS Prospect" with `mike.vp@ats-corp.com`
- Open the deal chat in one tab; have your email client open in another

**Test:**
1. From a separate inbox, send an email TO `rajeshwar63@gmail.com` FROM `mike.vp@ats-corp.com` with subject "Re: timeline" and body "Hey Rajeshwar — we need to push the kickoff to March 22, the procurement team isn't done with their security review."
2. Note the timestamp the email was sent.
3. Watch the deal chat for "ATS Prospect" with a stopwatch.

**Expected within 60 seconds:**
- A Klo message appears in the deal chat
- The message references the email naturally — something like: "Read your email from Mike. Two things changed: kickoff slipped to March 22, Procurement is now in the loop."
- The Overview tab on the deal shows the deadline updated to March 22 (or has a note about the new proposed date)

**Pass criteria:**
- [ ] Klo message arrived in chat within 60 seconds of email send
- [ ] Message content is informative (not just "An email was received")
- [ ] `klo_state` updated to reflect the email content (deadline, new stakeholder, blocker, etc.)

**If this fails:**
- Check Supabase function logs for `nylas-webhook` and `nylas-process-email`
- Check `email_events` for a row with `from_addr='mike.vp@ats-corp.com'` and `processing_error` content
- Most common fail: stakeholder email not in `klo_state.people` — verify with `select klo_state->'people' from deals where id='<deal-id>'`

### Acceptance 2: Meeting capture and 5-minute extraction

**Setup:**
- Same account as above with Gmail connected
- Pick a deal where you have a stakeholder email
- Have a willing test partner (someone who can be on a meeting with you)

**Test:**
1. Open Google Calendar and create a new event:
   - Title: "ATS sync — kickoff planning"
   - Start: 5 minutes from now
   - Duration: 15 minutes
   - Add Google Meet
   - Add your test partner as guest with their stakeholder email
2. Save the event.
3. Within 1 minute, check Supabase:
   ```sql
   select notetaker_state, nylas_notetaker_id, deal_id, matched_stakeholder
     from meeting_events
     where nylas_event_id = (select nylas_event_id from meeting_events order by created_at desc limit 1);
   ```
   Expected: `notetaker_state = 'scheduled'`, `nylas_notetaker_id` populated, `deal_id` matches the chosen deal.
4. Wait for the meeting to start.
5. Join the meeting in Google Meet. Watch the participant list.

**Expected at meeting start:**
- A bot named "Klo (Klosure)" joins within 30 seconds of the meeting start.

**Test continued:**
6. Talk for at least 5 minutes about the deal. Mention specific things: a date, a number, a person's name, a decision.
7. End the meeting (host leaves).
8. Note the time the meeting ended.
9. Watch the deal chat with a stopwatch.

**Expected within 5 minutes of meeting end:**
- A Klo message appears in the deal chat
- The message references the meeting: "Caught the call with [name]. Three takeaways: ..."
- The takeaways are accurate to what was actually said
- Overview tab shows updated commitments / decisions

**Pass criteria:**
- [ ] Bot joined the meeting (verified in Meet UI)
- [ ] Klo message appeared in chat within 5 minutes of meeting end
- [ ] Takeaways match meeting content (sanity check, not perfection)
- [ ] `klo_state` updated with at least one new commitment or decision
- [ ] `team_pool.current_meeting_minutes` increased by ~15 (the meeting duration)
- [ ] `meeting_usage` has a new row

**If this fails:**
- Bot didn't join → check `meeting_events.notetaker_state`. If still `scheduled`, Nylas didn't dispatch (most common: meeting URL malformed). If `failed`, check `processing_error`.
- Bot joined but no transcript → wait longer. Nylas can take 2-3 min after meeting ends to render transcript.
- Transcript exists but Klo didn't post → check `nylas-process-meeting` logs and `klo-respond` logs.

### Acceptance 3: Manager dashboard shows pool usage

**Setup:**
- Sign in as a team manager (the user who owns a team with at least 2 members)
- Have at least one prior meeting captured (from Acceptance 2 testing)

**Test:**
1. Navigate to the manager dashboard.
2. Look for the "Team Pool" panel.

**Expected:**
- Panel shows "TEAM POOL · MAY 2026" header
- Meeting capture progress bar with current usage (e.g. "0.3h of 30h · 1%")
- Bar is colored emerald (because <80%)
- Per-rep breakdown shows each team member with their meeting consumption
- Reset date is correctly the 1st of next month

**Pass criteria:**
- [ ] Panel is visible on the manager dashboard
- [ ] Numbers match `select * from get_team_pool('<team-id>')`
- [ ] Per-rep numbers match `select * from get_team_usage_by_rep('<team-id>')`
- [ ] Reset date is correct
- [ ] Solo user (seat_count=1) does NOT see the panel (verify with a separate test account)

**Stress test (optional but recommended):**
1. In the database, simulate the team being at 85% of pool:
   ```sql
   update team_pool set current_meeting_minutes = (
     meeting_minutes_per_seat * (select count(*) from team_members where team_id = team_pool.team_id) * 0.85
   )::int where team_id = '<team-id>';
   ```
2. Reload the manager dashboard.
3. Expected: bar turns amber, status text reads "Approaching pool limit"
4. The team owner should receive an email (check inbox).
5. Reset back to a sensible value before continuing:
   ```sql
   update team_pool set current_meeting_minutes = 0,
     notified_80_at = null, notified_100_at = null
     where team_id = '<team-id>';
   ```

### Acceptance 4: Pricing migration without disruption

Since you have zero paying customers, this acceptance is mostly internal: confirm test users and the trial flow still work after the pricing collapse.

**Test 1: New signup goes to trial**
1. Sign out, sign up with a fresh email
2. Expected: account is created with `plan='trial'`, `trial_active` status

**Test 2: Old test users were migrated**
```sql
select email, plan, status from users where plan in ('pro', 'team_starter', 'team_growth', 'team_scale');
-- Expected: zero rows. All migrated to 'klosure' (or are still on 'trial').
```

**Test 3: Razorpay checkout works for new plan**
1. Sign in as a test trial user
2. Navigate to /billing
3. Verify only Klosure + Enterprise cards are shown (no Pro/Starter/Growth/Scale)
4. Click "Start now" on the Klosure card
5. Razorpay checkout opens with the new test plan ID
6. Complete the test payment with a test card (`4111 1111 1111 1111`, any CVC, any future date)
7. Verify `users.plan = 'klosure'` and `teams.plan = 'klosure'` after webhook fires
8. Verify a `team_pool` row exists for the new team

**Pass criteria:**
- [ ] No pro/team_starter/team_growth/team_scale references in active user/team rows
- [ ] BillingPage shows exactly 2 cards (Klosure, Enterprise)
- [ ] Test checkout completes successfully
- [ ] Post-checkout: user has team, team has pool, plan is 'klosure'
- [ ] `razorpay-webhook` logs show no `unresolved_plan` errors

## Phase A done definition

When all 4 acceptance walkthroughs pass:

1. Update `Klosure_Roadmap_v1.docx` Section 11 to mark Phase A as ✓ Complete with date
2. Tag the merge commit `phase-a-complete`
3. Update memory: Klosure ships email + meeting capture + single-plan pricing (Phase A complete)
4. Send yourself a celebration email — you just shipped the most important phase of the roadmap
5. Move to Phase B (Closure Layer)

## What COULD go wrong post-launch

These are the failures to watch for in the week after Phase A ships:

1. **Email volume spike kills costs** — if a connected user gets 500 deal emails in a day (unusual but possible for an active inside-sales rep), each email triggers `klo-respond`. At ~$0.0014/call that's ~$0.70/day for one user. Sustainable but watch.
2. **Notetaker bot denied entry** — some corporate Zoom accounts have "only authenticated users can join" enabled. The bot can't authenticate. The meeting just runs without capture. Detect via `notetaker_state='failed'` patterns.
3. **Transcript quality below par for non-English** — Phase A is English-only by design, but a Gulf customer with Arabic-speaking team members will have garbled transcripts. Klo will produce nonsense extractions. The `EMAIL_AND_MEETING_RULES` prompt should be defensive here, but watch for false positives.
4. **80% notification fires on month rollover** — if the cron resets at 00:01 UTC and the first webhook of the new month fires at 00:00:30, the increment could trigger an 80% notification using stale data. Unlikely but possible. The fix is to gate notifications on `current_period_start` matching the current month — defer until you actually see this happen.
5. **Nylas grant.expired arrives without warning** — Microsoft Office365 sometimes invalidates grants without notice. The user gets nothing for days until they happen to check `/settings/connections`. Phase B should add a passive nudge: "Your inbox is disconnected — Klo missed [N] emails since [date]."

## Pitfalls during the walkthrough itself

- **Test on a Vercel preview, not localhost** — the Nylas webhook can't reach localhost. You'll find this immediately when sprints 4-6 don't seem to work locally; that's expected, all webhook testing happens on the preview URL.
- **Use real meetings, not test calls** — Notetaker behaves differently when nobody talks. Have an actual conversation.
- **Don't conflate quality issues with system failures** — if the bot joins, captures, and Klo posts a chat reply, the system works. If the chat reply is "meh," that's a prompt-tuning issue (Phase B improvement), not an acceptance fail.
- **Check costs after the walkthrough** — log into Nylas dashboard and verify Notetaker minutes consumed match expectations. If you ran 4 test meetings of 15 min each you should see ~60 minutes consumed.

## Post-Phase-A: what's next

Phase A was infrastructure. Phase B (Closure Layer, 2 weeks) is the closing-side polish: won/lost views, win rate, cycle time. Per the roadmap, Phase B is high-value but technically smaller than A. Most data is already in the DB.

Before you start Phase B:

- Use Klosure on at least 2 of your real deals for a full week
- Note the moments Klo surprised you (good or bad)
- Note the moments Klo missed something obvious
- Bring those notes into Phase B planning — they'll redirect Phase B priorities far more than the original roadmap did

→ Phase A complete. Move to `docs/phase-B/README.md`.
