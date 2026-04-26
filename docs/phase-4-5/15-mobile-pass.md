# Step 15 — Mobile pass at 375px

**Goal:** Verify the new Overview, tooltips, and × flow all work cleanly at iPhone SE width (375px).

This is a manual pass with small CSS fixes as needed. Should not require structural changes.

## What to check

Open https://klosure.vercel.app on:
- DevTools device emulation set to iPhone SE (375 × 667)
- Or a real phone

For a deal with `klo_state` populated, verify each section:

### Klo's take
- Text wraps cleanly
- Doesn't get clipped
- Padding/margins not cramped

### Stat strip
- Collapses to 2x2 (already works in Phase 3.5 — verify still works)
- Tentative dates show "(tentative)" without overflow
- "was June 1" amber subtext fits underneath

### People grid
- Becomes 2 columns
- × button is tappable (min 24×24px target)
- Avatar + name + role fit; long names truncate with ellipsis, not overflow

### Blockers list
- Each item one row; long text wraps, doesn't clip
- × button right-aligned, tappable

### Open questions (seller only)
- Same as blockers

### Provenance tooltips
- Long-press for 500ms shows the tooltip
- Tooltip doesn't overflow the viewport — clamps to within 4px of edges
- Tooltip is dismissable (tap elsewhere)

### × button reason input
- Inline input is full-width on mobile (not the desktop ~200px width)
- Submit/Cancel buttons stack below the input on narrow widths

## Common fixes you may need

```css
/* If tooltip overflows viewport on the right */
.tooltip-bubble {
  max-width: min(280px, calc(100vw - 32px));
  right: auto;
  left: 50%;
  transform: translateX(-50%);
}

/* If × button is too small to tap */
.remove-btn {
  min-width: 24px;
  min-height: 24px;
  padding: 4px 8px;
}

/* If reason input cramps on mobile */
.remove-prompt {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
```

## Acceptance

- Every section renders cleanly at 375px
- All buttons are tappable (no rage-tap-required moments)
- No horizontal scroll on the page
- Tooltips work via long-press and stay within the viewport
- × reason flow is usable with thumbs

→ Next: `16-acceptance-walkthrough.md`
