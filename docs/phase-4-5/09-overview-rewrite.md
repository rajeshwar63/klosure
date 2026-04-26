# Step 09 — Rewrite `OverviewView.jsx` to render from `klo_state`

**Goal:** The Overview reads `deals.klo_state` instead of legacy fields. No hover tooltips yet (step 10) and no × button yet (step 11). Just rendering.

## Files touched

- `src/components/OverviewView.jsx` — rewritten
- `src/services/overview.js` — replace `getOverviewData` to load `klo_state`

## Service change

Replace the body of `getOverviewData(dealId)` with:

```javascript
export async function getOverviewData(dealId) {
  const [dealRes, commitmentsRes] = await Promise.all([
    supabase.from('deals').select('*').eq('id', dealId).single(),
    supabase.from('commitments').select('*').eq('deal_id', dealId)
  ]);
  if (dealRes.error) throw dealRes.error;

  return {
    deal: dealRes.data,
    kloState: dealRes.data.klo_state ?? null,
    commitments: commitmentsRes.data ?? []
  };
}
```

Keep the Phase 3.5 derivation helpers (`deriveStats`, etc.) that still apply to commitments — but the people/deadline/value/blockers data now flows from `kloState`, not legacy fields.

## Component structure

`OverviewView.jsx` becomes:

```jsx
export default function OverviewView({ dealId, viewerRole }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    getOverviewData(dealId).then(setData);
    // realtime subscription on deals row to pick up klo_state updates
    const channel = supabase
      .channel(`deal-${dealId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'deals', filter: `id=eq.${dealId}` },
          (payload) => {
            setData(prev => prev ? { ...prev, deal: payload.new, kloState: payload.new.klo_state } : prev);
          })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dealId]);

  if (!data) return <OverviewSkeleton />;

  const ks = data.kloState;
  if (!ks) return <EmptyKloState dealId={dealId} />;  // shown for legacy deals before first turn

  return (
    <div className="overview">
      <KloTake state={ks} viewerRole={viewerRole} />
      <DealStatStrip state={ks} commitments={data.commitments} />
      <PeopleGrid people={ks.people} viewerRole={viewerRole} />
      <CommitmentsZone commitments={data.commitments} />
      <BlockersList blockers={ks.blockers} viewerRole={viewerRole} />
      {viewerRole === 'seller' && <OpenQuestionsList items={ks.open_questions} />}
    </div>
  );
}
```

## Section components

### `<KloTake />`

Top of the Overview. Light blue background. Renders `klo_take_seller` for sellers, `klo_take_buyer` for buyers.

```jsx
function KloTake({ state, viewerRole }) {
  const text = viewerRole === 'buyer' ? state.klo_take_buyer : state.klo_take_seller;
  if (!text) return null;
  return (
    <div className="klo-take">
      <span className="klo-take-icon">◆</span>
      <p>{text}</p>
    </div>
  );
}
```

### `<DealStatStrip />`

Four cells: stage, value, deadline, health. Mobile collapses to 2x2.

- **Stage** — `state.stage` title-cased.
- **Value** — `{currency} {amount}`. If `confidence === 'tentative'`, suffix with italic "(tentative)".
- **Deadline** — `state.deadline.date` formatted nicely. If tentative, render in amber color and add `was {previous}` underneath.
- **Health** — derive in JS:
  - red if any commitment overdue AND deadline within 14 days
  - amber if any commitment overdue OR `state.deadline?.confidence === 'tentative'` OR `state.deal_value?.confidence === 'tentative'`
  - else green
  - render with a colored dot and label ("On track" / "Stuck" / "At risk")

### `<PeopleGrid />`

Grid of person cards from `state.people`. 5 cols desktop, 2 mobile. Initials avatar, name, role.

For now, no × button (step 11). Just render.

If `state.people` is empty, render: *"Klo will add people as they appear in the chat."*

### `<CommitmentsZone />`

Unchanged from Phase 3.5 — still renders from `commitments` table with the buyer/seller split.

### `<BlockersList />`

Vertical list of `state.blockers`. Each item: severity dot (color from `severity` field), text, `since` date in muted text.

For now, no × button. Just render.

### `<OpenQuestionsList />`

Seller-only. Vertical list of `state.open_questions`. Plain text items with a `?` icon.

### `<EmptyKloState />`

Shown when `klo_state` is null (legacy deal not yet bootstrapped). Render:

> *"Klo hasn't read this deal yet. Send a message to the chat — Klo will catch up on the conversation and start tracking."*

## Style notes

- Use existing Klosure design tokens. No new colors, no new fonts.
- Tentative dates / values use amber color (existing `--amber` token).
- Confidence indicators: small italic "(tentative)" — not a separate badge.

## Acceptance

- All Overview sections render from `klo_state` for a deal that has been bootstrapped
- Realtime updates: send a chat message, Overview updates without page refresh
- Buyer view shows `klo_take_buyer` and hides `<OpenQuestionsList />`
- Legacy deal (no klo_state) shows `<EmptyKloState />`
- No regressions to chat view

→ Next: `10-provenance-tooltips.md`
