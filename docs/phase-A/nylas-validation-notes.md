# Nylas validation notes — Phase A week 1

Run during week 1 of Phase A, before sprint 04 commits to production. Three tests:

## Test 1 — Gmail webhook latency
- [ ] Connected own Gmail (rajeshwar63@gmail.com) via hosted OAuth
- [ ] Sent 5 test emails from another account
- [ ] Webhook latency for each (target: <60s):
  - Email 1: ___s
  - Email 2: ___s
  - Email 3: ___s
  - Email 4: ___s
  - Email 5: ___s
- [ ] Median latency: ___s
- [ ] Verdict: PASS / FAIL

## Test 2 — Outlook sync
- [ ] Created free outlook.com account
- [ ] Connected via hosted OAuth
- [ ] Email arrives and webhook fires
- [ ] Verdict: PASS / FAIL

## Test 3 — Notetaker on Gulf-accent call
- [ ] Scheduled a Google Meet with someone speaking English with Gulf or Indian accent
- [ ] Notetaker bot joined automatically: YES / NO
- [ ] Talked for 10+ minutes about a fake deal with: company names, AED amounts, dates, decisions
- [ ] Transcript reviewed line by line
- [ ] Specific things it got wrong: ___
- [ ] Numbers transcribed correctly: YES / MOSTLY / NO
- [ ] Proper nouns transcribed correctly: YES / MOSTLY / NO
- [ ] Verdict: PASS / ACCEPTABLE / FAIL

## Decision

Based on results above:
- All PASS → proceed with Phase A as written
- Test 3 FAIL → swap meeting capture to Recall.ai; rewrite sprints 04, 06, 07
- Test 1 or 2 FAIL → escalate to Nylas support before proceeding
