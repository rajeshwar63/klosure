# Step 07 — Persist collapsed sections per deal

**Sprint:** C (Overview)
**Goal:** When a user collapses or expands a section in a specific deal, that state is remembered the next time they open that same deal — but doesn't affect other deals.

## Why per-deal

Each deal has its own context. Maybe the seller has 4 stakeholders on DIB and wants People expanded all the time. On Aramco, only 1 stakeholder — collapsed is fine. Cross-deal preferences would be wrong because every deal needs different things foregrounded.

This is the same pattern Phase 3.5 used for the Chat/Overview tab toggle (`klosure:lastTab:{dealId}`).

## Storage shape

`localStorage` key: `klosure:overviewSections:{dealId}`

Value: a JSON object mapping section keys to bools:

```json
{
  "deal_facts": false,
  "commitments": true,
  "people": true,
  "blockers": false,
  "decisions": false,
  "open_questions": false
}
```

`true` = expanded, `false` = collapsed. Only sections the user has touched are stored — first-time defaults from step 06 still apply for sections not in the object.

## Files touched

- `src/services/overviewSections.js` (new) — small storage wrapper
- `src/components/OverviewView.jsx` — wire up state, pass to each `<CollapsibleSection>` as controlled

## Storage helper

```javascript
// services/overviewSections.js

const PREFIX = 'klosure:overviewSections:';

export function loadSectionState(dealId) {
  try {
    const raw = localStorage.getItem(PREFIX + dealId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSectionState(dealId, state) {
  try {
    localStorage.setItem(PREFIX + dealId, JSON.stringify(state));
  } catch {
    // localStorage might be full or disabled — non-critical, just give up
  }
}

export function setSectionExpanded(dealId, sectionKey, expanded) {
  const current = loadSectionState(dealId);
  current[sectionKey] = expanded;
  saveSectionState(dealId, current);
}

// Returns the user's stored value, or the default if untouched
export function getSectionExpanded(dealId, sectionKey, defaultValue) {
  const state = loadSectionState(dealId);
  return sectionKey in state ? state[sectionKey] : defaultValue;
}
```

## Wiring in OverviewView

```jsx
// OverviewView.jsx
import { useState, useCallback } from 'react';
import { loadSectionState, setSectionExpanded } from '../services/overviewSections';

export default function OverviewView({ dealId, viewerRole, data }) {
  const [sectionState, setSectionState] = useState(() => loadSectionState(dealId));

  const toggle = useCallback((key, defaultValue) => (next) => {
    setSectionExpanded(dealId, key, next);
    setSectionState(prev => ({ ...prev, [key]: next }));
  }, [dealId]);

  function isExpanded(key, defaultValue) {
    return key in sectionState ? sectionState[key] : defaultValue;
  }

  // ... existing data extraction (ks, peopleCount, etc.) ...

  return (
    <>
      <KloReadPanel klo_state={ks} viewerRole={viewerRole} />

      <CollapsibleSection
        title="Deal facts"
        headline={`${ks.stage ?? '—'} · ${formatCurrency(ks.deal_value?.amount)} · ${formatDays(ks.deadline?.date)} · ${healthLabel(data.health)}`}
        expanded={isExpanded('deal_facts', false)}
        onToggle={toggle('deal_facts')}
      >
        <DealStatStrip state={ks} commitments={data.commitments} />
        <StageTracker state={ks} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Commitments"
        expanded={isExpanded('commitments', true)}
        onToggle={toggle('commitments')}
      >
        <ActionZones commitments={data.commitments} dealId={data.deal.id} viewerRole={viewerRole} />
      </CollapsibleSection>

      <CollapsibleSection
        title="People"
        count={peopleCount}
        headline={summarizePeople(ks.people)}
        emptyMessage="No people identified yet"
        expanded={isExpanded('people', false)}
        onToggle={toggle('people')}
      >
        <PeopleGrid people={ks.people} viewerRole={viewerRole} dealId={data.deal.id} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Blockers"
        count={blockersCount}
        headline={summarizeBlockers(ks.blockers)}
        emptyMessage="No blockers — keep it that way"
        expanded={isExpanded('blockers', false)}
        onToggle={toggle('blockers')}
      >
        <BlockersList blockers={ks.blockers} viewerRole={viewerRole} dealId={data.deal.id} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Decisions on record"
        count={decisionsCount}
        headline={ks.decisions?.[0]?.what ?? null}
        emptyMessage="No decisions on record yet"
        expanded={isExpanded('decisions', false)}
        onToggle={toggle('decisions')}
      >
        <DecisionsList decisions={ks.decisions} viewerRole={viewerRole} dealId={data.deal.id} />
      </CollapsibleSection>

      {viewerRole === 'seller' && (
        <CollapsibleSection
          title="Open questions"
          count={openQuestionsCount}
          expanded={isExpanded('open_questions', false)}
          onToggle={toggle('open_questions')}
        >
          <OpenQuestionsList questions={ks.open_questions} dealId={data.deal.id} />
        </CollapsibleSection>
      )}
    </>
  );
}
```

## Reset on deal change

When the user navigates from one deal to another, `dealId` changes, and the `useState(() => loadSectionState(dealId))` initializer runs again with the new key. State is loaded fresh per deal — no leakage.

If for any reason this doesn't reset (e.g. React re-uses the component), force it with a key on the parent:

```jsx
<OverviewView key={dealId} dealId={dealId} ... />
```

## Storage size

Each deal stores a small JSON object — under 200 bytes. localStorage limit is ~5MB per origin. Even with 1000 deals, this uses 0.04% of available storage. Non-issue.

## Privacy

localStorage is per-origin and per-device — not synced anywhere. Stays on the user's browser. No PII concerns.

## Acceptance

- [ ] On DIB deal: collapse the People section. Refresh the page. People stays collapsed.
- [ ] On the same DIB deal: expand Blockers. Refresh. Blockers stays expanded.
- [ ] Navigate to a different deal. Section state should reflect that deal's stored preferences (or defaults if untouched).
- [ ] Navigate back to DIB. Your earlier choices are preserved.
- [ ] Open DevTools → Application → Local Storage. See entries like `klosure:overviewSections:{uuid}` for each deal you've customized.
- [ ] Untouched sections (you haven't clicked them) follow the defaults from step 06: Commitments expanded; everything else collapsed.
- [ ] No regression to the section content — collapsing/expanding never causes data loss or layout shift on mount.

→ Next: `08-acceptance-walkthrough.md`
