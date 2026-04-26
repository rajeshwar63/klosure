# Phase 5 — Klo as Pipeline Analyst

This folder contains the spec for Phase 5, broken into small steps. Each step is independently committable and small enough to avoid stream timeouts.

## What Phase 5 delivers

Three new surfaces, all powered by the structured `klo_state` and `klo_state_history` shipped in Phase 4.5.

1. **Per-deal confidence** — inside each deal Overview, Klo shows a confidence-to-close score with the trend, what dropped/raised it, and three specific actions that would move it back up.

2. **Seller dashboard intelligence** — the deal list reorders by Klo's confidence; a daily "Today's focus" banner synthesizes the seller's whole pipeline into one paragraph of coaching.

3. **Manager forecast** — a new tab on the Team page with confidence buckets, by-rep rollup, and (eventually) patterns Klo has found across the team's closed deals.

## Core principle (read this every step)

**Klo's confidence is a structured assessment, not a calibrated probability.** Always label it as "Klo's read" or "Klo's confidence" — never "probability" or "forecast" alone. Sellers need to trust the number; calling it what it is keeps that trust intact.

Phase 4.5 already established the deeper principle: Klo records what was said, the seller cannot bend the record. Phase 5 builds on that — the confidence score is derived from the honest record, not from data the seller curated.

## Sprints — built and shipped in order

Each sprint is independently shippable. After each sprint, Klosure is more valuable than before. Don't merge a later sprint without the earlier ones working in production.

| Sprint | Days | What ships |
|---|---|---|
| 1 | ~3 | Per-deal confidence (the most demonstrable single feature) |
| 2 | ~2 | Dashboard reorders by confidence + per-deal trend chips |
| 3 | ~3 | "Today's focus" daily synthesis on the dashboard |
| 4 | ~3 | Manager forecast tab — buckets, by-rep rollup |
| 5 | ~5 | Pattern detection across closed deals (only after ≥5 closed) |

**Sprints 1-4 can ship without Sprint 5.** Sprint 5 needs real closed-deal data; if you don't have it yet, ship 1-4 and revisit Sprint 5 later. Don't fake patterns.

## Build order — strict sequence

Each numbered file is one step. Read it, complete it, commit, push, move to the next.

### Sprint 1 — Per-deal confidence
- `01-confidence-shape.md` — extend `klo_state` types
- `02-confidence-prompt.md` — update extraction prompt to compute confidence
- `03-confidence-render.md` — new section in `OverviewView.jsx`

### Sprint 2 — Dashboard reorder
- `04-dashboard-sort.md` — sort by `confidence_score`, render trend chips

### Sprint 3 — Today's focus
- `05-daily-focus-edge-function.md` — new `klo-daily-focus` function
- `06-daily-focus-cache-table.md` — small cache table
- `07-daily-focus-banner.md` — frontend banner on dashboard

### Sprint 4 — Manager forecast
- `08-manager-forecast-buckets.md` — confidence bucket aggregation
- `09-manager-forecast-tab.md` — new tab on Team page
- `10-manager-forecast-byrep.md` — by-rep rollup with Klo's read

### Sprint 5 — Pattern learning (defer if no closed deals)
- `11-pattern-detection-spec.md` — what patterns Klo looks for
- `12-pattern-detection-function.md` — `klo-patterns` Edge Function
- `13-pattern-display.md` — render patterns on manager forecast tab

### Acceptance
- `14-acceptance-walkthrough.md` — manual verification checklist for all sprints

## Rules for every step

- Commit after each step. Push after each commit.
- If any single step still hits a stream timeout, ask Claude Code: "split this step into two commits."
- Don't deviate from the principle: Klo's score is honest, derived from the structured record, never inflated.
- Don't recompute confidence on a schedule. It updates as a side-effect of `klo-respond` (every chat turn) — same way `klo_state` updates today.
- Token cost watch: confidence + factors adds ~150 tokens to Klo's per-turn output. Stay within the budget by keeping factor explanations short.

## What's deliberately out of scope

- No "Klo predicts the future" framing — confidence is current state assessment, not prophecy
- No editable confidence (sellers can't manually set their own probability — that's CRM territory)
- No Salesforce-style pipeline reports with custom fields, filters, etc.
- No commission projections (a different product)
- No competitor intelligence (out of scope for Klosure as a whole)
