# Step 02 — Type sizing pass

**Sprint:** A
**Goal:** Bring small body text up to readable sizes across the deal page. The 12px floor for body content.

## The principle

**12px is the absolute floor for body text.** Anything smaller is decorative metadata only — caps-treated section labels, timestamps, supporting hints.

The current Phase 6 deal page has body text at 11-12px in too many places. This pass bumps it up where it matters.

## Files affected

- `src/components/deal/BlockersPanel.jsx`
- `src/components/deal/CommitmentsPanel.jsx`
- `src/components/deal/KloRecommendsCard.jsx`
- `src/components/deal/ConfidenceSidePanel.jsx`
- `src/components/deal/DealStatStripWide.jsx`
- `src/components/deal/DealContextStrip.jsx`

## Specific changes

### BlockersPanel
- Section header `BLOCKERS · 4`: 11px → 12px
- Blocker text (the actual blocker description): 12px → 14px
- "since Apr 25" timestamps: 10px → 12px
- Severity dot stays small (1.5px / 6px)

### CommitmentsPanel
- Section header `COMMITMENTS · 1`: 11px → 12px
- Zone label "What we're doing" / "Needed from buyer": 10px → 12px
- Commitment task text: 12px → 14px
- Overdue badge "Overdue 3d": 10px → 11px
- Assignee name "Raja": 10px → 12px

### KloRecommendsCard
- Headline: stays at 18-20px (already correct)
- Body paragraph: 14px → 15px
- Tag "+ KLO RECOMMENDS": stays at 10px (caps treatment, decorative)
- "DO THIS NEXT": stays at 10px (decorative)
- Button text: stays at 12px (correct for buttons)

### ConfidenceSidePanel
- Section labels `CONFIDENCE TO CLOSE`, `WHAT WOULD MOVE IT UP`: stay at 10px (caps treatment)
- Score number "42%": stays at 32-36px (already correct)
- "stable" trend chip: stays at 11px
- Factor row text "Send proposal today": 11px → 12px
- "+18%" pill: stays at 11px

### DealStatStripWide
- Column labels `STAGE`, `VALUE`, etc.: stay at 9px (decorative caps)
- Main values "Proposal", "$20,000", "Jun 1": stays at 14px (already correct)
- Subtitles "2 of 5", "tentative", "36 days": 9px → 11px

### DealContextStrip
- Body text: 12px → 13px
- "Show more" link: 12px → 13px

## Why these specific bumps

The pattern: **information that the user is actively reading needs to be ≥12px.** Caps-treated metadata labels (CONFIDENCE TO CLOSE, BLOCKERS · 4) are scanned, not read — those can stay at 10-11px because the type treatment itself signals "this is a label."

But blocker text and commitment text are *content* — the user is reading specific words to understand specific situations. 12px is too small for that. 14px is the right body size.

## Mobile

These same sizes apply on mobile. We don't need separate mobile sizing for this — body content needs to be at least 14px regardless of device.

## Acceptance

- [ ] Open the DIB deal page on desktop
- [ ] Blocker text ("Proposal not yet sent — overdue, demo with Ahmed is Monday") is comfortably readable, ~14px
- [ ] Commitment task text is the same readable size
- [ ] Timestamps under blockers ("since Apr 25") are 12px and clearly readable
- [ ] Section headers (caps treatment) remain visually distinct from body text
- [ ] Klo recommends card body text reads well at 15px
- [ ] No layout breakage from increased text sizes (text wrapping where appropriate, no overflow)
- [ ] Mobile (375px): no horizontal overflow despite slightly larger text

→ Next: `03-remove-history-tab.md`
