# Step 04 — Buyer view pending arrays

**Goal:** Wire the new `pending_on_seller` / `pending_on_buyer` arrays from step 03 into the Buyer view's "On you / On vendor" sections, with buyer-friendly framing. Same arrays, different perspective.

## Why

Step 03 produces seller-perspective task arrays. The buyer view needs the same data but framed buyer-side:
- `pending_on_buyer` (what the *buyer* owes the vendor) → renders in **"On you"** column on buyer dashboard
- `pending_on_seller` (what the *seller* owes the buyer) → renders in **"On vendor"** column on buyer dashboard

For Phase 9, no separate buyer-view extraction needed — we just project the existing arrays. The buyer-view prompt doesn't regenerate these; it inherits them from the main extraction. This is intentional: tasks should be the same regardless of who's reading.

## Files to modify

- `src/components/buyer/BuyerCommitmentsTwoCol.jsx` — rename to `BuyerPendingTasksTwoCol.jsx`, rewrite to read from `klo_state.pending_on_*`
- `src/pages/BuyerDashboardPage.jsx` — pass `klo_state` instead of `commitments` array
- `src/pages/DealRoomPage.jsx` (Overview) — same component, same data source, but seller-side variant
- `supabase/functions/_shared/prompts/buyer-view-prompt.ts` — small prompt note that pending arrays are inherited, not regenerated
- `supabase/functions/_shared/buyer-view-tool.ts` — remove any pending-related fields from the buyer-view tool schema if present (they should NOT be in there)

## Component spec — BuyerPendingTasksTwoCol

Two columns side by side, equal width. Same overall styling as before, but data source changes.

```jsx
function BuyerPendingTasksTwoCol({ kloState }) {
  const onBuyer = (kloState?.pending_on_buyer ?? []).filter(t => t.status !== 'done')
  const onVendor = (kloState?.pending_on_seller ?? []).filter(t => t.status !== 'done')
  const completedBuyer = (kloState?.pending_on_buyer ?? []).filter(t => t.status === 'done')
  const completedVendor = (kloState?.pending_on_seller ?? []).filter(t => t.status === 'done')

  return (
    <div className="buyer-pending-twocol">
      <PendingColumn
        title="On you"
        items={onBuyer}
        completed={completedBuyer}
        emptyText="No pending items on you"
      />
      <PendingColumn
        title="On vendor"
        items={onVendor}
        completed={completedVendor}
        emptyText="No pending items on vendor"
      />
    </div>
  )
}

function PendingColumn({ title, items, completed, emptyText }) {
  const [showCompleted, setShowCompleted] = useState(false)

  return (
    <div className="pending-column card">
      <div className="card-header">
        <span>{title}</span>
        <span className="count">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <ul className="task-list">
          {items.map(t => <PendingTaskRow key={t.id} task={t} />)}
        </ul>
      )}

      {completed.length > 0 && (
        <button className="show-completed" onClick={() => setShowCompleted(!showCompleted)}>
          {showCompleted ? 'Hide' : 'Show'} completed ({completed.length})
        </button>
      )}

      {showCompleted && (
        <ul className="task-list completed">
          {completed.map(t => <PendingTaskRow key={t.id} task={t} muted />)}
        </ul>
      )}
    </div>
  )
}

function PendingTaskRow({ task, muted = false }) {
  const isOverdue = task.status === 'overdue' || (task.due_date && new Date(task.due_date) < new Date() && task.status === 'pending')
  const dotColor = task.status === 'done' ? 'green' : isOverdue ? 'red' : 'amber'
  const formattedDue = task.due_date ? formatRelativeDate(task.due_date) : null

  return (
    <li className={`task-row ${muted ? 'muted' : ''} ${isOverdue ? 'overdue' : ''}`}>
      <span className={`dot dot-${dotColor}`} />
      <div className="task-content">
        <div className="task-text">{task.task}</div>
        {formattedDue && <div className="task-due">{formattedDue}</div>}
      </div>
    </li>
  )
}
```

CSS notes:
- Match existing card styling — hairline border, soft shadow, generous padding
- Two columns on desktop (`grid-template-columns: 1fr 1fr; gap: 24px`)
- Single column on mobile (≤480px)
- Overdue rows get a subtle red-tinted background (~3% opacity)
- Done rows are muted (50% opacity) when shown

## Wire-up in BuyerDashboardPage

Replace the previous `<BuyerCommitmentsTwoCol commitments={commitments} />` with:

```jsx
<BuyerPendingTasksTwoCol kloState={deal.klo_state} />
```

Remove the `commitments` state and any related queries (already done in step 01, but verify).

## Wire-up in Overview (seller deal page)

The same component renders on the seller's Overview tab. Seller sees the same data with the same headers ("On you / On vendor"). The semantics are inverted vs the buyer side — for the seller, "On you" means `pending_on_seller` and "On vendor" means `pending_on_buyer`.

Add a prop to disambiguate:

```jsx
function PendingTasksTwoCol({ kloState, perspective }) {
  // perspective: 'seller' | 'buyer'
  const isSellerView = perspective === 'seller'

  const onYou = isSellerView
    ? kloState?.pending_on_seller ?? []
    : kloState?.pending_on_buyer ?? []

  const onVendor = isSellerView
    ? kloState?.pending_on_buyer ?? []
    : kloState?.pending_on_seller ?? []

  // ... rest unchanged
}
```

Then in `BuyerDashboardPage` pass `perspective="buyer"`, in Overview pass `perspective="seller"`.

Move the component to `src/components/shared/PendingTasksTwoCol.jsx` since both surfaces use it.

## Buyer-view prompt note

In `supabase/functions/_shared/prompts/buyer-view-prompt.ts`, the buyer-view extraction should NOT regenerate pending arrays. Add a note in the prompt:

```
<note>
The pending tasks (pending_on_seller, pending_on_buyer) are inherited from the main extraction — do NOT regenerate them in your output. They are not part of the emit_buyer_view tool schema. Focus on klo_brief_for_buyer, signals, playbook, stakeholders, risks, momentum, recent_moments.
</note>
```

This keeps tasks as a single source of truth in `klo_state` instead of the buyer view trying to maintain its own copy.

## What this step does NOT do

- Does NOT add buyer-perspective rewording of tasks (e.g. translating "Send SOC 2 to buyer" into "Receive SOC 2 from vendor") — both sides see the same task text, just in different columns. Phase 10 could add buyer-perspective rewording if it matters.
- Does NOT add interactive "mark done" from the UI — that's a server-write that requires more thought (overrides Klo's extraction). Defer.

## Claude Code instructions

```
1. Create src/components/shared/PendingTasksTwoCol.jsx with the perspective-aware component.
2. Delete src/components/buyer/BuyerCommitmentsTwoCol.jsx.
3. Update src/pages/BuyerDashboardPage.jsx to use the new component with perspective="buyer".
4. Update src/pages/DealRoomPage.jsx (Overview) to use the new component with perspective="seller". The Overview redesign in step 07 will integrate this properly; for now, just place it where the old commitments card was.
5. Add the inheritance note to supabase/functions/_shared/prompts/buyer-view-prompt.ts.
6. Verify supabase/functions/_shared/buyer-view-tool.ts has NO pending_on_* fields. Remove if present.
7. Deploy edge functions: supabase functions deploy klo-respond --no-verify-jwt.
8. Test: send a chat message on Emirates deal with a clear commitment. Open Buyer view tab → "On you / On vendor" should populate within ~5 seconds.
9. Open same deal's Overview tab → same component should render with seller-perspective columns.
10. Commit: "Phase 9 step 04: pending tasks UI on Buyer view + Overview"
11. Push.
```

## Acceptance

- [ ] BuyerPendingTasksTwoCol replaced with shared PendingTasksTwoCol
- [ ] Buyer dashboard "On you / On vendor" shows pending items from `klo_state.pending_on_*`
- [ ] Overview page (seller side) shows the same component, perspective inverted
- [ ] Empty states render gracefully
- [ ] Done items hidden by default, expandable via "Show completed (N)" button
- [ ] Realtime updates work (seller chat → both surfaces update without refresh)
- [ ] Buyer-view prompt no longer attempts to generate pending arrays

→ Next: `05-onboarding-modal.md`
