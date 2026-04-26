# Step 03 — Route restructure

**Sprint:** A
**Goal:** Update the app's routing so every page is wrapped in the `AppShell`. Add the new top-level routes for the home pages.

## Files

- `src/App.jsx` (or wherever React Router is configured) — restructure routes
- New page entry components — placeholder shells, content fills in later sprints

## New route structure

| Route | Component | Role | Notes |
|---|---|---|---|
| `/` | redirects to `/today` if seller, `/team` if manager | both | smart default |
| `/today` | `<SellerHomePage />` | seller | the new seller home (Sprint B) |
| `/deals` | `<DealsListPage />` | seller | existing — keep accessible but secondary |
| `/deals/:id` | `<DealRoomPage />` | both | redesigned in Sprint C |
| `/join/:token` | `<JoinDealPage />` | buyer | unchanged from Phase 4 |
| `/team` | `<ManagerHomePage />` | manager | the new manager home (Sprint D) |
| `/team/forecast` | existing `<ForecastTab />` rehoused | manager | unchanged content, new route |
| `/team/reps` | placeholder for now | manager | Phase 6 stub, future content |
| `/team/askklo` | existing `<AskKloTab />` rehoused | manager | unchanged content, new route |

## Wrapping every route in `AppShell`

```jsx
function AppRoutes() {
  const { user, role, activeDeals } = useUser();

  return (
    <Routes>
      <Route path="/" element={<RoleHomeRedirect role={role} />} />

      <Route element={<ShellWrapper role={role} deals={activeDeals} user={user} />}>
        <Route path="/today" element={<SellerHomePage />} />
        <Route path="/deals" element={<DealsListPage />} />
        <Route path="/deals/:id" element={<DealRoomPage />} />
        <Route path="/team" element={<ManagerHomePage />} />
        <Route path="/team/forecast" element={<ForecastPage />} />
        <Route path="/team/reps" element={<RepsPlaceholderPage />} />
        <Route path="/team/askklo" element={<AskKloPage />} />
      </Route>

      {/* Buyer flow stays outside the shell */}
      <Route path="/join/:token" element={<JoinDealPage />} />
    </Routes>
  );
}
```

`ShellWrapper` is a thin component that pulls `activeView` from the current URL and passes it to `AppShell`:

```jsx
function ShellWrapper({ role, deals, user }) {
  const location = useLocation();
  const activeView = resolveActiveView(location.pathname); // 'today' | 'deal:abc' | 'forecast' etc.
  const pageTitle = resolvePageTitle(location.pathname, deals);

  return (
    <AppShell role={role} activeView={activeView} pageTitle={pageTitle} deals={deals} user={user}>
      <Outlet />
    </AppShell>
  );
}
```

Adapt to whatever router setup the app already uses — could be React Router v6 Outlet pattern as above, or a wrapper hook, or layout routes.

## Helper functions

```javascript
function resolveActiveView(pathname) {
  if (pathname === '/today') return 'today';
  if (pathname === '/deals') return 'deals';
  if (pathname.startsWith('/deals/')) return `deal:${pathname.split('/')[2]}`;
  if (pathname === '/team') return 'thisweek';
  if (pathname === '/team/forecast') return 'forecast';
  if (pathname === '/team/reps') return 'reps';
  if (pathname === '/team/askklo') return 'askklo';
  return null;
}

function resolvePageTitle(pathname, deals) {
  if (pathname === '/today') return 'Today';
  if (pathname === '/deals') return 'Deals';
  if (pathname.startsWith('/deals/')) {
    const id = pathname.split('/')[2];
    const deal = deals.find(d => d.id === id);
    return deal?.title ?? 'Deal';
  }
  if (pathname === '/team') return 'This week';
  if (pathname === '/team/forecast') return 'Forecast';
  if (pathname === '/team/reps') return 'Reps';
  if (pathname === '/team/askklo') return 'Ask Klo';
  return 'Klosure';
}
```

## Where existing pages move

| Phase 5.5 file | What happens to it |
|---|---|
| `src/pages/DealsListPage.jsx` | Stays at `/deals` but no longer the home; the seller home is the new entry point |
| `src/components/DailyFocusBanner.jsx` | Logic moves into `<KloFocusCard>` (Sprint B); old component deleted |
| `src/components/DealRoom.jsx` | Replaced by `<DealRoomPage>` from Sprint C |
| `src/components/OverviewView.jsx` | Replaced by new Overview from Sprint C; the collapsible sections from Phase 5.5 are reused as supporting blocks |
| `src/components/ChatView.jsx` | Stays — but accessed via "Chat" tab on the deal page, not as the default view |
| `src/pages/TeamPage.jsx` | Replaced by `<ManagerHomePage>` (the home tab) and split into separate route pages for Forecast / Reps / Ask Klo |

## Don't delete anything yet

In this step, you create the new pages as placeholder shells:

```jsx
// pages/SellerHomePage.jsx (placeholder)
export default function SellerHomePage() {
  return (
    <div className="p-8">
      <h1 className="text-xl font-medium">Seller home — coming in Sprint B</h1>
    </div>
  );
}
```

The old pages still exist in the codebase. The old `DealsListPage.jsx` is still working — it's just no longer the default landing page. This keeps the app functional during the rebuild.

Cleanup of unused files happens at the end of the spec (see acceptance walkthrough).

## Acceptance

- [ ] Visit `/` as a seller → redirects to `/today` showing the placeholder
- [ ] Visit `/` as a manager → redirects to `/team`
- [ ] Visit `/today` → AppShell renders, sidebar visible, placeholder content shows
- [ ] Click a deal in the sidebar → navigates to `/deals/:id` with the existing deal room visible (still using old UI for now)
- [ ] All existing routes still resolve (Phase 5.5 deal page still loads)
- [ ] Buyer link `/join/:token` still works without the shell
- [ ] Mobile: hamburger top bar visible, sidebar accessible via drawer, navigation works
- [ ] No console errors

→ Next (Sprint B): `04-seller-home-page.md`
