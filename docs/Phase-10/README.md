# Phase A — Signals + One Plan

This folder contains the spec for Phase A of the Klosure roadmap, broken into 11 sequential sprint files. Each sprint is independently committable.

## What ships in Phase A

The signal pipeline. Until Phase A, Klo only knows what the seller types into chat. After Phase A, Klo also reads:

1. **Email** — Gmail and Outlook inboxes (read-only) via Nylas
2. **Calendar** — Google Calendar and Microsoft 365 calendar via Nylas
3. **Meetings** — Zoom, Google Meet, and Teams transcripts via Nylas Notetaker

All three feed into the existing `klo_state` extraction pipeline. The roadmap calls this "from input to ground truth": Klo no longer depends on the seller's typed updates — it reads what actually happened.

Pricing collapses from the current 6-tier structure (`trial` / `pro` / `team_starter` / `team_growth` / `team_scale` / `enterprise`) to a single per-seat plan with team-pooled resources, per the roadmap's Section 3.1 decision.

## Critical principles (locked — re-read every sprint)

1. **Email is read-only.** Klosure never sends email. Sending is Outreach/Apollo territory; Klo only extracts signals from incoming + outgoing messages already in the inbox. Do not add a "send from Klo" button.

2. **Stakeholder match is the gate.** An inbound email or meeting attendee only triggers `klo_state` extraction if at least one party matches a stakeholder in `klo_state.people` for some active deal owned by the connected user. Without this gate, every personal email becomes a Klo update — unusable.

3. **Pool at the team level, never per-user.** Heavy callers and light callers balance out. Quotas are team-wide, not per-rep. The manager dashboard shows per-rep breakdown for visibility, but throttle decisions are pool-wide.

4. **No surprise bills.** When a team hits 80% of any pool, the manager is notified. At 100%, capture *pauses* — it does not silently auto-charge for overage. This is a load-bearing trust commitment from the roadmap (Section 3.6).

5. **Nylas behind an interface.** All Nylas calls go through `_shared/nylas-client.ts`. If we ever need to swap to Recall.ai (meetings) or direct Gmail/Microsoft Graph (email), it's a one-file change. Same swappability principle as the LLM abstraction in Phase 7.

6. **Klo posts as Klo, in the deal chat.** When an email arrives or a meeting ends, the user experience is: a new message appears in the deal chat, sender = Klo, content = "Read your email with Sarah. Two things changed: deadline moved to March 15, Procurement now in the loop." Not a separate notifications panel. Not a sidebar. The deal chat is already the user's home — Klo's signal updates appear there.

7. **Existing migrations stay forward-only.** The `klo_state` shape from Phase 4.5 does not change in Phase A. We only add new *sources* of input that produce the same shape of output.

## ⚠️ Important: Razorpay, not Stripe

The roadmap document says "Update lib/plans.ts and Stripe products" in the What-Ships list. **The codebase moved off Stripe to Razorpay in Phase 12.3.** All pricing migration in this spec targets Razorpay. The roadmap text is stale on this single point — do not introduce Stripe code.

## ⚠️ Important: Nylas validation prerequisite

The roadmap lists three Nylas validation tests (Gmail webhook latency, Outlook sync, Notetaker on a Gulf-accent call) as prerequisites to drafting this spec. **Rajeshwar elected to write the spec first and validate in parallel during week 1.** This is acceptable but creates a hard checkpoint:

> **Before sprint 04 (`nylas-webhook-handler`) lands, the three validation tests MUST pass.** If Notetaker quality is poor on Gulf accents, sprint 06 (meeting extraction) flips to a Recall.ai swap and sprints 04, 06, 07 need rewriting. The earliest place this risk shows up is sprint 04. Do not commit sprint 04 without validation results in hand.

Validation notes go in `docs/phase-A/nylas-validation-notes.md` (created by you during week 1, not pre-written here).

## Sprints

| # | File | Days | What ships |
|---|---|---|---|
| 1 | `01-nylas-account-setup.md` | 0.5 | Production Nylas app config, OAuth credentials, secrets in Supabase |
| 2 | `02-supabase-schema-extensions.md` | 1 | `nylas_grants`, `meeting_usage`, `team_pool`, `email_events`, `meeting_events` tables + RLS |
| 3 | `03-oauth-flow-frontend.md` | 1.5 | Settings page → "Connect inbox & calendar" → hosted OAuth flow → grant stored |
| 4 | `04-nylas-webhook-handler.md` | 2 | `nylas-webhook` edge function — receives email/calendar/notetaker events, dedupes, routes |
| 5 | `05-email-extraction-pipeline.md` | 1.5 | Email → stakeholder match → klo-respond extension → Klo posts in deal chat |
| 6 | `06-meeting-extraction-pipeline.md` | 2 | Calendar event → bot dispatch → transcript → klo-respond extension → Klo posts |
| 7 | `07-team-pool-metering.md` | 1 | Pool counters, 80% notify, 100% throttle, manager dashboard data |
| 8 | `08-pricing-collapse-razorpay.md` | 1.5 | Single-plan `lib/plans.ts`, new Razorpay plan, retire 6-tier structure |
| 9 | `09-settings-ui-connect-accounts.md` | 1 | The user-visible settings page, grant list, disconnect button |
| 10 | `10-manager-pool-dashboard.md` | 1 | Team-pool view inside the existing manager dashboard |
| 11 | `11-acceptance-walkthrough.md` | 0.5 | Manual test checklist tied to the 4 roadmap acceptance criteria |

**Total: ~13.5 days of focused work.** Roadmap budgets 3 weeks (15 working days). The 1.5 days of buffer is for the inevitable Nylas API surprise.

## Build order

Strictly sequential. Do not start sprint N+1 until N is committed and pushed. Two exceptions:

- **Sprint 8 (pricing collapse) can run in parallel with 4–7** if you have time. It touches no Nylas code. Recommended: do it during a day when you're waiting for a Nylas webhook to fire in testing.
- **Sprint 9 and 10 can swap order** if the manager dashboard is more pressing for a customer demo.

## Critical checkpoint — week 1

The roadmap's non-negotiable: **start using Klosure on your own real deals (SipSea, Zelto, ATS prospect)** during week 1, even before integrations ship. Use the existing chat-based product. By day 4 you should have a list of "things I keep wishing Klo would do." That list is allowed to modify sprints 5–10 of this spec — but not sprints 1–4 (those are infrastructure regardless of UX learning).

## Cost model — what changes

Per-seat run cost projection from the roadmap (Section 3.4), at typical usage:

| Cost line | Today (no integrations) | After Phase A |
|---|---|---|
| Nylas base | $0 | $3.00 |
| Meeting capture | $0 | $10.50 |
| Chat LLM | $2.10 | $2.10 |
| Extraction + infra | $1.50 | $1.50 |
| **Total / seat** | **$3.60** | **$17.10** |
| **Margin at $79 founding price** | **95%** | **78%** |
| **Margin at $99 standard price** | **96%** | **83%** |

Meetings dominate — they're 60% of post-Phase-A cost. Pool throttling is the financial control valve.

## What this phase does NOT include

- **Calendar bidirectional sync.** Read-only. We don't write events to the user's calendar in Phase A.
- **Inline email reply / send.** Pure read.
- **Notetaker custom branding per customer.** All bots show "Klo (Klosure)". Per-tenant branding is Phase D+.
- **Voice.** Phase F.
- **Native mobile app.** PWA only. Phase E.
- **Pattern detection on email/meeting data.** Klo extracts and posts; the manager-side pattern engine (Phase 5 deferred → Phase G) consumes the same `klo_state_history` rows that come from any source.

## Sprint conventions

Each sprint file follows the format used in `docs/phase-7/` and `docs/phase-9/`:

- **Goal** — one paragraph
- **Deliverable** — the exact file(s) to create/modify
- **Why this matters** — context Claude Code might miss without it
- **Code blocks** — full implementations, not pseudocode
- **Acceptance** — checklist
- **Next** — pointer to next sprint

→ Start with `01-nylas-account-setup.md`
