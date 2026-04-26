# Step 01 — Sidebar width

**Sprint:** A (Quick fixes)
**Goal:** Bump the desktop sidebar from 220px to 260px so deal titles stop truncating.

## Files

- `src/components/shell/AppShell.jsx` — grid template change
- `src/components/shell/Sidebar.jsx` — adjust internal layout if needed

## The change

Find the grid template column definition that's currently:

```jsx
className="grid h-dvh overflow-hidden lg:grid-cols-[220px_1fr] md:grid-cols-[180px_1fr] grid-cols-1"
```

Change to:

```jsx
className="grid h-dvh overflow-hidden lg:grid-cols-[260px_1fr] md:grid-cols-[200px_1fr] grid-cols-1"
```

The 40px increase on desktop lets typical deal titles ("Dubai Islamic Bank — LXP", "Acme Corp — Skills Cloud") fit without truncation. The 20px increase on tablet helps too.

## Mobile drawer stays 280px

The mobile drawer is independent of the desktop sidebar width — keep it at 280px.

## What this affects

- Sidebar nav items get a bit more horizontal breathing room (no change needed)
- Deal rows in the sidebar fit longer titles without truncating
- Confidence number on the right of each deal row stays right-aligned (no change needed)

## What this does NOT affect

- The deal page content area — it just gets 40px less wide, which doesn't matter at desktop sizes (still ≥1180px on a 1440px screen)
- The mobile layout — sidebar is hidden via drawer at < 768px

## Acceptance

- [ ] At ≥ 1024px the sidebar is 260px wide
- [ ] At 768-1023px the sidebar is 200px wide
- [ ] Long deal titles like "Dubai Islamic Bank — LXP" fit without truncating
- [ ] No horizontal overflow at any breakpoint
- [ ] No regression to drawer behavior on mobile

→ Next: `02-type-sizing-pass.md`
