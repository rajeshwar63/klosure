# Step 09 — Klo recommends card

**Sprint:** C
**Goal:** The hero of the new Overview tab. A large card showing Klo's #1 recommendation for this specific deal, with action buttons (Draft email, Snooze, Mark done).

## File

- `src/components/deal/KloRecommendsCard.jsx` — new
- `src/components/deal/OverviewTab.jsx` — new (assembles all the Overview sections)

## What it shows

```
┌─────────────────────────────────────────────────────────────┐
│ [+ KLO RECOMMENDS]    DO THIS NEXT                          │
│                                                             │
│ Send the LXP proposal to Nina today —                       │
│ before Monday's demo.                                       │
│                                                             │
│ Then on Monday, ask Ahmed directly who signs the contract.  │
│ That one question unblocks your close path.                 │
│                                                             │
│ [✉ Draft proposal email]  [⏰ Snooze · 1d]  Mark done       │
└─────────────────────────────────────────────────────────────┘
```

## Component API

```jsx
<KloRecommendsCard
  klo_state={kloState}
  viewerRole="seller"
  onDraftEmail={() => ...}
  onSnooze={() => ...}
  onMarkDone={() => ...}
/>
```

Buyer view: this card renders DIFFERENTLY (see "Buyer variant" below).

## Source of the recommendation text

Pull from `klo_state.klo_take_seller` (existing field from Phase 4.5). Split into headline and body using the same logic as `KloFocusCard`:

```javascript
function splitTake(text) {
  const clean = (text ?? '').trim();
  if (!clean) return { headline: '', body: '' };
  const parts = clean.split(/(?<=[.!?])\s+/);
  return {
    headline: parts[0] ?? clean,
    body: parts.slice(1).join(' ').trim()
  };
}
```

The headline becomes the big text in the card. The body becomes the smaller follow-up sentences.

## Highlighting the urgency word

If the headline contains the word "today", "now", "this week", "by Monday" (or similar urgent time phrase), wrap it in a colored span:

```jsx
function highlightUrgency(text) {
  const urgentPattern = /(today|now|this week|by Monday|by Tuesday|...)/i;
  // split on match, render the matched portion with red text
}
```

Keep this light — only one match per headline. The visual treatment is subtle red text, no background.

## Buttons

Three buttons in a row:

**Primary — Draft proposal email** (or contextually-named action):
- Solid dark button (`#2C2C2A` background, white text)
- Icon prefix: ✉
- Label: "Draft proposal email" — but the label SHOULD be derived from the recommendation. For Phase 6, just hardcode "Draft email" if Klo's recommendation involves a proposal/email; otherwise "Take action". Wiring real action types is Phase 7.
- For now: `disabled` with a tooltip "Coming soon — Klo will draft this for you in a future update."

**Secondary — Snooze · 1d:**
- Outline button
- Icon prefix: ⏰
- For now: `disabled` with tooltip "Coming soon"

**Tertiary — Mark done:**
- Text-only button (no border)
- Subtle muted color
- For now: `disabled` with tooltip "Coming soon"

These three are placeholders. Showing them disabled is intentional — users will ask about them, and we want to surface that the workflow is coming.

## Buyer variant

For buyers (`viewerRole === 'buyer'`):

- Pull from `klo_state.klo_take_buyer` (different text, different framing)
- Header label: "+ KLO SUGGESTS" (not "RECOMMENDS")
- No buttons. Buyers don't have action affordances in this card.
- Same visual style otherwise — same card, same highlighting

```jsx
{viewerRole === 'buyer' ? (
  <BuyerRecommendsCard text={klo_state?.klo_take_buyer} />
) : (
  <SellerRecommendsCard text={klo_state?.klo_take_seller} ... />
)}
```

## Styling

```jsx
<div className="bg-white border-tertiary rounded-xl p-5"
  style={{ borderWidth: '0.5px' }}>

  <div className="flex items-center gap-2 mb-3">
    <span className="text-[10px] font-medium tracking-wider px-2.5 py-1 rounded-full"
      style={{ background: '#FAEEDA', color: '#854F0B' }}>
      + KLO RECOMMENDS
    </span>
    <span className="text-[10px] text-tertiary tracking-wider">DO THIS NEXT</span>
  </div>

  <h2 className="text-lg md:text-xl font-medium leading-snug mb-2">
    {highlightUrgency(headline)}
  </h2>

  {body && (
    <p className="text-sm text-secondary leading-relaxed mb-4">
      {body}
    </p>
  )}

  <div className="flex gap-2 items-center flex-wrap">
    <button disabled
      className="px-3.5 py-1.5 rounded-md text-xs font-medium text-white opacity-50 cursor-not-allowed"
      style={{ background: '#2C2C2A' }}
      title="Coming soon — Klo will draft this for you in a future update"
    >
      ✉ Draft proposal email
    </button>
    <button disabled className="px-3.5 py-1.5 rounded-md text-xs border border-tertiary opacity-50 cursor-not-allowed"
      title="Coming soon"
      style={{ borderWidth: '0.5px' }}>
      ⏰ Snooze · 1d
    </button>
    <button disabled className="px-2 py-1.5 text-xs text-tertiary opacity-50 cursor-not-allowed"
      title="Coming soon">
      Mark done
    </button>
  </div>
</div>
```

## Empty state

If `klo_take_seller` is null (deal hasn't had any chat turns yet, so `klo_state` is mostly empty):

```jsx
<div className="bg-white border-tertiary rounded-xl p-5">
  <div className="text-xs text-tertiary tracking-wider mb-2">+ KLO RECOMMENDS</div>
  <p className="text-sm text-secondary">
    Klo will recommend your next move once you've had your first conversation in this deal.
  </p>
  <button onClick={() => switchToTab('chat')} className="mt-3 px-3 py-1.5 rounded-md text-xs border">
    Start chatting
  </button>
</div>
```

## Acceptance

- [ ] On the Overview tab, the Klo recommends card is the largest visual element
- [ ] Headline and body split correctly from `klo_take_seller`
- [ ] Urgency words ("today", "now") are highlighted with subtle red color
- [ ] Three buttons present: Draft email (primary, dark), Snooze (outline), Mark done (text)
- [ ] All three buttons are disabled with "Coming soon" tooltips
- [ ] Buyer view shows the buyer-side text + "KLO SUGGESTS" label, no buttons
- [ ] Empty state shown when `klo_take_seller` is null
- [ ] Mobile: padding tightens, headline drops to 18px, buttons stack if needed

→ Next: `10-confidence-side-panel.md`
