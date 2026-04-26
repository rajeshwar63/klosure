# Step 17 — Acceptance walkthrough

**Goal:** Verify Phase 6 end-to-end before merging to main. The whole UI is new — this walkthrough is longer than usual.

## Pre-flight

```powershell
cd C:\Users\rajes\Documents\klosure
git fetch
git checkout claude/phase-6-redesign
git pull
npm install
```

No SQL migrations. No Edge Function deploys. Pure frontend — wait for Vercel preview build (~60 seconds).

Test on the preview URL (NOT main) until the full walkthrough passes.

## Sprint A — App shell

### Test A.1 — Routing
- [ ] Visit `/` as a seller → redirects to `/today`
- [ ] Visit `/` as a manager → redirects to `/team`
- [ ] All Phase 5 routes still resolve (`/deals`, `/deals/:id`, `/team/forecast`, `/team/askklo`)
- [ ] Buyer link `/join/:token` works without the AppShell wrapper

### Test A.2 — Sidebar (desktop)
- [ ] At ≥ 1024px: sidebar visible, 220px wide, on the left
- [ ] Sidebar shows: Klosure logo, top nav, "My deals" with deal list, footer with user
- [ ] Top nav for sellers: ◆ Today, Deals
- [ ] Top nav for managers: ◆ This week, Forecast, Reps, Ask Klo
- [ ] Active item is highlighted with blue tint
- [ ] Click any nav item → navigates to that route, sidebar selection updates
- [ ] Click any deal row → navigates to /deals/:id, that deal becomes the highlighted row in sidebar
- [ ] Sidebar collapse toggle (‹) works — sidebar shrinks to ~52px showing only color dots
- [ ] Click expand toggle (›) → sidebar restores

### Test A.3 — Mobile shell
- [ ] At < 768px: sidebar hidden, mobile top bar visible with hamburger
- [ ] Tap hamburger → drawer slides in from left
- [ ] Drawer contains the same Sidebar contents
- [ ] Tap deal in drawer → drawer closes, navigates
- [ ] Tap backdrop → drawer closes
- [ ] Tap × → drawer closes
- [ ] Body doesn't scroll while drawer is open

## Sprint B — Seller home

### Test B.1 — Page structure
- [ ] Visit `/today` → see greeting "Good morning, Raja." with current date above
- [ ] Greeting changes with time of day
- [ ] Three sections render in order: Klo focus, Needs you today, Pipeline at a glance

### Test B.2 — Klo focus card
- [ ] Card is the largest visual element on the page
- [ ] Headline (first sentence) is big and weighted
- [ ] Body (rest of paragraph) is smaller and muted
- [ ] Primary CTA "Open {deal name}" navigates to that deal
- [ ] Secondary CTA "Ask Klo why" navigates appropriately
- [ ] Empty state shows when no focus available
- [ ] Skeleton state shows while loading

### Test B.3 — Needs you today
- [ ] List shows up to 5 actionable items
- [ ] Items prioritized: overdue commitments → due today → slipping deals
- [ ] Each row: dot + title + subtitle + Open button
- [ ] Open navigates to the right deal
- [ ] Empty state ("you're caught up") when no items
- [ ] Hidden when seller has no active deals

### Test B.4 — Pipeline glance
- [ ] Three bucket cards: Likely close / In play / Long shot
- [ ] Weighted dollar amounts correct (deal value × confidence / 100)
- [ ] Counts correct
- [ ] Total in header matches sum of buckets

## Sprint C — Deal page

### Test C.1 — Page shell
- [ ] Visit `/deals/:id` → see new dark header
- [ ] Header: deal title with health dot, optional Stuck pill, Share + Open in chat buttons
- [ ] Subtitle line: company · stage · value · deadline
- [ ] Tabs below: Overview / Chat / History
- [ ] Active tab persists per deal in localStorage
- [ ] Sidebar still visible on the left

### Test C.2 — Overview tab
- [ ] DealContextStrip at the top — cream banner with 1-2 sentence summary
- [ ] Two-column row: Klo recommends card on left, ConfidenceSidePanel on right
- [ ] Klo recommends card: tag + headline + body + 3 disabled buttons
- [ ] ConfidenceSidePanel: score + trend + bar + top 3 factors
- [ ] Klo's full read collapsed bar; expands to show rationale + all factors
- [ ] Stat strip with 5 columns (Stage / Value / Deadline / Health / Stuck for)
- [ ] Blockers + Commitments side-by-side below

### Test C.3 — Buyer view
- [ ] Open deal as buyer (incognito + share link)
- [ ] Klo recommends card shows buyer-side text, no buttons, "KLO SUGGESTS" label
- [ ] No ConfidenceSidePanel
- [ ] No Klo's full read
- [ ] No × buttons on blockers
- [ ] Open questions section hidden

### Test C.4 — Chat tab
- [ ] Click Chat tab → existing Phase 5.5 chat view appears
- [ ] All chat functionality preserved (sticky header, sticky input, auto-expanding textarea, real-time messages)
- [ ] Click Open in chat button (in dark header) → also switches to Chat tab

### Test C.5 — History tab
- [ ] Click History tab → list of state changes appears
- [ ] Each entry shows date, what changed, before → after
- [ ] Empty state if no history

## Sprint D — Manager home

### Test D.1 — Page structure
- [ ] Visit `/team` → see header "This week on your team."
- [ ] Subtitle: team name · rep count · active deals
- [ ] Three sections: Klo team brief, Deals slipping, Quarter at a glance

### Test D.2 — Klo team brief card
- [ ] Blue color tones (distinct from seller's amber)
- [ ] Headline + body split correctly
- [ ] Primary CTA "Open {rep}'s pipeline" appears when focal rep identified
- [ ] Secondary CTA "Ask Klo more" always present
- [ ] Empty state for team with no deals

### Test D.3 — Deals slipping
- [ ] Lists deals with declining confidence or other risk signals
- [ ] Each row shows confidence number + trend, deal + rep, summary, Open button
- [ ] Sorted by severity (worst first)
- [ ] Empty state ("pipeline is healthy") when nothing slipping

### Test D.4 — Quarter glance
- [ ] Three bucket cards (Likely / In play / Long shot)
- [ ] Numbers match team forecast page
- [ ] Commit + stretch in header line correct

### Test D.5 — Privacy
- [ ] Non-managers cannot access /team (existing route gating)
- [ ] Manager from team A cannot see team B's data (existing RLS)

## Sprint E — Polish

### Test E.1 — All empty states
- [ ] Seller with 0 deals: /today shows friendly empty state, no broken layouts
- [ ] Manager with 0 deals: /team shows friendly empty state
- [ ] Deal with no chat history: KloRecommendsCard shows "start chatting" prompt
- [ ] No blockers / no commitments: panels show empty messages, not blank space

### Test E.2 — All loading states
- [ ] Every page renders the greeting/header instantly, with skeletons for data-dependent sections
- [ ] No spinners anywhere
- [ ] Skeletons match the size of the actual content (no layout shift when data arrives)

### Test E.3 — Coming-soon buttons
- [ ] Snooze, Mark done, Draft email all visible but disabled
- [ ] Hovering shows "Coming soon" tooltip
- [ ] Cursor: not-allowed
- [ ] Opacity: ~50%
- [ ] Clicking does nothing

### Test E.4 — Mobile responsive (at 375px)
- [ ] Seller home: all sections readable, buttons fit, no horizontal overflow
- [ ] Deal page: two-column collapses to one, stat strip wraps, blockers/commitments stack
- [ ] Manager home: all sections clean
- [ ] Sidebar accessible via hamburger drawer

### Test E.5 — iOS PWA
- [ ] Delete old PWA from home screen, re-add fresh
- [ ] Status bar doesn't overlap content
- [ ] Drawer slides smoothly
- [ ] Chat keyboard works without hiding input
- [ ] All pages usable

## Cross-cutting

### Test X.1 — No regression
- [ ] Phase 5 acceptance tests still pass (per-deal confidence, dashboard data, daily focus, manager forecast)
- [ ] Phase 4.5 tests still pass (Klo extraction, ×, provenance, "what changed?")
- [ ] Phase 4 tests still pass (Stripe, manager pipeline, archive, lock triggers)
- [ ] Phase 3 tests still pass (commitment proposal/confirm/done, watcher, nudges)
- [ ] Phase 2 tests still pass (Klo coaching responses)

### Test X.2 — No console errors or warnings
- [ ] DevTools console is clean across every page
- [ ] No React key warnings
- [ ] No "controlled/uncontrolled component" warnings
- [ ] No 404s in network tab

### Test X.3 — Performance
- [ ] Dashboard FCP < 1.5s on 4G throttle
- [ ] Sidebar with 30 deals: no lag scrolling
- [ ] Switching between deals via sidebar feels instant

## Cleanup before merging to main

After all tests pass on the preview branch, do the cleanup that was deferred during the sprints:

### Files to delete
- `src/components/DealRoom.jsx` — replaced by `src/pages/DealRoomPage.jsx`
- `src/components/OverviewView.jsx` — replaced by `src/components/deal/OverviewTab.jsx`
- `src/components/DailyFocusBanner.jsx` — replaced by `KloFocusCard`
- `src/pages/TeamPage.jsx` — split into `ManagerHomePage` + separate route pages

### Imports to update
Search the codebase for any remaining imports of the deleted files. Update them or remove the dead code.

### Final commit
- One commit titled "phase 6 cleanup: remove deprecated UI components"
- Push
- Verify Vercel preview build still passes
- Open PR with title "Phase 6 — Desktop-first responsive redesign"

## When the PR merges

You've shipped Phase 6. The product looks and feels different. Time to:

1. **Use it for 2-3 days on real conversations.** The new layout will reveal things the old one hid.
2. **Show it to ONE Gulf B2B sales person.** Watch them use it. Note where they get stuck.
3. **Then decide Phase 7** — likely "wire up Snooze/Mark done/Draft email" since those are visible affordances users will ask about.

→ Phase 6 complete.
