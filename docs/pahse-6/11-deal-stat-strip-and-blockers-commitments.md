# Step 11 — Blockers and Commitments panels (cleanup)

**Sprint:** C
**Goal:** Polish the side-by-side Blockers and Commitments panels in the new Overview. Reuse Phase 5.5 logic; adapt visual treatment to the new card style.

## Files

- `src/components/deal/BlockersPanel.jsx` — new wrapper component
- `src/components/deal/CommitmentsPanel.jsx` — new wrapper component
- The internal Phase 5.5 `BlockersList` and `ActionZones` (or whatever the underlying components are called) are reused inside these wrappers

## BlockersPanel

```jsx
export default function BlockersPanel({ klo_state, viewerRole, dealId }) {
  const blockers = klo_state?.blockers ?? [];
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-white border-tertiary rounded-xl p-4 md:p-5"
      style={{ borderWidth: '0.5px' }}>

      <div className="flex justify-between items-baseline mb-3">
        <button onClick={() => setExpanded(e => !e)}
          className="text-xs font-medium tracking-wider text-secondary flex items-center gap-1.5">
          <span>{expanded ? '⌃' : '⌄'}</span>
          BLOCKERS · {blockers.length}
        </button>
        {viewerRole === 'seller' && (
          <button className="text-[10px] text-info">+ Add</button>
        )}
      </div>

      {expanded && (
        blockers.length === 0 ? (
          <div className="text-xs text-tertiary py-2">No blockers — keep it that way.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {blockers.map((b, i) => (
              <BlockerRow key={i} blocker={b} viewerRole={viewerRole} dealId={dealId} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function BlockerRow({ blocker, viewerRole, dealId }) {
  return (
    <div className="flex gap-2 items-start group">
      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dotForSeverity(blocker.severity)}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs leading-snug">{blocker.text}</div>
        <div className="text-[10px] text-tertiary mt-0.5">since {formatShortDate(blocker.since)}</div>
      </div>
      {viewerRole === 'seller' && (
        <RemoveButton kind="blockers" value={blocker} dealId={dealId} />
      )}
    </div>
  );
}

function dotForSeverity(severity) {
  if (severity === 'red') return 'bg-[#E24B4A]';
  if (severity === 'amber') return 'bg-[#BA7517]';
  return 'bg-[#639922]';
}
```

`RemoveButton` is the existing × component from Phase 4.5 — reused as-is.

## CommitmentsPanel

This rehouses the Phase 3 commitment functionality. Two zones inside one panel:

```jsx
export default function CommitmentsPanel({ commitments, dealId, viewerRole }) {
  const [expanded, setExpanded] = useState(true);
  const sellerSide = (commitments ?? []).filter(c => c.owner === 'seller' && c.status !== 'done');
  const buyerSide = (commitments ?? []).filter(c => c.owner === 'buyer' && c.status !== 'done');

  return (
    <div className="bg-white border-tertiary rounded-xl p-4 md:p-5"
      style={{ borderWidth: '0.5px' }}>

      <div className="flex justify-between items-baseline mb-3">
        <button onClick={() => setExpanded(e => !e)}
          className="text-xs font-medium tracking-wider text-secondary flex items-center gap-1.5">
          <span>{expanded ? '⌃' : '⌄'}</span>
          COMMITMENTS · {sellerSide.length + buyerSide.length}
        </button>
        {viewerRole === 'seller' && (
          <button className="text-[10px] text-info">+ Add</button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-3">
          <CommitmentZone label="What we're doing" commitments={sellerSide} owner="seller" emptyMessage="Nothing pending on our end" />
          <CommitmentZone label="Needed from buyer" commitments={buyerSide} owner="buyer" emptyMessage="Nothing pending from them" />
        </div>
      )}
    </div>
  );
}

function CommitmentZone({ label, commitments, emptyMessage }) {
  return (
    <div>
      <div className="text-[10px] font-medium tracking-wider text-secondary mb-1">{label}</div>
      {commitments.length === 0 ? (
        <div className="text-[11px] text-tertiary italic py-2">{emptyMessage}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {commitments.map(c => <CommitmentRow key={c.id} commitment={c} />)}
        </div>
      )}
    </div>
  );
}

function CommitmentRow({ commitment }) {
  const isOverdue = commitment.status === 'overdue';
  return (
    <div className={`rounded-md px-3 py-2 ${isOverdue ? 'bg-[#FCEBEB]' : 'bg-secondary'}`}>
      <div className="text-xs mb-1">{commitment.task}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {isOverdue && (
          <span className="bg-[#F09595] text-[#501313] text-[10px] px-2 py-0.5 rounded-full font-medium">
            Overdue {daysOverdue(commitment.due_date)}d
          </span>
        )}
        {!isOverdue && (
          <span className="text-[10px] text-tertiary">due {formatShortDate(commitment.due_date)}</span>
        )}
        {commitment.assignee_name && (
          <span className="text-[10px] text-tertiary">{commitment.assignee_name}</span>
        )}
      </div>
    </div>
  );
}
```

## Mobile behavior

On mobile (< 768px) the BlockersPanel and CommitmentsPanel stack vertically (already handled by the parent OverviewTab grid `grid-cols-1 md:grid-cols-2`).

Each panel still has its expand/collapse toggle — useful on mobile where vertical space is precious.

## Reuse from Phase 5.5

- `RemoveButton` for blocker × — unchanged
- The commitment confirmation flow (Phase 3) — unchanged
- The `+ Add` buttons are placeholder-only for now (no functionality wired); they'll be wired in a future phase

## Acceptance

- [ ] Blockers panel renders with header + count + collapse toggle
- [ ] Each blocker row shows severity dot, text, since-date, and × button (for sellers)
- [ ] Commitments panel renders with header + count + collapse toggle + two zones inside
- [ ] Each zone shows its commitments or an empty message
- [ ] Overdue commitments have red background tint and overdue badge
- [ ] Both panels collapse independently
- [ ] On desktop they sit side-by-side; on mobile they stack
- [ ] No regression to existing × functionality or commitment proposal flow

→ Next (Sprint D): `12-manager-home-page.md`
