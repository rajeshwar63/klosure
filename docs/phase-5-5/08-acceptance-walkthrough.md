# Step 08 — Acceptance walkthrough

**Goal:** Verify each sprint with a manual checklist before declaring Phase 5.5 done.

## Pre-flight

```powershell
cd C:\Users\rajes\Documents\klosure
git pull
npm install   # in case any new deps were added
```

No SQL migrations. No Edge Function deploys. Pure frontend — Vercel auto-deploys after push.

After Vercel build succeeds (~60 seconds), continue.

## Sprint A — Today's focus

### Test A.1 — First load is expanded
- [ ] Clear localStorage in DevTools (or use incognito)
- [ ] Open the dashboard fresh
- [ ] Today's focus banner is **expanded** showing the full paragraph

### Test A.2 — Collapse and persist
- [ ] Click the chevron to collapse
- [ ] Banner shrinks to a single sentence headline
- [ ] Refresh the page
- [ ] Banner stays **collapsed** (today's date is stored in localStorage)

### Test A.3 — Manual expand
- [ ] Tap the headline (or the chevron)
- [ ] Banner expands again
- [ ] Refresh — stays collapsed (manual expand doesn't clear the stored date)

### Test A.4 — Auto-collapse on scroll
- [ ] Clear localStorage so banner starts expanded
- [ ] Scroll down past the banner
- [ ] Scroll back up
- [ ] Banner is now **collapsed** (auto-collapsed when scrolled past)

### Test A.5 — Next-day reset
- [ ] In DevTools → Application → Local Storage, edit `klosure:focusBanner:lastCollapsedDate` to yesterday's date
- [ ] Refresh
- [ ] Banner is **expanded** again

### Test A.6 — Headline quality
- [ ] The collapsed headline is the first sentence of Klo's paragraph
- [ ] If Klo's first sentence is >80 chars, it truncates with `…`
- [ ] No markdown asterisks visible (`**DIB**` becomes `DIB`)

## Sprint B — Chat

### Test B.1 — Sticky header (step 02)
- [ ] Open a deal with 30+ messages
- [ ] Scroll up to read older messages
- [ ] Deal title bar stays visible at the top
- [ ] Scroll back down — header still pinned

### Test B.2 — Sticky input (step 02)
- [ ] In the same long chat, scroll up
- [ ] The reply input stays at the bottom of the viewport
- [ ] Try typing — input is reachable without scrolling to bottom first

### Test B.3 — Auto-scroll on new message (step 02)
- [ ] At the bottom of the chat, send a message
- [ ] Chat scrolls smoothly to your new message
- [ ] Klo's reply lands at the bottom — auto-scroll continues

### Test B.4 — No auto-scroll while reading history (step 02)
- [ ] Scroll up to mid-chat
- [ ] Klo sends a new message (or you send one)
- [ ] Chat does **not** yank you back to the bottom — you stay where you were reading
- [ ] (Optional: a small "↓ N new" pill appears for jumping to bottom)

### Test B.5 — Auto-expanding textarea (step 03)
- [ ] Empty input is one line
- [ ] Type a long message — input grows line by line
- [ ] At 4 lines, input stops growing and content scrolls inside
- [ ] Press Enter — message sends, input shrinks to 1 line
- [ ] Press Shift+Enter — newline added, no send

### Test B.6 — Send button states (step 03)
- [ ] Send button disabled when input is empty
- [ ] Disabled while sending (no double-send)
- [ ] Enabled when text is present

### Test B.7 — Compact pill chip (step 04)
- [ ] Open any deal — header shows compact chip with health icon, status, days, buyer
- [ ] Tap the chip — full pill row expands
- [ ] Tap the collapse chevron — returns to compact
- [ ] Navigate to another deal — header shows compact chip again (no persistence between navigations)

### Test B.8 — iOS PWA chat
- [ ] On iPhone PWA: open a deal
- [ ] Tap the input — keyboard pops up
- [ ] Input stays visible above the keyboard
- [ ] Type a long message — textarea expands without input getting hidden
- [ ] Send — works as expected

## Sprint C — Overview

### Test C.1 — Merged Klo's read panel (step 05)
- [ ] Open any deal Overview
- [ ] See ONE combined panel at the top with: ◆ KLO'S READ tag, score (e.g. 42%), trend chip, the seller's coaching paragraph, the rationale, and "What would move this score up" with factors
- [ ] No standalone "Klo's take" card above
- [ ] No standalone confidence panel below

### Test C.2 — Buyer view on merged panel
- [ ] Open the same deal as buyer (incognito + share link)
- [ ] Klo's read panel shows ONLY the Klo tag and the buyer-side coaching paragraph
- [ ] No score, no trend, no factors, no rationale

### Test C.3 — Default expanded states (step 06)
- [ ] Open a deal Overview (clear localStorage first)
- [ ] Klo's read: visible
- [ ] Commitments section: **expanded**
- [ ] Deal facts section: **collapsed** (with headline like "Proposal · $20k · 36d · At risk")
- [ ] People section: **collapsed** (with count + first 2 names)
- [ ] Blockers section: **collapsed** (with count + first 2 blocker headlines)
- [ ] Decisions section: **collapsed** (with count + first decision)
- [ ] Open questions section: **collapsed** for seller; **not rendered** for buyer

### Test C.4 — Toggle sections
- [ ] Tap any collapsed section header → expands
- [ ] Tap again → collapses
- [ ] Headline shows correct summary when collapsed (e.g. "People (3) · Nina, Ahmed, +1 unknown")

### Test C.5 — Empty sections
- [ ] On a deal with 0 blockers: Blockers row still appears, says "(0)" — when expanded, shows "No blockers — keep it that way"
- [ ] On a deal with 0 decisions: same pattern with the appropriate empty message

### Test C.6 — Per-deal persistence (step 07)
- [ ] On DIB deal: collapse Commitments, expand People
- [ ] Refresh the page
- [ ] Commitments stays collapsed; People stays expanded
- [ ] Navigate to a different deal
- [ ] That deal's sections follow ITS own state (or defaults, if you've never touched it)
- [ ] Navigate back to DIB
- [ ] DIB's customizations preserved

### Test C.7 — Storage check
- [ ] Open DevTools → Application → Local Storage
- [ ] See `klosure:overviewSections:{deal-uuid}` entries for deals you've customized
- [ ] Each value is a small JSON object with section keys mapped to bools

## Cross-cutting tests

### Test X.1 — Mobile (375px)
- [ ] Dashboard: collapsed daily focus is one tappable row, no horizontal overflow
- [ ] Chat: header pinned, input pinned, textarea expands within mobile viewport
- [ ] Compact pill chip: fits one line on mobile
- [ ] Overview: collapsible section headers wrap if needed; chevrons stay at right edge
- [ ] Klo's read panel: stacks vertically on narrow viewports (score+trend on top, text below)

### Test X.2 — No regression
- [ ] All Phase 5 tests still pass (confidence appears, dashboard sort, daily focus banner, manager forecast)
- [ ] All Phase 4.5 tests still pass (Klo extraction, × removal, provenance, buyer view, "what changed?")
- [ ] All Phase 4 tests still pass (Stripe upgrade, manager pipeline, archive)
- [ ] All Phase 3 tests still pass (commitments propose/confirm/done, watcher nudges)

### Test X.3 — Stream / realtime
- [ ] In the chat: a Klo reply lands and auto-scrolls (assuming you're at the bottom)
- [ ] In the Overview: Klo state updates show in collapsed section headlines (e.g. People count changes from 3 to 4 after a new person added)
- [ ] Daily focus banner: when you click "refresh", new content streams in

### Test X.4 — Performance
- [ ] Dashboard loads in under 2 seconds on a fresh page load
- [ ] Switching between Chat and Overview tabs is near-instant
- [ ] Expanding/collapsing sections is smooth (no jank, no layout shift)

## When all relevant tests pass

You've shipped Phase 5.5. Klosure now feels like a product, not a wall of features.

The next conversation is genuinely about what to build next — but the answer should come from real use, not specs. Use Klosure for a few days. Watch what feels good and what feels broken. Then we talk Phase 6.

→ Phase 5.5 complete.
