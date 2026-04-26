# Step 05 — Klo focus card

**Sprint:** B
**Goal:** The hero section of the seller home page. A large card containing Klo's daily focus paragraph, framed as ONE coaching action with primary and secondary CTAs.

## File

- `src/components/home/KloFocusCard.jsx` — new

## What it shows

```
┌─────────────────────────────────────────────────────────────┐
│  ◆ KLO · YOUR FOCUS TODAY                                   │
│                                                             │
│  Send the DIB proposal to Nina before end of day.           │
│  Monday's demo is dead without it.                          │
│                                                             │
│  You've been sitting on this for 5 weeks and the buyer has  │
│  gone from interested to confused. The proposal is the      │
│  unblocker — once it's in Nina's hands you can use Monday's │
│  call to ask Ahmed point-blank who signs the contract.      │
│  That one question is your close path.                      │
│                                                             │
│  [Open DIB]  [Ask Klo why]                                  │
└─────────────────────────────────────────────────────────────┘
```

## Component API

```jsx
<KloFocusCard
  focus={focus}    // { focus_text, deals_referenced, generated_at } from fetchDailyFocus
  loading={bool}   // show skeleton while loading
/>
```

## Splitting the focus text into headline and body

`fetchDailyFocus()` returns a single paragraph (3-5 sentences). For this card:

- **Headline** = the first sentence of the focus text. Big, weight 500, ~22px.
- **Body** = the remaining sentences. Smaller, ~14px, ~1.55 line height.

```javascript
function splitFocus(text) {
  const clean = text.replace(/\*\*/g, '').trim();
  const parts = clean.split(/(?<=[.!?])\s+/);
  return {
    headline: parts[0] ?? clean,
    body: parts.slice(1).join(' ').trim()
  };
}
```

If there's only one sentence, headline = full text and body is empty (and not rendered).

## Identifying the primary deal for the CTA

`focus.deals_referenced` is an array of deal IDs Klo mentioned in the paragraph. The first one is the primary. Use it to label the CTA: "Open {deal title}".

If `deals_referenced` is empty (Klo gave general advice, no specific deal mentioned), the primary CTA hides and only "Ask Klo why" shows.

```javascript
function pickPrimaryDeal(focus, deals) {
  if (!focus?.deals_referenced || focus.deals_referenced.length === 0) return null;
  return deals.find(d => d.id === focus.deals_referenced[0]) ?? null;
}
```

## CTAs

**Primary:** "Open {deal name}" — solid dark button, navigates to `/deals/{id}`. If no primary deal, hidden.

**Secondary:** "Ask Klo why" — outline button. Currently this is a placeholder — clicking it sends the user to the `/team/askklo` page (or, for non-team users, to the deal page's chat tab) with a pre-filled question. For now, just navigate to the deal page chat tab with a `?ask=focus_explain` query param. Wiring the actual prompt is Phase 7.

## Styling

Use the warm-amber tone from the mockup (the same `#FAEEDA` family that `KloReadPanel` uses). This visually links Klo's daily focus with Klo's per-deal read — same voice, same color.

Tailwind/inline:

```jsx
<div className="rounded-xl p-5 md:p-7 mb-6"
  style={{ background: '#FAEEDA' }}>

  <div className="text-xs font-medium tracking-wider mb-2"
    style={{ color: '#854F0B' }}>◆ KLO · YOUR FOCUS TODAY</div>

  <h2 className="text-xl md:text-2xl font-medium leading-snug mb-3"
    style={{ color: '#412402' }}>
    {headline}
  </h2>

  {body && (
    <p className="text-sm md:text-base leading-relaxed mb-4"
      style={{ color: '#633806' }}>
      {body}
    </p>
  )}

  <div className="flex gap-2 flex-wrap">
    {primaryDeal && (
      <button
        onClick={() => navigate(`/deals/${primaryDeal.id}`)}
        className="px-4 py-2 rounded-md text-sm font-medium text-white"
        style={{ background: '#412402' }}
      >
        Open {primaryDeal.title}
      </button>
    )}
    <button
      onClick={onAskKlo}
      className="px-4 py-2 rounded-md text-sm border"
      style={{ borderColor: '#BA7517', color: '#633806' }}
    >
      Ask Klo why
    </button>
  </div>
</div>
```

## Loading state

Three skeleton blocks at roughly the right sizes:

```jsx
if (loading) {
  return (
    <div className="rounded-xl p-5 md:p-7 mb-6 animate-pulse"
      style={{ background: '#FAEEDA' }}>
      <div className="h-3 w-40 rounded mb-3" style={{ background: '#BA7517', opacity: 0.3 }} />
      <div className="h-7 w-3/4 rounded mb-2" style={{ background: '#BA7517', opacity: 0.3 }} />
      <div className="h-4 w-full rounded mb-1" style={{ background: '#BA7517', opacity: 0.2 }} />
      <div className="h-4 w-5/6 rounded mb-4" style={{ background: '#BA7517', opacity: 0.2 }} />
      <div className="h-9 w-32 rounded" style={{ background: '#412402', opacity: 0.3 }} />
    </div>
  );
}
```

## Empty state

No focus from Klo (e.g., new user with no deals):

```jsx
if (!focus || !focus.focus_text) {
  return (
    <div className="rounded-xl p-5 md:p-7 mb-6"
      style={{ background: 'var(--color-background-secondary)' }}>
      <div className="text-xs text-secondary mb-2">◆ KLO</div>
      <h2 className="text-xl font-medium mb-2">Once you have an active deal, Klo will tell you where to focus each morning.</h2>
      <button onClick={() => navigate('/deals/new')} className="px-4 py-2 rounded-md text-sm border">+ Start your first deal</button>
    </div>
  );
}
```

## Refresh

There is no "refresh" button on the focus card itself. The cache invalidation logic from Phase 5 Sprint 3 (triggers on confidence/status change) handles this. The user can force a refresh by going to the old dashboard `/deals` and using its refresh button (or, in a future polish, by adding a small subtle refresh affordance here).

For Phase 6, no refresh button on the focus card. Less is more — the focus updates when the world changes.

## Acceptance

- [ ] On the seller home, the focus card is the largest visual element on the page
- [ ] Headline and body are visually distinct (size, weight, color)
- [ ] Primary CTA "Open {deal name}" works — navigates to that deal
- [ ] Secondary CTA "Ask Klo why" works (navigates to chat with query param for now)
- [ ] If `deals_referenced` is empty, only "Ask Klo why" is shown
- [ ] Loading state shows skeleton in the right shape
- [ ] Empty state shows the "once you have a deal" message with a "Start your first deal" button
- [ ] Mobile (375px): card padding tightens, headline drops to 20px, buttons stack if needed
- [ ] No regression to the daily-focus data fetching (still uses cached focus from Phase 5)

→ Next: `06-needs-you-today-list.md`
