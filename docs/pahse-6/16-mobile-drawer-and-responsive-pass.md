# Step 16 — Mobile drawer + full responsive pass

**Sprint:** E
**Goal:** Walk every page at 375px and confirm it works as a PWA. Polish the mobile drawer animation. Fix any layout issues that emerged during the desktop-first build.

## Files

- `src/components/shell/MobileDrawer.jsx` — animation polish
- Cross-cutting CSS pass for any layout that broke on small screens

## Mobile drawer animation

The drawer should slide in from the left, not just appear. Add a CSS transition:

```jsx
function MobileDrawer({ children, onClose, isOpen }) {
  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 z-40 md:hidden transition-opacity ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ transitionDuration: '180ms' }}
      />
      <aside
        className={`fixed left-0 top-0 bottom-0 w-[280px] bg-white z-50 md:hidden overflow-y-auto transition-transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ transitionDuration: '220ms', transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <div className="flex justify-end p-3">
          <button onClick={onClose} aria-label="Close menu" className="text-2xl leading-none">×</button>
        </div>
        {children}
      </aside>
    </>
  );
}
```

The drawer is always in the DOM (just translated off-screen when closed) so the animation is smooth in both directions. `pointer-events-none` on the backdrop when closed prevents accidental taps.

## Body scroll lock when drawer is open

```javascript
useEffect(() => {
  if (isOpen) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
  return () => { document.body.style.overflow = ''; };
}, [isOpen]);
```

Otherwise, scrolling the drawer can leak through to the main page content.

## Responsive pass — page by page

### Seller home (`/today`) at 375px
- [ ] Header reads cleanly: date + "Good morning, Raja."
- [ ] KloFocusCard padding: ~20px (down from 28px)
- [ ] KloFocusCard headline: drops from 22px to 20px
- [ ] KloFocusCard buttons: stack if total width > viewport
- [ ] NeedsYouTodayList rows: title + subtitle stack OK, Open button stays right-aligned
- [ ] PipelineGlanceStrip: 3 cards fit side-by-side (compact numbers)

### Deal page (`/deals/:id`) at 375px
- [ ] DealHeader: title + Stuck pill + buttons fit; on very narrow screens, buttons may wrap below
- [ ] DealTabs: 3 tabs fit horizontally
- [ ] OverviewTab: two-column grid (`lg:grid-cols-[1.5fr_1fr]`) collapses to single column
- [ ] KloRecommendsCard above ConfidenceSidePanel when stacked
- [ ] DealStatStripWide: collapses from 5 columns to 2-3 columns (`grid-cols-2 md:grid-cols-5`)
- [ ] BlockersPanel + CommitmentsPanel: stack vertically (`grid-cols-1 md:grid-cols-2`)

### Manager home (`/team`) at 375px
- [ ] Same vertical stack as seller home
- [ ] DealsSlippingList rows: confidence number + trend take fixed left width (~36px), middle truncates, Open stays right
- [ ] QuarterGlanceStrip: 3 buckets side-by-side, compact

### Sidebar (when triggered via mobile drawer)
- [ ] 280px wide (slightly wider than desktop's 220px, since it's an overlay)
- [ ] All deal rows + nav items + footer fit without horizontal scroll
- [ ] Tap any item closes the drawer AND navigates

## iOS PWA-specific checks

If you have an iPhone, install the PWA fresh (delete + add to home screen) and test:

- [ ] Status bar doesn't overlap content (Phase 5.5 fix should still apply)
- [ ] Bottom safe area: floating buttons (if any remain) sit above home indicator
- [ ] Keyboard: tapping inputs doesn't push content under the keyboard
- [ ] Swipe gesture from left edge: doesn't trigger browser back AND drawer simultaneously (this is a known iOS quirk; if it does, consider adding `touch-action: pan-y` to main content areas)
- [ ] Pull-to-refresh on dashboard: doesn't cause weird behavior

## Touch target sizes

Make sure every tappable element is at least 36×36px on mobile:

- Sidebar deal rows: pad them out if they're tighter than that
- Tab buttons in the deal page: should already be tall enough due to padding
- Open buttons in lists: 36px tall minimum
- Sidebar nav items: 36px tall minimum
- Hamburger icon: 44×44 tap target (24px icon + 10px padding each side)

## Cross-page consistency check

After all the above, do one final pass clicking through every page on both desktop AND mobile to confirm:

- [ ] Sidebar selection state correctly reflects current URL
- [ ] Page titles in mobile top bar match the URL
- [ ] Navigation feels fluid — no flashes, no double-renders, no misaligned content
- [ ] Loading skeletons appear in the right places
- [ ] Empty states appear in the right places

## Performance pass

- [ ] First Contentful Paint on dashboard < 1.5s on 4G throttle
- [ ] Sidebar deal list with 30 deals doesn't lag (it should be a simple list with no heavy renders)
- [ ] Switching between deals via sidebar feels instant (might want a small transition or shimmer if data takes >300ms)

## Acceptance

- [ ] Mobile drawer slides in/out with smooth animation
- [ ] Body scroll locks while drawer open
- [ ] Every page renders correctly at 375px, 768px, 1024px, 1440px
- [ ] iOS PWA: status bar, keyboard, safe areas all correct
- [ ] All touch targets meet 36×36 minimum
- [ ] No layout breakage at any breakpoint

→ Next: `17-acceptance-walkthrough.md`
