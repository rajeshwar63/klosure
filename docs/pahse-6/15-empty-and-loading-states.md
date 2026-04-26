# Step 15 — Empty and loading states

**Sprint:** E (Polish)
**Goal:** Make sure every page handles "first-use" and "data loading" gracefully. No blank screens, no infinite spinners, no broken layouts.

## Files

Touched across multiple components — this is a polish pass, not a new feature:
- All Klo cards (KloFocusCard, KloRecommendsCard, KloTeamBriefCard) — already specced individually
- New `<EmptyState>` component for reuse
- New `<SkeletonRow>` component for reuse

## Reusable EmptyState component

```jsx
// src/components/shell/EmptyState.jsx
export default function EmptyState({ icon, title, description, primaryAction, secondaryAction }) {
  return (
    <div className="text-center py-12 px-6">
      {icon && <div className="text-3xl mb-3 opacity-40">{icon}</div>}
      <h3 className="text-base font-medium mb-2">{title}</h3>
      {description && <p className="text-sm text-secondary mb-4 max-w-md mx-auto">{description}</p>}
      <div className="flex gap-2 justify-center">
        {primaryAction && (
          <button onClick={primaryAction.onClick} className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-white">
            {primaryAction.label}
          </button>
        )}
        {secondaryAction && (
          <button onClick={secondaryAction.onClick} className="px-4 py-2 rounded-md text-sm border">
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
```

## Reusable SkeletonRow

```jsx
// src/components/shell/SkeletonRow.jsx
export default function SkeletonRow({ lines = 1, height = 16 }) {
  return (
    <div className="animate-pulse" style={{ marginBottom: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="rounded bg-secondary"
          style={{
            height,
            width: i === lines - 1 ? '60%' : '100%',
            marginBottom: 4
          }}
        />
      ))}
    </div>
  );
}
```

## Empty state cases — comprehensive list

### Seller

| Page | Empty case | Treatment |
|---|---|---|
| /today | No active deals | KloFocusCard shows "Once you have an active deal..." with [+ Start your first deal] button. NeedsYouTodayList and PipelineGlanceStrip return null. |
| /today | Has deals but none need attention | NeedsYouTodayList shows "✓ You're caught up. Spend the day on outbound or your biggest open deal." |
| /deals (existing) | No active deals | Existing dashboard's empty state — keep as-is. |
| /deals/:id | klo_state is null (new deal, no chats) | KloRecommendsCard shows "Klo will recommend your next move once you've had your first conversation in this deal." with [Start chatting] button. |

### Manager

| Page | Empty case | Treatment |
|---|---|---|
| /team | Team has no active deals | KloTeamBriefCard shows "Once your reps have active deals, Klo will brief you on the team each week." DealsSlippingList and QuarterGlanceStrip return null. |
| /team | Team has deals but none slipping | DealsSlippingList shows "No deals slipping this week. The team's pipeline is healthy." |
| /team/forecast | (existing — no changes) | (no changes) |

## Loading state cases

| Surface | Loading treatment |
|---|---|
| Seller home page | Header renders instantly. KloFocusCard skeleton (matches the card shape). NeedsYouTodayList: 3 SkeletonRows. PipelineGlanceStrip: 3 muted gray cards with no numbers. |
| Manager home page | Same pattern — header instant, KloTeamBriefCard skeleton (blue-tinted), DealsSlippingList SkeletonRows, QuarterGlanceStrip neutral cards. |
| Deal page | Page-level skeleton: dark header bar (no content), tab strip (no content), main area with two skeleton blocks (where the recommends card and confidence panel will be). |
| Sidebar | If deals haven't loaded yet, sidebar shows "My deals" section header with 3 SkeletonRows underneath. |

## Don't show spinners

Anywhere a spinner would normally go, use a skeleton block of the right size and shape instead. Spinners imply "wait for data"; skeletons imply "your content is on its way." Skeletons feel faster even at the same actual load time.

## "Coming soon" disabled buttons

The Snooze, Mark done, Draft email, + Add (blocker), + Add (commitment) buttons are all visible-but-disabled in Phase 6. Make sure they:

- Have `cursor: not-allowed`
- Have `opacity: 0.5` for visual cue
- Have a `title` attribute showing "Coming soon" tooltip on hover
- Don't fire any onClick handler

```jsx
<button disabled
  className="px-3 py-1.5 rounded-md text-xs opacity-50 cursor-not-allowed"
  title="Coming soon — wiring this up in a future update"
>
  ⏰ Snooze · 1d
</button>
```

## First-time user flow

A brand new user signing up for Klosure for the first time has no deals, no team, no chat history. They should see:

1. Land on `/today` (default for sellers)
2. See greeting with their name
3. See KloFocusCard with the "Once you have a deal..." empty state and "+ Start your first deal" CTA
4. Sidebar shows empty "My deals" section with a "+ New deal" affordance

The whole first-load experience is friendly and obvious. They don't need to be taught what to do.

## Acceptance

- [ ] All empty states render with helpful messages, not blank panels
- [ ] All loading states use skeletons sized to the actual content shape
- [ ] No spinners anywhere in the new UI
- [ ] First-time user sees an obvious "+ Start your first deal" path on /today
- [ ] Manager with no team or no deals sees a graceful empty state on /team
- [ ] Disabled Phase-7 buttons (Snooze, Mark done, Draft email) are visible but have proper tooltip + cursor + opacity
- [ ] No console warnings about missing data when components render empty

→ Next: `16-mobile-drawer-and-responsive-pass.md`
