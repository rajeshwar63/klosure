# Step 06 — Make Overview sections collapsible

**Sprint:** C (Overview)
**Goal:** Every section below "Klo's read" is collapsible. Smart defaults: things that need attention are expanded; static reference info is collapsed.

## The problem today

After the merged Klo's read panel from step 05, the Overview still has:

- Stat strip (Stage / Value / Deadline / Health)
- Stage tracker (Discovery → Proposal → Negotiation → Legal → Closed)
- People grid
- Action zones (Needed from buyer / What we're doing) — Phase 3 commitments
- Blockers
- Decisions
- Open questions

That's 7 sections. All shown at once is overwhelming. Most of them the user has seen before and doesn't need to re-process every time.

## Default expansion rules

Sections that are **expanded by default** (always relevant, action-oriented):
- **Action zones (commitments)** — this is where the work happens

Sections that are **collapsed by default** (reference info — show count + headline):
- Stat strip detail
- Stage tracker
- People
- Blockers
- Decisions
- Open questions

When collapsed, each section shows a one-line summary so the user knows what's inside without expanding.

## Collapsed-state headlines

| Section | Collapsed headline format |
|---|---|
| Stat strip | `Proposal · $20k · 36d · At risk` |
| Stage tracker | `Currently in: Proposal (3 of 5)` |
| People | `People (3) · Nina, Ahmed, +1 unknown` |
| Blockers | `Blockers (2) · Proposal overdue, Signatory unknown` |
| Decisions | `Decisions on record (1) · Proposal + demo agreed` |
| Open questions | `Open questions (4)` |

The headline is generated from the section's data — Klo doesn't need to write it. Frontend logic.

## Files touched

- `src/components/overview/CollapsibleSection.jsx` (new) — generic wrapper
- `src/components/OverviewView.jsx` — wrap each section
- Each section component (PeopleGrid, BlockersList, etc.) — no internal changes; just wrapped externally

## CollapsibleSection component

```jsx
// CollapsibleSection.jsx
import { useState } from 'react';

export default function CollapsibleSection({
  title,           // "People", "Blockers", etc.
  count,            // 3 — shown in parens
  headline,         // "Nina, Ahmed, +1 unknown" — shown when collapsed
  defaultExpanded = false,
  expanded,         // controlled — overrides defaultExpanded if provided
  onToggle,         // controlled — called with new bool
  children,
  emptyMessage      // shown when count = 0 and section is collapsed; section is hidden if also empty AND no emptyMessage
}) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = expanded !== undefined;
  const isExpanded = isControlled ? expanded : internalExpanded;

  function toggle() {
    const next = !isExpanded;
    if (isControlled) onToggle?.(next);
    else setInternalExpanded(next);
  }

  // Hide entirely if empty and no message to show
  if (count === 0 && !emptyMessage) return null;

  return (
    <div className={`collapsible-section ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}>
      <button className="collapsible-header" onClick={toggle} aria-expanded={isExpanded}>
        <span className="collapsible-title">
          {title}{count != null ? ` (${count})` : ''}
        </span>
        {!isExpanded && headline && (
          <span className="collapsible-headline">· {headline}</span>
        )}
        <span className="collapsible-chevron">{isExpanded ? '⌃' : '⌄'}</span>
      </button>
      {isExpanded && (
        <div className="collapsible-body">
          {count === 0 && emptyMessage ? (
            <div className="collapsible-empty">{emptyMessage}</div>
          ) : children}
        </div>
      )}
    </div>
  );
}
```

## Wiring in OverviewView.jsx

```jsx
// OverviewView.jsx — after KloReadPanel
import CollapsibleSection from './overview/CollapsibleSection';

const ks = data.klo_state ?? {};
const peopleCount = (ks.people ?? []).length;
const blockersCount = (ks.blockers ?? []).length;
const decisionsCount = (ks.decisions ?? []).length;
const openQuestionsCount = (ks.open_questions ?? []).length;

return (
  <>
    <KloReadPanel klo_state={ks} viewerRole={viewerRole} />

    <CollapsibleSection
      title="Deal facts"
      headline={`${ks.stage ?? '—'} · ${formatCurrency(ks.deal_value?.amount)} · ${formatDays(ks.deadline?.date)} · ${healthLabel(data.health)}`}
    >
      <DealStatStrip state={ks} commitments={data.commitments} />
      <StageTracker state={ks} />
    </CollapsibleSection>

    <CollapsibleSection
      title="Commitments"
      defaultExpanded={true}
    >
      <ActionZones commitments={data.commitments} dealId={data.deal.id} viewerRole={viewerRole} />
    </CollapsibleSection>

    <CollapsibleSection
      title="People"
      count={peopleCount}
      headline={summarizePeople(ks.people)}
      emptyMessage="No people identified yet"
    >
      <PeopleGrid people={ks.people} viewerRole={viewerRole} dealId={data.deal.id} />
    </CollapsibleSection>

    <CollapsibleSection
      title="Blockers"
      count={blockersCount}
      headline={summarizeBlockers(ks.blockers)}
      emptyMessage="No blockers — keep it that way"
    >
      <BlockersList blockers={ks.blockers} viewerRole={viewerRole} dealId={data.deal.id} />
    </CollapsibleSection>

    <CollapsibleSection
      title="Decisions on record"
      count={decisionsCount}
      headline={ks.decisions?.[0]?.what ?? null}
      emptyMessage="No decisions on record yet"
    >
      <DecisionsList decisions={ks.decisions} viewerRole={viewerRole} dealId={data.deal.id} />
    </CollapsibleSection>

    {viewerRole === 'seller' && (
      <CollapsibleSection
        title="Open questions"
        count={openQuestionsCount}
      >
        <OpenQuestionsList questions={ks.open_questions} dealId={data.deal.id} />
      </CollapsibleSection>
    )}
  </>
);
```

Note that **Open questions is seller-only** (was already true) — but as a collapsible section, it's simply not rendered for buyers.

## Helper functions

```javascript
// services/overview.js — add:

export function summarizePeople(people) {
  if (!people || people.length === 0) return null;
  const names = people.map(p => p.name === 'Unknown' ? `+1 unknown` : p.name);
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')}, +${names.length - 2}`;
}

export function summarizeBlockers(blockers) {
  if (!blockers || blockers.length === 0) return null;
  return blockers
    .slice(0, 2)
    .map(b => b.text.length > 40 ? b.text.slice(0, 37) + '…' : b.text)
    .join(', ');
}

export function formatDays(deadlineISO) {
  if (!deadlineISO) return '—';
  const d = Math.ceil((new Date(deadlineISO) - Date.now()) / 86400000);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'today';
  if (d < 60) return `${d}d`;
  return `${Math.round(d / 30)}mo`;
}

export function healthLabel(health) {
  if (health === 'green') return 'On track';
  if (health === 'amber') return 'Stuck';
  return 'At risk';
}
```

## Visual treatment

**Collapsed row:**
- Single line, ~44px tall
- Border below for separation
- Title in primary text color
- Headline in secondary (muted) text color
- Chevron at right
- Tappable across the full width

**Expanded:**
- Existing section styles
- Top border (header) becomes the toggle row, then the content below
- Smooth ~150ms expand/collapse

## Acceptance

- [ ] Open the Overview — Klo's read is expanded; Commitments is expanded; everything else is collapsed
- [ ] Each collapsed section shows count + headline that summarizes contents
- [ ] Tap any section header — expands; tap again — collapses
- [ ] Empty sections (e.g. Decisions = 0) show an empty message when expanded; if no empty message defined, hidden entirely
- [ ] Buyer view: Open questions section is not rendered at all
- [ ] Buyer view: × buttons inside expanded People/Blockers/etc. are still hidden (existing behavior preserved)
- [ ] No data loss — every section's content is available; just collapsed by default
- [ ] Mobile 375px: section headers wrap cleanly; chevrons stay at right edge

(Persistence comes in step 07 — for now, expansion state resets every page load.)

→ Next: `07-overview-persistence.md`
