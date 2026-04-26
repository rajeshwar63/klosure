# Phase 6.1 — Deal page polish + stakeholder visibility

This folder contains the spec for Phase 6.1, a focused polish phase building on Phase 6's foundation. Three quick visual fixes plus five higher-value UX additions to the deal page.

## What Phase 6.1 delivers

**Quick fixes (visual):**
1. Sidebar width bumped from 220px to 260px
2. Type sizing pass — bring small body text up to readable sizes
3. Remove the History tab entirely

**UX additions (substantive):**
4. **Stakeholders panel** — buyer-side people visible as persistent visual anchors with last-contact time
5. **Recency strip** — "last buyer message: 8 days ago, last seller message: 3 days ago" — silence as the story
6. **Fix "Stuck for" calculation** — currently shows 0w; should reflect actual time stuck
7. **Promote Commitments above the fold** — currently below the fold; salespeople LIVE in this asymmetry
8. **Next meeting chip** — small pill in the deal header showing the next scheduled event with the buyer

## Core principle

**The deal page should answer "what's the state of this relationship?" in 5 seconds of glance.** Phase 6 made it pretty; Phase 6.1 makes it useful. The new sections all surface relationship signals that an experienced salesperson would want to see immediately — who, when, how silent, how long.

## Sprints

Two small sprints. Each independently shippable.

| Sprint | Days | What ships |
|---|---|---|
| A | ~0.5 | Quick fixes — sidebar width, type sizing, remove History |
| B | ~2 | Stakeholders panel, recency strip, fix Stuck-for, promote Commitments, next meeting chip |

Total: ~2.5 days. Pure frontend except step 13 (next meeting chip), which adds one optional field to Klo's extraction prompt.

## Build order

### Sprint A — Quick fixes
- `01-sidebar-width.md`
- `02-type-sizing-pass.md`
- `03-remove-history-tab.md`

### Sprint B — Substantive UX
- `04-fix-stuck-for-calculation.md`
- `05-promote-commitments.md`
- `06-stakeholders-panel.md`
- `07-recency-strip.md`
- `08-next-meeting-extraction.md`
- `09-next-meeting-chip.md`

### Acceptance
- `10-acceptance-walkthrough.md`

## Rules for every step

- Commit after each step. Push after each commit.
- **No new tables.** Phase 6.1 reuses `messages`, `klo_state.people`, and `klo_state` as-is. The only schema-adjacent change is one new optional field in `klo_state` (next meeting), added via the extraction prompt — no migration needed because `klo_state` is already a flexible jsonb.
- **Only ONE prompt change** (step 08 — adds next meeting extraction). Every other step is pure frontend.
- Don't break Phase 6. Every Phase 6 acceptance test must still pass.
- Keep the new sections honest. If data is missing, show a graceful empty state ("no meetings scheduled yet") not fake placeholder data.

## What's deliberately out of scope

- **Confidence sparkline** — Phase 7. Higher value but more involved (chart logic, hover tooltips). Phase 6.1 stays scoped.
- **Calendar integration (real Google/Outlook sync)** — Phase 7+. Phase 6.1 only displays what Klo extracts from chat conversations.
- **Wiring Snooze / Mark done / Draft email buttons** — Phase 7 (those are still visible-but-disabled).
- **Deal economics / competitive context** — future phases.
- **Mobile layout for new sections** — keep it simple. New sections stack vertically on mobile; no special mobile UX.
