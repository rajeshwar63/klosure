# Phase 6 — Desktop-first Responsive Redesign

This folder contains the spec for Phase 6, broken into small steps. **No schema changes. No Edge Function changes. No prompt changes.** Pure frontend redesign.

## What Phase 6 delivers

A complete UI revamp from mobile-first to desktop-first responsive. Three new pages built around the principle: *Klo synthesizes, the user acts.*

1. **Seller home** — a morning briefing with Klo's focus card, a needs-you-today queue, and a pipeline at a glance
2. **Deal page with sidebar** — persistent sidebar listing all deals; the deal page itself centers on Klo's recommendation card
3. **Manager home** — same pattern as seller home but for the manager: Klo's read of the team, deals slipping this week, quarter at a glance

All three pages share a single sidebar component that adapts: full-width on desktop, slide-over drawer on mobile.

## Core principle (read this every step)

**The Klo card is the page hero. Everything else is supporting evidence.**

On every page, Klo's synthesis is the largest, most prominent thing. Not because we want to show off the AI — because the entire point of Klosure is that the user shouldn't have to do their own synthesis. If the user has to read three sections to figure out what to do, the product has failed. If they read the Klo card and immediately know, the product has worked.

This is also why **"Ask Klo why" is everywhere.** Every Klo recommendation has a clear path to "tell me more, I don't fully agree, give me the reasoning." That keeps Klo from feeling oracle-like and keeps users engaged with the synthesis rather than passively consuming it.

## Sprints

Each sprint independently ships value. Build in order.

| Sprint | Days | What ships |
|---|---|---|
| A | ~1 | App shell — sidebar, layout, responsive breakpoints, route restructure |
| B | ~1.5 | Seller home page — Klo focus card, needs-you-today list, pipeline glance |
| C | ~2 | Deal page redesign — Klo recommendation card, two-column layout, collapsed Klo's full read |
| D | ~1.5 | Manager home page — Klo team brief, deals slipping, quarter at a glance |
| E | ~1 | Polish — empty states, loading skeletons, mobile drawer animation |

Total: ~7 days. The full app feels different by the end.

## Build order — strict sequence

### Sprint A — App shell foundation
- `01-sidebar-component.md`
- `02-app-shell-layout.md`
- `03-route-restructure.md`

### Sprint B — Seller home
- `04-seller-home-page.md`
- `05-klo-focus-card.md`
- `06-needs-you-today-list.md`
- `07-pipeline-glance-strip.md`

### Sprint C — Deal page redesign
- `08-deal-page-shell.md`
- `09-klo-recommends-card.md`
- `10-confidence-side-panel.md`
- `11-deal-stat-strip-and-blockers-commitments.md`

### Sprint D — Manager home
- `12-manager-home-page.md`
- `13-klo-team-brief-card.md`
- `14-deals-slipping-list.md`

### Sprint E — Polish
- `15-empty-and-loading-states.md`
- `16-mobile-drawer-and-responsive-pass.md`

### Acceptance
- `17-acceptance-walkthrough.md`

## Rules for every step

- Commit after each step. Push after each commit.
- If any single step still hits a stream timeout, ask Claude Code: "split this step into two commits."
- **No new tables. No new Edge Functions. No prompt changes.** Pure frontend.
- Reuse existing data sources — `getDeals()`, `getTeamPipeline()`, `fetchDailyFocus()`, `klo_state`. Don't invent new data flows.
- Mobile is a responsive consequence, not a separate codebase. Use Tailwind breakpoints (`md:`, `lg:`) — never write a separate mobile component.
- Each page must work at 375px (iPhone SE) and 1440px (desktop) without breaking. Test both.
- The Phase 5.5 collapsible sections, sticky chat, and Klo's read panel are **kept and reused**, just rehoused in the new layout.

## What's deliberately out of scope

- **Snooze, Mark done, Draft email** — these buttons appear in the design but are visible-only (disabled with tooltip "coming soon"). Wiring them is Phase 7.
- **Pipeline overview / charts page** — managers may eventually want a "show me my whole pipeline as a chart" view. Not in Phase 6.
- **Search** — global "find a deal" search is a future improvement.
- **Dark mode** — current Klosure is light-only. Stay light-only. Dark mode is a separate effort.
- **Notifications, mentions, comments** — Klosure is single-user-per-deal-side. No multi-user collab features.

## Migration strategy

Phase 6 is a major UI replacement. To avoid a half-broken-half-old experience:

1. Build everything on a feature branch (`claude/phase-6-redesign`)
2. Don't merge to main until Sprint E is complete and the acceptance walkthrough passes
3. Keep the old Phase 5.5 UI live on main during development
4. When Phase 6 ships, the cutover is total — old UI files are deleted, not preserved as "legacy view"

This is the right call because the old UI and new UI use overlapping component names and routing. Trying to keep both alive will break things in confusing ways.
