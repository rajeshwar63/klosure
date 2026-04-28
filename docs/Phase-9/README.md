# Phase 9 — Real-deal feedback fixes

This phase addresses 10 issues Rajeshwar flagged after using Phase 8 on a real deal (Apr 28). The fixes group into four clusters but ship as a single merge per his decision — no sprints, all 10 land together.

## What changes

### Cluster 1 — UI polish (small, fast)
- **Replace "Refresh now" with passive "Updated {timestamp}"** on Buyer view tab
- **Chat background goes white** — drop the bubble-chat aesthetic
- **"+ New deal" button below My Deals** in sidebar
- **Move Archive / Delete to bottom of deal room** as a quiet danger-zone footer
- **Remove "Open in chat"** from deal room header

### Cluster 2 — Action items from chat (replaces commitments)
- **Drop `commitments` table from DB** — fully deprecated, not used anywhere
- **Klo extracts pending tasks from chat** into `klo_state` (already happens for some fields — extend to dedicated `pending_on_seller[]` / `pending_on_buyer[]` arrays)
- **Buyer view "On you / On vendor"** reads from `klo_state.buyer_view.pending_on_buyer` / `pending_on_vendor`
- **Overview "On you / On vendor"** reads from same arrays (seller-side variant)

### Cluster 3 — Seller Overview redesign
- **Rebuild Overview using the buyer-view component library** with seller-voice variants
- Sections: Klo brief (seller voice) · Confidence + factors (seller-only) · This week's moves (seller voice) · Stakeholder map · Timeline · On you / On vendor · Momentum chart · Risks · Recent moments
- Remove the redundant "Klo Recommends" / "Klo's Confidence" / "Klo's Full Read" three-card pattern that repeated the same insight

### Cluster 4 — Onboarding rework
- **Onboarding modal on first dashboard visit** — same 5 fields as `/settings/train-klo`
- **Skippable** — dismissed via existing `klosure:trainklo:dismissed:{userId}` localStorage key, banner nag continues
- **Capture `seller_company` on the seller profile** (extend the schema by 1 field) so it doesn't get re-asked at deal creation
- **Remove "Your Company" field from deal creation form** — auto-populate from profile

## What does NOT change

- Phase 8 architecture (seller profile injection, buyer view extraction, gating logic) — all preserved
- LLM provider abstraction
- Pricing model, billing flows
- Manager view (separate concern)

## Step files (build order)

1. `01-drop-commitments-table.md` — DB migration + remove all client/server code that references commitments
2. `02-extend-seller-profile-with-company.md` — add `seller_company` column, backfill from existing deals if possible
3. `03-pending-tasks-extraction.md` — extend main extraction prompt + `KloState` types + tool schema with `pending_on_seller[]` / `pending_on_buyer[]`
4. `04-buyer-view-pending-arrays.md` — extend buyer-view prompt + tool schema with `pending_on_buyer[]` / `pending_on_vendor[]` arrays; wire into the Buyer view UI
5. `05-onboarding-modal.md` — first-visit modal at dashboard, captures profile, skippable
6. `06-deal-creation-cleanup.md` — drop "Your Company" field, auto-fill from profile
7. `07-overview-redesign.md` — rebuild Overview using buyer-view components with seller voice
8. `08-ui-polish-bundle.md` — Refresh→timestamp, white chat, +New deal sidebar, Archive/Delete footer, remove Open in chat
9. `09-acceptance-walkthrough.md` — manual test checklist on a real deal

## Critical principles (locked)

1. **Single source of truth for tasks.** `klo_state.pending_on_*` arrays are the only place tasks live. No table, no duplicate fields elsewhere.
2. **Seller profile is mandatory data, optional UX.** Modal nags but doesn't block. Dashboard banner persists until filled.
3. **Buyer view component library is shared.** Overview and Buyer view render the same components — voice is the difference, not structure. Saves code, prevents drift.
4. **All destructive UI moves to footers.** Win/Lost stay top (status changes). Archive/Delete go bottom (irreversible actions).
5. **Schema migrations are forward-only.** No rollback for dropped tables. Phase 9 SQL is committed and applied once.

## Cost / latency impact

- **Pending tasks extraction** adds ~150-200 input tokens to the main extraction prompt (rules) and ~100-150 output tokens (the arrays themselves).
- **Buyer-view pending arrays** add ~50-80 output tokens to the buyer-view tool schema.
- **Net per turn:** ~+$0.00012 main + ~+$0.00008 buyer view (when gated to fire)
- **New per-turn cost ceiling:** ~$0.00145 average (was ~$0.00133 in Phase 8)
- Still well under the $0.002 ceiling.

Latency: negligible — output tokens grow by ~150 max per call, ~0.2s additional.

## Rules for every step

- Commit after each step. Push after each commit.
- Follow Phase 7-8 conventions: XML-tag prompt sections, `LlmToolDefinition` typing, per-deal localStorage keys.
- Never bypass the LLM abstraction.
- After all 10 steps land, run the acceptance walkthrough on the same Emirates Logistics deal Rajeshwar already has chat history on — that's the most realistic test bed.

## What I'm NOT building (deferred)

- Calendar integration (Phase 10 candidate)
- Differential extraction (Phase 10 candidate)
- Dedicated weekly_brief mode for managers (Phase 10 candidate)
- Snooze/Mark done wiring on the seller's "Klo recommends" card (Phase 10 candidate)
