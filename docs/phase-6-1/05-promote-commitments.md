# Step 05 — Promote Commitments above the fold

**Sprint:** B
**Goal:** Move the Commitments panel from the bottom-right (below blockers) into the top-right slot, replacing the ConfidenceSidePanel as the secondary hero. Confidence becomes a smaller strip below.

## Why this is the right call

Salespeople think in terms of the asymmetry between "what's on my plate" and "what's on theirs." The Commitments panel embodies that asymmetry — "What we're doing" vs "Needed from buyer." On a stuck deal, the question "is the ball in their court or mine?" is THE question.

Right now Commitments is below the fold. ConfidenceSidePanel — useful but more abstract — has the prime real estate.

This step swaps them: **Commitments becomes the right-side hero alongside Klo recommends. Confidence becomes a compact strip below the two-column hero.**

## New OverviewTab layout

```
┌──────────────────────────────────┬──────────────────────────────┐
│  KLO RECOMMENDS                  │  COMMITMENTS · 1             │
│  Send the LXP proposal to Nina   │  What we're doing            │
│  today...                        │  ▸ Send proposal to Nina     │
│  [Take action] [Snooze] [done]   │    [Overdue 3d] Raja         │
│                                  │                              │
│                                  │  Needed from buyer           │
│                                  │  Nothing pending from them   │
└──────────────────────────────────┴──────────────────────────────┘

[ + KLO'S CONFIDENCE · 42% stable                              ⌄ ]

[ STAGE | VALUE | DEADLINE | HEALTH | STUCK FOR ]

┌──────────────────────────────────┬──────────────────────────────┐
│ BLOCKERS · 4                     │ (something else later)       │
└──────────────────────────────────┴──────────────────────────────┘
```

## Files

- `src/components/deal/OverviewTab.jsx` — restructure layout
- `src/components/deal/ConfidenceCompactStrip.jsx` — new (the collapsed-to-strip version of ConfidenceSidePanel)
- `src/components/deal/ConfidenceSidePanel.jsx` — keep for reference but no longer used in OverviewTab

## ConfidenceCompactStrip — the new collapsed confidence

A horizontal collapsed bar that shows just the score + trend, expandable to show factors:

```jsx
export default function ConfidenceCompactStrip({ klo_state, viewerRole }) {
  if (viewerRole !== 'seller') return null;
  const c = klo_state?.confidence;
  if (!c) return null;

  const [open, setOpen] = useState(false);
  const tone = c.value >= 60 ? 'good' : c.value >= 35 ? 'caution' : 'risk';
  const toneColor = tone === 'good' ? '#3B6D11' : tone === 'caution' ? '#BA7517' : '#A32D2D';

  return (
    <div className="bg-white border-tertiary rounded-md mb-4"
      style={{ borderWidth: '0.5px' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex justify-between items-center text-left">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium tracking-wider text-secondary">+ KLO'S CONFIDENCE</span>
          <span className="text-2xl font-medium" style={{ color: toneColor }}>{c.value}%</span>
          <TrendChip trend={c.trend} delta={c.delta} />
        </div>
        <span className="text-tertiary">{open ? '⌃' : '⌄'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--color-border-tertiary)', borderTopWidth: '0.5px' }}>
          {c.rationale && (
            <p className="text-sm leading-relaxed pt-3 mb-3">{c.rationale}</p>
          )}
          {c.factors_to_raise?.length > 0 && (
            <>
              <div className="text-xs font-medium tracking-wider text-secondary mb-2">
                WHAT WOULD MOVE IT UP
              </div>
              <div className="flex flex-col gap-1">
                {c.factors_to_raise.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                    style={{ background: '#EAF3DE' }}>
                    <span className="text-xs font-medium" style={{ color: '#3B6D11' }}>+{f.impact}%</span>
                    <span className="text-xs" style={{ color: '#173404' }}>{f.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

## Updated OverviewTab.jsx

```jsx
import KloRecommendsCard from './KloRecommendsCard';
import CommitmentsPanel from './CommitmentsPanel';
import ConfidenceCompactStrip from './ConfidenceCompactStrip';
import DealContextStrip from './DealContextStrip';
import DealStatStripWide from './DealStatStripWide';
import BlockersPanel from './BlockersPanel';
import { useStuckFor } from '../../hooks/useStuckFor';

export default function OverviewTab({ deal, viewerRole }) {
  const ks = deal.klo_state ?? {};
  const stuckFor = useStuckFor(deal.id, ks.confidence);

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">

      <DealContextStrip klo_state={ks} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 mb-4">
        <KloRecommendsCard klo_state={ks} viewerRole={viewerRole} />
        <CommitmentsPanel commitments={deal.commitments} dealId={deal.id} viewerRole={viewerRole} />
      </div>

      <ConfidenceCompactStrip klo_state={ks} viewerRole={viewerRole} />

      <DealStatStripWide deal={deal} klo_state={ks} stuckFor={stuckFor} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <BlockersPanel klo_state={ks} viewerRole={viewerRole} dealId={deal.id} />
        {/* The other column will hold the Stakeholders panel from step 06 */}
        <div /> {/* placeholder for now */}
      </div>

    </div>
  );
}
```

## CommitmentsPanel sizing

Now that Commitments occupies the right-side hero slot (1fr in a 1.5fr/1fr grid), it needs slightly different default behavior:

- Default to expanded (don't auto-collapse on first view)
- Show both zones (What we're doing / Needed from buyer) at all times
- Even when both zones have nothing, show the empty messages so the panel doesn't look empty

This is a change from Phase 6 where CommitmentsPanel was collapsible by default. Here, since it's a hero, it should always be expanded.

## Mobile behavior

At < 1024px the grid collapses to a single column. The Klo recommends card stays at top, Commitments stacks below it. ConfidenceCompactStrip remains a single-row collapsible. This is fine — Commitments still gets prime vertical real estate on mobile because it appears second, before the long tail of stat strip / blockers.

## What's deliberately NOT changed

- BlockersPanel still lives in the lower section (paired with Stakeholders in step 06)
- ConfidenceSidePanel.jsx the file stays in the codebase but is no longer used in OverviewTab. Don't delete it yet — leave it for one phase as fallback. Delete in Phase 7 cleanup.

## Acceptance

- [ ] Open the DIB deal Overview
- [ ] Top-row hero: Klo recommends on left, Commitments on right
- [ ] Both zones (What we're doing / Needed from buyer) visible inside Commitments
- [ ] Below the hero: ConfidenceCompactStrip — single line showing "+ KLO'S CONFIDENCE  42%  stable"
- [ ] Click the strip → expands to show rationale + factors
- [ ] Click again → collapses
- [ ] Stat strip and Blockers section unchanged below
- [ ] Mobile: hero collapses to single column, Commitments below Klo recommends, then ConfidenceCompactStrip, then stat strip, then Blockers

→ Next: `06-stakeholders-panel.md`
