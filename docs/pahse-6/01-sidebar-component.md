# Step 01 — Sidebar component

**Sprint:** A (App shell)
**Goal:** A new `<Sidebar>` component that lists the current view's nav items and the user's deals. Used identically on the seller home, deal page, and manager home — same component, different content.

## Layout

The sidebar is 220px wide on desktop. It contains, top-to-bottom:

1. **Logo + collapse toggle** — "Klosure" text, "‹" button to collapse the sidebar
2. **Top nav items** — short list of primary destinations for the current role:
   - **Seller view:** ◆ Today, Deals
   - **Manager view:** ◆ This week, Forecast, Reps, Ask Klo
3. **My deals** section header — small caps label
4. **Deal list** — every active deal as a row, color dot + name + confidence number
5. **Footer** — user avatar, name, "Team →" link (sellers) or "Mgr" badge (managers)

## Files

- `src/components/shell/Sidebar.jsx` — new
- `src/components/shell/SidebarDealRow.jsx` — new
- `src/components/shell/SidebarNavItem.jsx` — new

## Component API

```jsx
<Sidebar
  role="seller"               // or "manager"
  activeView="today"          // 'today' | 'deals' | 'deal:{id}' | 'forecast' | 'reps' | 'askklo'
  deals={deals}               // array of deal objects with klo_state
  user={user}                 // for the footer
  onNavigate={(view) => ...}  // handles all nav clicks
  collapsed={false}           // optional — for the collapsed thin-strip mode
  onCollapseToggle={() => ...}
/>
```

## SidebarDealRow

Each row in the deal list:

```jsx
<SidebarDealRow
  deal={deal}
  isActive={dealId === currentDealId}
  showSubtitle={isActive}     // active deal shows extra detail (stage · time · count)
  onClick={() => navigate(`/deals/${deal.id}`)}
/>
```

Row content when inactive:
```
● Dubai Islamic Bank                    42
```
(6px color dot · deal title · confidence number on the right)

Row content when active:
```
● Dubai Islamic Bank                    42
  Stuck · 5w · 1 overdue
```
Selected row gets a white background + 0.5px border to make it visually pop from the rest.

## Color dot logic

The 6px dot color encodes deal health:
- Green (`#639922`): on track (confidence ≥ 60)
- Amber (`#BA7517`): stuck or slipping (confidence 30-59 OR slipping ≥ 10pts)
- Red (`#A32D2D`): at risk (confidence < 30 OR multiple overdue)

If `klo_state.confidence` is null (new deal), use gray (`#888780`).

## Confidence number on the right

Show the confidence value as a 2-digit integer, no `%`. Color matches the dot:
- Green text for ≥ 60
- Amber text for 30-59
- Muted gray for unknown or stable on the active row

If null, show no number.

## Collapsed state

When `collapsed={true}`, the sidebar shrinks to ~52px wide. Only the color dots are visible (no names, no numbers). Hover any dot → tooltip shows the deal name. Click → navigates to that deal.

This is for sellers who want maximum reading space on the deal page. Hide the entire nav section in collapsed mode — only the deal list dots remain.

The collapse toggle button (`‹` / `›`) lives at the top of the sidebar.

## Active state highlighting

Whichever item matches `activeView` gets:
- For nav items: blue tint background (`var(--color-background-info)`), blue text
- For deal rows: white background with 0.5px border + extra subtitle line

Make sure both can never be "active" at the same time. If `activeView === 'deal:dd7c0455-...'`, no top-level nav item is highlighted; if `activeView === 'today'`, no deal row is highlighted.

## Sorting deals in the sidebar

Sort by confidence ascending (worst first), so the deals that need attention float to the top of the list. Tiebreak by most-recent-update.

This is intentionally inverted from the dashboard sort (which used confidence descending). The sidebar is a "what needs my attention" surface; the dashboard is a "where am I winning" surface.

## Empty state

If the seller has 0 active deals:
- Show "No active deals yet" placeholder under "My deals"
- A small "+ New deal" button below it

## Acceptance

- [ ] Sidebar renders with logo, collapse toggle, top nav, "My deals" section, deal list, footer
- [ ] Active nav item is highlighted; inactive items look secondary
- [ ] Active deal row shows extra subtitle; inactive rows show one line
- [ ] Deal rows sort worst-confidence-first
- [ ] Color dots match the health logic above
- [ ] Confidence number colors match the dot
- [ ] Click any nav item → calls `onNavigate('today')` etc.
- [ ] Click any deal row → calls `onNavigate('deal:{id}')`
- [ ] Click collapse toggle → sidebar shrinks; click again → expands
- [ ] Empty state for sellers with no deals shows the placeholder
- [ ] Manager-role sidebar shows the manager nav items, not seller ones

→ Next: `02-app-shell-layout.md`
