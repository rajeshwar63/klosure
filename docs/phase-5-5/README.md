# Phase 5.5 — UI Polish

This folder contains the spec for Phase 5.5, broken into small steps. No schema changes. No Edge Function changes. Pure frontend polish.

## What Phase 5.5 fixes

After Phases 1-5, Klosure has every feature it needs but the UI is information-dense in ways that work against the user. Three fixes:

1. **Dashboard's "Today's focus" is a wall of text.** Should be a one-line headline + expand on tap.
2. **Chat doesn't behave like a real chat.** Header scrolls away, input scrolls away, single-line input, heavy pill strip. Needs sticky header + sticky input + auto-expanding textarea + compact pills.
3. **Deal Overview shows 9 sections at once.** Cognitive overload. Most should be collapsible with smart defaults.

## Core principle

**Progressive disclosure, not progressive overwhelm.**

The user opens any page and immediately sees the *one thing that matters*. Everything else is one tap away. Clicking, scanning, and dismissing should never compete with the actual work the user came to do.

## Sprints

Each sprint independently ships value. Build in order; test after each.

| Sprint | Days | What ships |
|---|---|---|
| A | ~1 | Dashboard — Today's focus collapses to a one-line headline |
| B | ~1 | Chat — sticky header + sticky input + auto-expanding textarea + compact pills |
| C | ~1.5 | Deal Overview — collapsible sections with per-deal persistence |

## Build order — strict sequence

### Sprint A — Dashboard
- `01-todays-focus-collapse.md`

### Sprint B — Chat
- `02-chat-sticky-layout.md`
- `03-chat-textarea-autoexpand.md`
- `04-chat-compact-pills.md`

### Sprint C — Overview
- `05-overview-merge-take-and-read.md`
- `06-overview-collapsible-sections.md`
- `07-overview-persistence.md`

### Acceptance
- `08-acceptance-walkthrough.md`

## Rules for every step

- Commit after each step. Push after each commit.
- If any single step still hits a stream timeout, ask Claude Code: "split this step into two commits."
- **No new tables. No new Edge Functions. No prompt changes.** Pure frontend.
- Don't break existing functionality. Every test from Phase 5's acceptance walkthrough must still pass after this phase.
- Persistence uses `localStorage` keyed per deal — same pattern as `klosure:lastTab:{dealId}` from Phase 3.5.
- Mobile-first. Test at 375px after every change.

## What's deliberately out of scope

- No new sections or new data on any page.
- No design system rework — keep existing Klosure tokens (colors, fonts, spacing).
- No animations beyond simple expand/collapse.
- No theme/dark mode work.
- No accessibility audit (separate sprint when product is more stable).
