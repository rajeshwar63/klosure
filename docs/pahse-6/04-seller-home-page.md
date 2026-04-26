# Step 04 — Seller home page shell

**Sprint:** B (Seller home)
**Goal:** Replace the placeholder from step 03 with the actual seller home page structure. Three sections stacked: Klo focus card, needs-you-today list, pipeline glance. Each is a sub-component that comes in steps 05-07.

## File

- `src/pages/SellerHomePage.jsx` — replace the placeholder with the real page

## Page structure

```jsx
import { useEffect, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { fetchDailyFocus } from '../services/dailyFocus';
import { getDealsForSeller } from '../services/dashboard';
import KloFocusCard from '../components/home/KloFocusCard';
import NeedsYouTodayList from '../components/home/NeedsYouTodayList';
import PipelineGlanceStrip from '../components/home/PipelineGlanceStrip';

export default function SellerHomePage() {
  const { user } = useUser();
  const [deals, setDeals] = useState(null);
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    getDealsForSeller(user.id).then(setDeals);
    fetchDailyFocus().then(setFocus);
  }, [user.id]);

  const greeting = getGreeting();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="seller-home p-6 md:p-8 max-w-[960px] mx-auto">

      <header className="mb-6">
        <div className="text-xs text-secondary mb-1">{today}</div>
        <h1 className="text-2xl font-medium">{greeting}, {user.name}.</h1>
      </header>

      <KloFocusCard focus={focus} loading={focus === null} />

      <NeedsYouTodayList deals={deals ?? []} />

      <PipelineGlanceStrip deals={deals ?? []} />

    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
```

## Layout

- **Container:** centered, max-width 960px. The home page is a focused reading surface — wider than this and it stops feeling like a briefing.
- **Padding:** generous on desktop (32px), tighter on mobile (24px).
- **Vertical rhythm:** ~24px gap between major sections (handled by `mb-6` on the children).

## Greeting header

The "Good morning, Raja." header is the only "personal" touch. It establishes that this is a daily ritual, not just a dashboard.

- Date in muted text, small: "Sunday, April 26"
- Greeting in primary text, 24px, weight 500: "Good morning, Raja."

The greeting changes with the time of day (morning/afternoon/evening) but the user's name is always the user's name. This is the same `users.name` that other components reference.

## Order of sections

1. **KloFocusCard** — the visual hero. The user reads this first.
2. **NeedsYouTodayList** — actionable items beyond Klo's #1 focus. The user reads this second.
3. **PipelineGlanceStrip** — context for the rest of the day's awareness. The user reads this third.

This is deliberate. If a user reads only the Klo focus card, they have what they need. If they go further, they get more context. The design rewards both deep reads and quick scans.

## Loading states

Each section handles its own loading internally. The page renders immediately with the greeting; sections show skeletons while their data loads. **Do not show a single full-page loader** — that breaks the feeling of opening to a useful page.

The greeting and date appear instantly. KloFocusCard fades in under 1 second. The deal list and pipeline strip stream in as `getDealsForSeller` resolves (usually < 500ms).

## Empty states (covered in step 15 in detail)

For now, just stub out the empty cases:
- No focus available: KloFocusCard shows its empty state
- No deals: NeedsYouTodayList and PipelineGlanceStrip both show "no deals yet" placeholders

## Mobile

At < 768px the page padding tightens to 24px and the max-width constraint is irrelevant (viewport is the limit). Sections stack the same way; the only mobile-specific change is the page title appearing in the mobile top bar (handled by `pageTitle="Today"` from `AppShell`).

## Acceptance

- [ ] Visit `/today` as a seller → see the greeting header with current date and name
- [ ] Greeting changes based on time of day (test at different times)
- [ ] All three sections render in order: KloFocusCard, NeedsYouTodayList, PipelineGlanceStrip
- [ ] Page loads progressively — greeting first, sections fill in as data arrives
- [ ] Max-width constrains content on wide screens; padding adjusts on mobile
- [ ] No regression — `/deals` (old dashboard) still works for now

→ Next: `05-klo-focus-card.md`
