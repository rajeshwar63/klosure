# Step 10 — Acceptance walkthrough

**Goal:** Verify Phase 6.1 sprint by sprint before merging to main.

## Pre-flight

```powershell
cd C:\Users\rajes\Documents\klosure
git fetch
git checkout claude/phase-6-1-polish
git pull
```

Step 08 changes the extraction prompt and tool schema. Deploy `klo-respond` after Sprint B is complete:

```powershell
supabase functions deploy klo-respond --no-verify-jwt
```

No SQL migration. No cache table changes.

## Sprint A — Quick fixes

### Test A.1 — Sidebar width
- [ ] At ≥ 1024px: sidebar is 260px wide (visibly wider than before)
- [ ] At 768-1023px: sidebar is 200px wide
- [ ] Long deal titles fit without truncating
- [ ] No horizontal overflow

### Test A.2 — Type sizing
- [ ] Open the DIB deal page
- [ ] Blocker text is comfortably readable (~14px)
- [ ] Commitment task text matches
- [ ] "since Apr 25" timestamps are 12px and clearly readable
- [ ] Klo recommends body is 15px and reads well
- [ ] No layout breakage

### Test A.3 — History tab removed
- [ ] Tab strip shows only Overview and Chat
- [ ] No History tab anywhere
- [ ] If you previously visited History (localStorage had 'history'), the page now loads Overview safely
- [ ] No console errors about HistoryTab imports

## Sprint B — Substantive UX

### Test B.1 — "Stuck for" calculation
- [ ] DIB deal shows "Stuck for N weeks" with N > 0 (no longer says 0 weeks)
- [ ] Subtitle shows real "since {date}"
- [ ] Red text appears when ≥ 2 weeks
- [ ] A clean deal (confidence ≥ 60) shows "Not stuck" without red
- [ ] A brand-new deal with no history shows "—" gracefully

### Test B.2 — Promoted Commitments
- [ ] Open the DIB deal Overview
- [ ] Two-column hero: Klo recommends on left, Commitments on right
- [ ] Both zones (What we're doing / Needed from buyer) visible
- [ ] Below: ConfidenceCompactStrip showing "+ KLO'S CONFIDENCE  42%  stable"
- [ ] Click strip → expands with rationale + factors
- [ ] Mobile: collapses to single column with Commitments below Klo recommends

### Test B.3 — Stakeholders panel
- [ ] Lower row shows Blockers + Stakeholders side-by-side
- [ ] DIB stakeholders panel: Nina, Ahmed, Unknown · Head of TM, Raja
- [ ] Buyer-side group labeled "BUYER SIDE · Dubai Islamic Bank"
- [ ] Seller-side group labeled appropriately
- [ ] Avatars show first-letter initials (N, A) and "?" for unknown
- [ ] Last-spoke text under each buyer-side person reflects actual recent message data
- [ ] "Unknown · Head of Talent Management — not yet identified" rendered correctly
- [ ] + Add button visible but disabled with tooltip
- [ ] Empty state ("No people identified yet") on a brand new deal

### Test B.4 — Recency strip
- [ ] Strip appears between DealContextStrip and the two-column hero
- [ ] Three items: buyer last spoke, you last sent, last meeting
- [ ] If buyer silent ≥ 5 days, that value shows in red with weight 500
- [ ] "never" gracefully shown for missing data
- [ ] Mobile: items wrap onto multiple lines without overflow

### Test B.5 — Next meeting extraction
- [ ] Send chat: "Demo confirmed for Monday at 4pm with Ahmed"
- [ ] Verify in SQL after Klo responds:
  ```sql
  select klo_state->'next_meeting' from deals where id = 'dd7c0455-...';
  ```
- [ ] Result has structured object with date, title, with[Ahmed], confidence: 'definite'
- [ ] Send "Maybe a call sometime next week?"
- [ ] next_meeting updated to tentative call
- [ ] Send "We just finished the demo — they want to do a follow-up next week"
- [ ] next_meeting updated to follow-up; last_meeting populated with the demo

### Test B.6 — Next meeting chip
- [ ] After step B.5, deal header shows the chip "📅 Next: Mon 4:00 PM · Demo with Ahmed"
- [ ] Chip is solid blue for definite, lighter blue for tentative
- [ ] Tooltip shows on hover for tentative
- [ ] No chip when next_meeting is null
- [ ] Mobile: chip wraps below title

## Cross-cutting

### Test X.1 — No regression
- [ ] All Phase 6 acceptance tests still pass
- [ ] Klo extraction still produces all the existing fields (people, blockers, decisions, open_questions, confidence, etc.)
- [ ] Buyer view (incognito + share link): no confidence, no factors, no × buttons, but stakeholders panel and recency strip still render appropriately

### Test X.2 — No console errors
- [ ] DevTools console clean across every page

### Test X.3 — Mobile (375px)
- [ ] All new sections render without horizontal overflow
- [ ] Stakeholders panel readable
- [ ] Recency strip wraps cleanly
- [ ] Next meeting chip wraps below title

## When all tests pass

Phase 6.1 ships. The deal page now answers "what's the state of this relationship" in 5 seconds:

- **Stakeholders panel** answers "who"
- **Recency strip** answers "when did we last talk"
- **Stuck for** answers "how long has this been stale"
- **Commitments at top** answers "what's on whose plate"
- **Next meeting chip** answers "what am I prepping for"

Cleanup:
- Delete `src/components/deal/ConfidenceSidePanel.jsx` (replaced by ConfidenceCompactStrip)
- Delete `src/components/deal/HistoryTab.jsx`
- Update any stale imports

→ Phase 6.1 complete.
