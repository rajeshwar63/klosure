# Step 02 — App shell layout

**Sprint:** A
**Goal:** A shell component that wraps every page with the sidebar on the left and content on the right. Handles responsive collapse to drawer on mobile.

## Files

- `src/components/shell/AppShell.jsx` — new
- `src/components/shell/MobileTopBar.jsx` — new (only visible on mobile)

## AppShell structure

```jsx
<AppShell role="seller" activeView="today" deals={deals} user={user}>
  {/* page content goes here */}
</AppShell>
```

Inside, the layout is a CSS grid:

```jsx
<div className="app-shell">
  <Sidebar
    role={role}
    activeView={activeView}
    deals={deals}
    user={user}
    collapsed={collapsed}
    onCollapseToggle={...}
    onNavigate={navigate}
    className="app-shell-sidebar"
  />
  <main className="app-shell-main">
    {/* mobile-only top bar */}
    <MobileTopBar onMenuOpen={() => setMobileSidebarOpen(true)} />
    {children}
  </main>
  {mobileSidebarOpen && (
    <MobileDrawer onClose={() => setMobileSidebarOpen(false)}>
      <Sidebar role={role} activeView={activeView} deals={deals} user={user} onNavigate={...} />
    </MobileDrawer>
  )}
</div>
```

## Responsive breakpoints

Three breakpoints, using Tailwind defaults:

| Width | Sidebar behavior |
|---|---|
| ≥ 1024px (lg) | Visible by default, can collapse via toggle |
| 768-1023px (md) | Visible by default, takes more screen %, can collapse |
| < 768px (sm) | Hidden by default, hamburger opens it as a slide-over drawer |

Tailwind classes on the layout container:

```jsx
<div className="grid h-dvh overflow-hidden lg:grid-cols-[220px_1fr] md:grid-cols-[180px_1fr] grid-cols-1">
```

On mobile (< 768px), `grid-cols-1` makes the sidebar effectively absent from the grid; it only appears via the drawer overlay.

## Mobile top bar

On mobile only, a small top bar appears with:
- Hamburger icon on the left → opens the drawer
- Centered: current page name ("Today" / "Dubai Islamic Bank" / "Forecast")
- Right side: empty for now (avatar/menu can come later)

Tailwind: `md:hidden` — hidden at 768px and above.

```jsx
<div className="md:hidden flex items-center justify-between p-3 border-b border-tertiary">
  <button onClick={onMenuOpen} aria-label="Open menu">
    <HamburgerIcon />
  </button>
  <span className="font-medium text-sm">{pageTitle}</span>
  <span className="w-6" />
</div>
```

## Mobile drawer

A slide-in overlay containing the same Sidebar component:

```jsx
function MobileDrawer({ children, onClose }) {
  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 md:hidden"
        onClick={onClose}
      />
      <aside className="fixed left-0 top-0 bottom-0 w-[280px] bg-white z-50 md:hidden overflow-y-auto">
        <button onClick={onClose} className="p-3" aria-label="Close menu">×</button>
        {children}
      </aside>
    </>
  );
}
```

When a deal or nav item is selected from inside the drawer, also call `onClose` so the drawer closes after navigation.

## Locking the page to viewport height

The shell uses `h-dvh` (dynamic viewport height) so it always fits the screen — no double-scrollbars, no chrome creep on iOS.

The sidebar and main content are independently scrollable inside their grid cells:

```css
.app-shell-sidebar { overflow-y: auto; }
.app-shell-main { overflow-y: auto; min-width: 0; } /* min-width: 0 prevents grid blow-out */
```

## Dark navbar at top of `.app-shell-main`?

No global dark header. Each page renders its own header inside the main content area as needed (the deal page has the dark deal header; the seller home and manager home have a lighter "Good morning, Raja." style header).

This keeps the shell unopinionated — a frame, not a brand expression.

## Page title resolution for the mobile top bar

The shell needs to know the current page title. Pass it as a prop:

```jsx
<AppShell role="seller" activeView="today" pageTitle="Today" deals={deals} user={user}>
```

The page itself is responsible for telling the shell its title.

## Acceptance

- [ ] At ≥ 1024px: sidebar visible, 220px wide, collapse toggle works
- [ ] At 768-1023px: sidebar visible, ~180px wide
- [ ] At < 768px: sidebar hidden, hamburger top bar visible
- [ ] Tap hamburger on mobile → drawer slides in with sidebar inside
- [ ] Tap drawer backdrop or × → drawer closes
- [ ] Tap a deal in the drawer → drawer closes AND navigates
- [ ] No double scrollbars at any width
- [ ] On iOS PWA: shell fills the screen correctly, no white space at the top or bottom
- [ ] Sidebar collapse on desktop hides nav and deal labels but keeps color dots clickable
- [ ] Mobile top bar shows the current page title

→ Next: `03-route-restructure.md`
