# Step 05 — Merge Klo's take and Klo's read into one section

**Sprint:** C (Overview)
**Goal:** The Overview's top section becomes a single combined panel — confidence number on the left, Klo's coaching paragraph + factors on the right. Two cards saying related things become one card saying it well.

## The problem today

The Overview opens with two adjacent cards:

1. **Klo's take** — a 2-3 sentence coaching paragraph in a blue panel
2. **Klo's read** — confidence number + rationale + "what would move this score up" in a yellow panel

Both are saying things about the same deal at the same moment. They visually compete and create unnecessary cognitive load. Either the user reads both (twice the work) or skims both (gets less from each).

## The new layout

Single combined panel with two columns on desktop, stacked on mobile:

```
┌──────────────────────────────────────────────────────────┐
│ ◆ KLO'S READ                                             │
│                                                          │
│  ┌────────┐  Klo's coaching paragraph (formerly          │
│  │  42%   │  "Klo's take") — 2-3 sentences, this is      │
│  │  ↓ 2pt │  the headline. Tells the user what to do.    │
│  └────────┘                                              │
│                                                          │
│  Strong buyer urgency (June 1st confirmed) and genuine   │
│  interest, but the proposal is overdue and the signing   │
│  authority is unknown — two compounding issues that      │
│  historically derail tight-deadline deals.               │
│                                                          │
│  ─────────────────────────────────────────────────       │
│                                                          │
│  WHAT WOULD MOVE THIS SCORE UP                           │
│  +18%  Send proposal today — before Monday demo          │
│  +15%  Ask Ahmed directly who signs the contract         │
│  +8%   Get buyer confirmation of $20k budget             │
│  +7%   Scope emanation course content with Nina          │
└──────────────────────────────────────────────────────────┘
```

One card. Yellow background (the existing "Klo's read" tint). The confidence number is the visual anchor. The coaching is the headline. The rationale is the supporting evidence. The factors are the actions.

## Files touched

- `src/components/overview/KloReadPanel.jsx` (new) — combines what was in `KloTake` and `ConfidencePanel`
- `src/components/OverviewView.jsx` — replace the two existing components with this one
- `src/components/overview/ConfidencePanel.jsx` — DELETE (logic moves into KloReadPanel)
- `src/components/KloTake.jsx` — DELETE (same)

## Component

```jsx
// KloReadPanel.jsx
export default function KloReadPanel({ klo_state, viewerRole }) {
  const c = klo_state?.confidence;
  const take = viewerRole === 'buyer' ? klo_state?.klo_take_buyer : klo_state?.klo_take_seller;

  if (!c && !take) {
    return (
      <div className="klo-read-panel klo-read-empty">
        <div className="klo-read-empty-text">
          Klo is still reading this deal — coaching will appear after the next message.
        </div>
      </div>
    );
  }

  // Buyer never sees the score / factors / rationale — that's seller-private coaching
  if (viewerRole === 'buyer') {
    return (
      <div className="klo-read-panel klo-read-buyer">
        <div className="klo-read-tag">◆ Klo</div>
        <div className="klo-read-take">{take}</div>
      </div>
    );
  }

  const tone = c.value >= 60 ? 'good' : c.value >= 35 ? 'caution' : 'risk';

  return (
    <div className={`klo-read-panel tone-${tone}`}>
      <div className="klo-read-header">
        <span className="klo-read-tag">◆ Klo's read</span>
        <span className="klo-read-meta">Confidence to close by deadline</span>
      </div>

      <div className="klo-read-body">
        <div className="klo-read-score-block">
          <div className={`klo-read-number tone-${tone}`}>{c.value}%</div>
          <TrendChip trend={c.trend} delta={c.delta} />
        </div>

        <div className="klo-read-text-block">
          {take && <div className="klo-read-take">{take}</div>}
          {c.rationale && <div className="klo-read-rationale">{c.rationale}</div>}
        </div>
      </div>

      {c.factors_to_raise?.length > 0 && (
        <div className="klo-read-factors">
          <div className="klo-read-section-label">What would move this score up</div>
          {c.factors_to_raise.map((f, i) => (
            <div key={i} className="klo-read-factor-row">
              <span className="impact-pill impact-positive">+{f.impact}%</span>
              <span className="factor-label">{f.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="klo-read-footnote">
        Klo's structured assessment, recomputed every turn — not a calibrated probability
      </div>
    </div>
  );
}

function TrendChip({ trend, delta }) {
  if (!trend || trend === 'flat' || delta === 0) return <span className="trend-chip trend-flat">stable</span>;
  const arrow = trend === 'up' ? '↑' : '↓';
  const cls = trend === 'up' ? 'trend-up' : 'trend-down';
  return <span className={`trend-chip ${cls}`}>{arrow} {Math.abs(delta)} pts</span>;
}
```

## Layout CSS

```css
.klo-read-panel {
  background: var(--klo-bg);
  border: 0.5px solid var(--klo-border);
  border-radius: var(--border-radius-lg);
  padding: 1.25rem;
  margin-bottom: 1rem;
}

.klo-read-body {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1.25rem;
  align-items: start;
}

.klo-read-score-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.klo-read-number {
  font-size: 44px;
  font-weight: 500;
  line-height: 1;
}

@media (max-width: 480px) {
  .klo-read-body {
    grid-template-columns: 1fr;
  }
  .klo-read-score-block {
    flex-direction: row;
    justify-content: flex-start;
    gap: 12px;
  }
  .klo-read-number {
    font-size: 36px;
  }
}
```

On desktop, two-column. On mobile (≤480px), stacks: score+trend in a row, then text, then factors.

## OverviewView.jsx — wiring

Replace:

```jsx
{/* OLD */}
<KloTake state={ks} viewerRole={viewerRole} />
{viewerRole === 'seller' && <ConfidencePanel confidence={ks.confidence} />}
```

With:

```jsx
{/* NEW */}
<KloReadPanel klo_state={ks} viewerRole={viewerRole} />
```

## Important — buyer view stays honest

The buyer panel shows ONLY:
- The Klo tag
- The buyer-side take (`klo_take_buyer`)

No score. No trend. No "what would move this up" — those are seller-private coaching artifacts. The buyer's whole experience of Klo's read is just: "here's what you should do this week."

## Acceptance

- [ ] Open any deal Overview → see ONE combined Klo's read panel at the top
- [ ] Score, trend, take, rationale, factors all present in correct positions
- [ ] No standalone "Klo's take" card above (it's been merged in)
- [ ] No standalone confidence panel below (also merged in)
- [ ] Buyer view (incognito + share link): sees only the take, no score/factors/rationale
- [ ] Tone (good/caution/risk) drives the visual tint
- [ ] Mobile 375px: stacks vertically, score and trend on one row, text below, factors below
- [ ] No regression to anything below this panel (stat strip, stage tracker, people, etc. — those come next)

→ Next: `06-overview-collapsible-sections.md`
