# Step 13 — Klo team brief card

**Sprint:** D
**Goal:** The hero card on the manager home — Klo's read of the team this week. Same visual language as KloFocusCard but uses a blue tone (different role, different color family).

## File

- `src/components/manager/KloTeamBriefCard.jsx` — new

## What it shows

```
┌─────────────────────────────────────────────────────────────┐
│ ◆ KLO · YOUR TEAM RIGHT NOW                                 │
│                                                             │
│ Two of Raja's three deals are slipping. DIB has been        │
│ stuck 5 weeks waiting on a proposal he hasn't sent.         │
│ Northwind has gone quiet 6 days. Priya and Anil are clean.  │
│                                                             │
│ Raja needs a 1:1 this week. He's not lazy — he's stuck on   │
│ the proposal because he doesn't have a confirmed signatory  │
│ and is waiting for the buyer to surface one. That's the     │
│ wrong move at this stage. Coach him to send the proposal    │
│ anyway and use the demo to extract the signing authority    │
│ directly from Ahmed.                                         │
│                                                             │
│ [Open Raja's pipeline]  [Ask Klo more]                      │
└─────────────────────────────────────────────────────────────┘
```

## Component API

```jsx
<KloTeamBriefCard
  brief={brief}        // { brief_text, generated_at } from fetchManagerWeeklyBrief
  loading={bool}
  pipeline={pipeline}  // for resolving rep names mentioned in the brief
/>
```

## Color family — blue, not amber

The seller's morning briefing uses warm amber tones (Klo coaching the individual). The manager's weekly briefing uses cool blue tones (Klo reporting up to leadership).

Use `#E6F1FB` (Blue 50) as the background, `#0C447C` (Blue 800) as the body text, `#185FA5` (Blue 600) as the tag/header text.

This visual differentiation matters: when a manager is also a seller (some Klosure users will be both), the color tells them which mode they're in at a glance.

## Splitting the brief into headline and body

Same pattern as KloFocusCard — first sentence(s) is the headline, the rest is body.

But manager briefs tend to be longer than seller focus paragraphs. Treat the FIRST 1-2 sentences as headline (medium font, weight 500), and the REST as body (smaller, muted).

```javascript
function splitManagerBrief(text) {
  const clean = (text ?? '').trim();
  const sentences = clean.split(/(?<=[.!?])\s+/);
  // Headline = first 1-2 sentences (whichever fits in ~200 chars)
  let headline = sentences[0] ?? '';
  if (sentences.length > 1 && (headline.length + sentences[1].length) <= 220) {
    headline = headline + ' ' + sentences[1];
  }
  const headlineSentenceCount = sentences.findIndex(s => headline.includes(s)) + 1 || 1;
  const body = sentences.slice(headlineSentenceCount).join(' ').trim();
  return { headline, body };
}
```

## Identifying the focal rep

Look at the brief text and try to identify the rep name that appears most prominently. Cross-reference with `pipeline.members`:

```javascript
function pickFocalRep(briefText, members) {
  if (!briefText || !members) return null;
  const lower = briefText.toLowerCase();
  // Score each member by mention count
  const scored = members.map(m => {
    const name = m.users?.name ?? '';
    if (!name) return { member: m, score: 0 };
    const count = (lower.match(new RegExp(`\\b${name.toLowerCase()}\\b`, 'g')) ?? []).length;
    return { member: m, score: count };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].member : null;
}
```

If a focal rep is identified, the primary CTA becomes "Open {rep name}'s pipeline" → navigates to `/team/reps?focus={rep_id}` (or the deals filtered by rep). If no focal rep, hide the primary CTA and only show "Ask Klo more".

For Phase 6, the "Open rep's pipeline" route is a placeholder — `/team/reps` exists but doesn't filter yet. That's fine; it shows all reps and the user can click through. Phase 7 can wire the filter.

## Buttons

**Primary — Open {rep name}'s pipeline:**
- Solid dark blue button (`#042C53` background, white text)
- Conditional on focal rep being identified

**Secondary — Ask Klo more:**
- Outline blue button
- Navigates to `/team/askklo` with the brief text as a starter prompt (or just opens the chat-style page; wiring the prompt is Phase 7)

## Styling

```jsx
<div className="rounded-xl p-5 md:p-7 mb-6"
  style={{ background: '#E6F1FB' }}>

  <div className="text-xs font-medium tracking-wider mb-2"
    style={{ color: '#185FA5' }}>◆ KLO · YOUR TEAM RIGHT NOW</div>

  <h2 className="text-base md:text-lg font-medium leading-relaxed mb-3"
    style={{ color: '#042C53' }}>
    {headline}
  </h2>

  {body && (
    <p className="text-sm leading-relaxed mb-4"
      style={{ color: '#0C447C' }}>
      {body}
    </p>
  )}

  <div className="flex gap-2 flex-wrap">
    {focalRep && (
      <button
        onClick={() => navigate(`/team/reps?focus=${focalRep.user_id}`)}
        className="px-4 py-2 rounded-md text-sm font-medium text-white"
        style={{ background: '#042C53' }}
      >
        Open {focalRep.users?.name}'s pipeline
      </button>
    )}
    <button
      onClick={() => navigate('/team/askklo')}
      className="px-4 py-2 rounded-md text-sm border"
      style={{ borderColor: '#378ADD', color: '#0C447C' }}
    >
      Ask Klo more
    </button>
  </div>
</div>
```

## Loading and empty states

```jsx
if (loading) {
  return (
    <div className="rounded-xl p-7 mb-6 animate-pulse" style={{ background: '#E6F1FB' }}>
      <div className="h-3 w-44 rounded mb-3" style={{ background: '#185FA5', opacity: 0.3 }} />
      <div className="h-5 w-3/4 rounded mb-2" style={{ background: '#185FA5', opacity: 0.3 }} />
      <div className="h-4 w-full rounded mb-1" style={{ background: '#185FA5', opacity: 0.2 }} />
      <div className="h-4 w-5/6 rounded mb-4" style={{ background: '#185FA5', opacity: 0.2 }} />
      <div className="h-9 w-44 rounded" style={{ background: '#042C53', opacity: 0.3 }} />
    </div>
  );
}

if (!brief?.brief_text) {
  // No brief available — likely because team has no active deals
  return (
    <div className="rounded-xl p-5 md:p-7 mb-6" style={{ background: 'var(--color-background-secondary)' }}>
      <div className="text-xs text-secondary mb-2">◆ KLO</div>
      <h2 className="text-base font-medium">
        Once your reps have active deals, Klo will brief you on the team each week.
      </h2>
    </div>
  );
}
```

## Acceptance

- [ ] Card renders below the page header on `/team`
- [ ] Blue color tones distinguish it from the seller's amber focus card
- [ ] Headline and body split correctly from `brief_text`
- [ ] Focal rep correctly identified when their name appears in the brief
- [ ] "Open {rep}'s pipeline" CTA shown when focal rep exists
- [ ] "Ask Klo more" CTA always shown
- [ ] Loading skeleton, empty state both work
- [ ] Mobile: card padding tightens, headline drops to base size, buttons stack if needed

→ Next: `14-deals-slipping-list.md`
