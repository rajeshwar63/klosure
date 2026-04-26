# Step 10 — Confidence side panel + Overview tab assembly

**Sprint:** C
**Goal:** Build the confidence panel that sits to the right of the Klo recommends card. Then assemble the full Overview tab layout: two-column header (recommends + confidence), context strip below, then collapsed Klo's full read, then the deal stat strip.

## Files

- `src/components/deal/ConfidenceSidePanel.jsx` — new (compact version of the Phase 5.5 KloReadPanel)
- `src/components/deal/OverviewTab.jsx` — assembles the Overview content
- `src/components/deal/DealContextStrip.jsx` — new (the cream banner with deal context)

## ConfidenceSidePanel

Smaller version of the confidence display. The KloReadPanel from Phase 5.5 was the whole hero; in Phase 6 the score moves to the side as supporting evidence.

```jsx
export default function ConfidenceSidePanel({ klo_state }) {
  const c = klo_state?.confidence;
  if (!c) return <ConfidenceEmpty />;

  const tone = c.value >= 60 ? 'good' : c.value >= 35 ? 'caution' : 'risk';
  const toneColor = tone === 'good' ? '#3B6D11' : tone === 'caution' ? '#BA7517' : '#A32D2D';

  return (
    <div className="bg-white border-tertiary rounded-xl p-4 md:p-5"
      style={{ borderWidth: '0.5px' }}>

      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[10px] font-medium tracking-wider text-secondary">
          CONFIDENCE TO CLOSE
        </span>
        {klo_state.deadline?.date && (
          <span className="text-[10px] text-tertiary">
            by {formatDate(klo_state.deadline.date)}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-3xl md:text-4xl font-medium" style={{ color: toneColor }}>
          {c.value}
          <span className="text-base text-tertiary">%</span>
        </span>
        <TrendChip trend={c.trend} delta={c.delta} />
      </div>

      <div className="h-1 rounded-full bg-secondary mb-3 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${c.value}%`, background: toneColor }} />
      </div>

      <div className="text-[10px] font-medium tracking-wider text-secondary mb-1.5">
        WHAT WOULD MOVE IT UP
      </div>

      <div className="flex flex-col gap-1">
        {(c.factors_to_raise ?? []).slice(0, 3).map((f, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md"
            style={{ background: '#EAF3DE' }}>
            <span className="text-[11px] font-medium" style={{ color: '#3B6D11' }}>
              +{f.impact}%
            </span>
            <span className="text-[11px]" style={{ color: '#173404' }}>{f.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Three differences from the Phase 5.5 KloReadPanel:

1. **Size:** smaller — it's the secondary panel, not the hero
2. **Score and label only** — no rationale paragraph (that's now in the Klo recommends card body)
3. **Top 3 factors** — not all 5 (saves vertical space; the rest live in "Klo's full read")

## DealContextStrip

The cream-colored 1-2 sentence summary at the top of the Overview tab (above the two-column row):

```jsx
export default function DealContextStrip({ klo_state }) {
  const summary = klo_state?.summary;
  if (!summary) return null;
  const [expanded, setExpanded] = useState(false);
  const isLong = summary.length > 200;
  const displayText = expanded || !isLong ? summary : summary.slice(0, 197) + '...';

  return (
    <div className="rounded-md p-3 mb-4 flex gap-2.5 items-start"
      style={{ background: '#FAEEDA' }}>
      <span className="text-xs" style={{ color: '#854F0B' }}>+</span>
      <div className="flex-1 text-xs leading-relaxed" style={{ color: '#633806' }}>
        {displayText}
        {isLong && (
          <button onClick={() => setExpanded(e => !e)} className="ml-1 underline">
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </div>
  );
}
```

## OverviewTab assembly

Now we put everything together. Reuse Phase 5.5 components for the bottom sections (Klo's full read collapsed, blockers, commitments, etc.) — just rehouse them in the new layout.

```jsx
import KloRecommendsCard from './KloRecommendsCard';
import ConfidenceSidePanel from './ConfidenceSidePanel';
import DealContextStrip from './DealContextStrip';
import KloFullReadCollapsed from './KloFullReadCollapsed';
import DealStatStripWide from './DealStatStripWide';
import BlockersPanel from './BlockersPanel';
import CommitmentsPanel from './CommitmentsPanel';

export default function OverviewTab({ deal, viewerRole }) {
  const ks = deal.klo_state ?? {};

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">

      <DealContextStrip klo_state={ks} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 mb-4">
        <KloRecommendsCard klo_state={ks} viewerRole={viewerRole} />
        {viewerRole === 'seller' && <ConfidenceSidePanel klo_state={ks} />}
      </div>

      <KloFullReadCollapsed klo_state={ks} viewerRole={viewerRole} />

      <DealStatStripWide deal={deal} klo_state={ks} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <BlockersPanel klo_state={ks} viewerRole={viewerRole} dealId={deal.id} />
        <CommitmentsPanel commitments={deal.commitments} dealId={deal.id} viewerRole={viewerRole} />
      </div>

    </div>
  );
}
```

## KloFullReadCollapsed

A horizontal collapsed bar that expands into Klo's rationale + all 5 factors:

```jsx
export default function KloFullReadCollapsed({ klo_state, viewerRole }) {
  const [open, setOpen] = useState(false);
  const c = klo_state?.confidence;
  if (!c || viewerRole !== 'seller') return null;

  return (
    <div className="bg-white border-tertiary rounded-md mb-4"
      style={{ borderWidth: '0.5px' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex justify-between items-center text-left">
        <span className="text-xs text-secondary tracking-wider">+ KLO'S FULL READ</span>
        <span className="text-tertiary">{open ? '⌃' : '⌄'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {c.rationale && (
            <p className="text-sm leading-relaxed mb-3">{c.rationale}</p>
          )}
          {c.factors_to_raise?.length > 0 && (
            <>
              <div className="text-[10px] font-medium tracking-wider text-secondary mb-1.5">
                ALL FACTORS
              </div>
              <div className="flex flex-col gap-1">
                {c.factors_to_raise.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-md"
                    style={{ background: '#EAF3DE' }}>
                    <span className="text-xs font-medium" style={{ color: '#3B6D11' }}>+{f.impact}%</span>
                    <span className="text-xs">{f.label}</span>
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

## DealStatStripWide

The 5-column stat row from the mockup. Adapts the Phase 5.5 DealStatStrip to the wider desktop layout:

```jsx
export default function DealStatStripWide({ deal, klo_state }) {
  return (
    <div className="bg-white border-tertiary rounded-xl p-4 md:p-5 mb-4 grid grid-cols-2 md:grid-cols-5 gap-3"
      style={{ borderWidth: '0.5px' }}>

      <Stat label="STAGE" value={capitalize(klo_state?.stage ?? '—')}
        subtitle={`${stageNumber(klo_state?.stage)} of 5`} />

      <Stat label="VALUE" value={formatCurrency(klo_state?.deal_value?.amount)}
        subtitle={klo_state?.deal_value?.confidence === 'tentative' ? 'tentative' : null}
        subtitleColor="#BA7517" />

      <Stat label="DEADLINE" value={formatShortDate(klo_state?.deadline?.date)}
        subtitle={`${daysUntil(klo_state?.deadline?.date)} days`} />

      <Stat label="HEALTH" value={healthLabel(deal.health)}
        valueColor={healthColor(deal.health)}
        subtitle="resolve in chat" />

      <Stat label="STUCK FOR" value={`${deal.stuck_for_weeks ?? 0} weeks`}
        valueColor={deal.stuck_for_weeks >= 2 ? '#A32D2D' : null}
        subtitle={deal.stuck_since ? `since ${formatShortDate(deal.stuck_since)}` : null} />

    </div>
  );
}
```

## BlockersPanel + CommitmentsPanel

Reuse the Phase 5.5 collapsible content, but in this new layout they're side-by-side instead of stacked. They retain their existing functionality (× to remove blockers, propose/confirm commitments).

For Phase 6 these are NOT collapsible — they're always visible side-by-side. The Phase 5.5 collapse pattern was a mobile concession; on desktop two columns side-by-side reads better than collapsed sections.

(The collapsible-section component still exists from Phase 5.5; the OverviewTab just doesn't wrap blockers/commitments in it.)

## Acceptance

- [ ] Overview tab renders: context strip, two-column header, full read collapsed, stat strip, blockers + commitments
- [ ] Klo recommends card on the left (1.5fr), confidence panel on the right (1fr)
- [ ] On mobile (< 1024px), the two columns stack vertically
- [ ] Confidence panel shows top 3 factors only; full read has all of them when expanded
- [ ] Klo's full read collapsed by default; expands on click
- [ ] Stat strip shows 5 columns on desktop, 2-3 on mobile
- [ ] Blockers and commitments are side-by-side on desktop, stacked on mobile
- [ ] Buyer view: no confidence panel, no Klo's full read; everything else visible (with their existing buyer-mode adaptations)
- [ ] No regression: × buttons on blockers still work, commitment cards still propose/confirm

→ Next: `11-deal-stat-strip-and-blockers-commitments.md`
