# Step 03 — Render confidence inside the deal Overview

**Sprint:** 1
**Goal:** New section at the top of `OverviewView.jsx` showing confidence score, trend, dragging factors, and what would raise it.

## File touched

- `src/components/overview/ConfidencePanel.jsx` — new
- `src/components/OverviewView.jsx` — render the panel above the existing sections (but below `<KloTake>`)

## Component structure

```jsx
// ConfidencePanel.jsx
import './confidence-panel.css'; // or inline; match existing convention

export default function ConfidencePanel({ confidence }) {
  if (!confidence) {
    return (
      <div className="confidence-panel confidence-empty">
        <div className="confidence-empty-text">Klo is still reading this deal — confidence will appear after the next message.</div>
      </div>
    );
  }

  const { value, trend, delta, factors_dragging_down, factors_to_raise, rationale } = confidence;

  const tone = value >= 60 ? 'good' : value >= 35 ? 'caution' : 'risk';

  return (
    <div className={`confidence-panel tone-${tone}`}>

      <div className="confidence-header">
        <span className="confidence-tag">◆ Klo's read</span>
        <span className="confidence-label">Confidence to close by deadline</span>
      </div>

      <div className="confidence-score-row">
        <span className={`confidence-number tone-${tone}`}>{value}%</span>
        <div className="confidence-bar-wrap">
          <div className="confidence-bar-track">
            <div className={`confidence-bar-fill tone-${tone}`} style={{ width: `${value}%` }} />
          </div>
          <div className="confidence-bar-meta">
            <TrendChip trend={trend} delta={delta} />
          </div>
        </div>
      </div>

      <div className="confidence-rationale">{rationale}</div>

      {factors_to_raise && factors_to_raise.length > 0 && (
        <>
          <div className="confidence-section-label">What would move this score up</div>
          <div className="confidence-factor-list">
            {factors_to_raise.map((f, i) => (
              <div key={i} className="confidence-factor-row">
                <span className="impact-pill impact-positive">+{f.impact}%</span>
                <span className="factor-label">{f.label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="confidence-footnote">
        Klo's structured assessment, recomputed every turn — not a calibrated probability
      </div>
    </div>
  );
}

function TrendChip({ trend, delta }) {
  if (trend === 'flat' || delta === 0) {
    return <span className="trend-chip trend-flat">stable</span>;
  }
  const arrow = trend === 'up' ? '↑' : '↓';
  const cls = trend === 'up' ? 'trend-up' : 'trend-down';
  return <span className={`trend-chip ${cls}`}>{arrow} {Math.abs(delta)} pts</span>;
}
```

## Styling notes

Follow Klosure's existing tokens. The three tones map to existing colors:

- `tone-good` (≥60): green accent, green text, green bar fill
- `tone-caution` (35-59): amber accent, amber text, amber bar fill
- `tone-risk` (<35): red accent, red text, red bar fill

Spacing: matches the existing `<KloTake>` panel — same padding, same border-radius, same font sizes.

The number itself is the visual anchor — make it ~36px, weight 500. Everything else is supporting text.

## Where to render in `OverviewView.jsx`

```jsx
// In OverviewView.jsx, between <KloTake> and <DealStatStrip>:

<KloTake state={ks} viewerRole={viewerRole} />
<ConfidencePanel confidence={ks.confidence} />
<DealStatStrip state={ks} commitments={data.commitments} />
{/* ...rest unchanged */}
```

## Buyer view

For now, **show the confidence panel to sellers only**. Hide it from buyers — the score and "what would raise it" framing is seller-side coaching.

```jsx
{viewerRole === 'seller' && <ConfidencePanel confidence={ks.confidence} />}
```

(Future: Phase 5.5 could add a buyer-side variant — "Is this deal moving?" with buyer-relevant factors. Out of scope now.)

## What NOT to render

- **Don't show factors_dragging_down explicitly.** They're already implicit in the rationale. Showing them as a list duplicates the narrative and risks feeling like a "blame list."
- **Don't show provenance tooltips on the score itself.** The confidence is Klo's synthesis, not a single fact — there's no one source message to point at. The factors are also synthetic.
- **Don't allow the seller to "edit" or "override" the score.** This is the principle from Phase 4.5 — Klo's read is the record. If the seller disagrees, they continue the conversation.

## Acceptance

- Open a deal that has confidence data — see the panel render at the top of the Overview
- Score, bar, and trend chip all match the values in the database
- Three tones (good/caution/risk) render with correct colors as the score crosses 60 and 35
- Send a chat message that materially changes the deal (e.g., a new commitment is made) — score updates without page refresh (realtime subscription on `deals` already wired)
- Trend chip correctly shows direction and delta after a real change
- Buyer view (incognito + share link) does NOT show the confidence panel
- Mobile (375px) layout: number stays prominent, factors stack cleanly

→ Next (Sprint 2): `04-dashboard-sort.md`
