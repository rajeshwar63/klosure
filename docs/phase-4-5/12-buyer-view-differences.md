# Step 12 — Buyer view differences

**Goal:** When the buyer is viewing the deal, the Overview shows `klo_take_buyer`, hides seller-only sections, and disables the × button.

## Files touched

- `OverviewView.jsx` — pass `viewerRole` correctly into all section components
- `DealRoom.jsx` — determine viewerRole based on auth context
- Section components — respect `viewerRole`

## How to determine `viewerRole`

In `DealRoom.jsx` (or wherever the deal is loaded):

```javascript
function getViewerRole(deal, currentUserId) {
  if (currentUserId && deal.seller_id === currentUserId) return 'seller';
  // Anonymous buyers (no auth) reaching the deal via /join/:token
  return 'buyer';
}
```

Pass this `viewerRole` through `<DealRoom>` → `<OverviewView>` → all section components.

## What changes for the buyer

| Section | Buyer behavior |
|---|---|
| `<KloTake>` | Renders `klo_take_buyer` (seller renders `klo_take_seller`) |
| `<DealStatStrip>` | Same data, no change |
| `<PeopleGrid>` | Renders normally, but `<RemoveButton>` is **disabled** (don't render or render greyed) |
| `<CommitmentsZone>` | Same as Phase 3 — buyer sees commitments they're allowed to see |
| `<BlockersList>` | Renders normally, **× disabled** |
| `<OpenQuestionsList>` | **Hidden** entirely — these are seller-side coaching prompts |

## Buyer's × button = hidden, not disabled

Cleanest implementation: just don't render `<RemoveButton>` if `viewerRole !== 'seller'`. The button only appears for sellers.

## Why this asymmetry is correct

- The deal record is the seller's source of truth — only they can correct Klo's interpretation
- The buyer sees an honest read of the deal but cannot edit
- The buyer's coaching is buyer-honest, not seller-friendly
- Both still see the same underlying facts (people, dates, blockers) — same data, different framing

## Acceptance

- Open the same deal as seller and as buyer (incognito + share link)
- Seller sees `klo_take_seller`, buyer sees `klo_take_buyer`
- The two takes are *honestly different* — different framing, different audience, different recommendations
- Buyer view has no × buttons anywhere
- Buyer view has no Open Questions section
- Both see the same People, Blockers, Stage, Deadline, Value (same facts)
- Provenance tooltips still work for both roles

## Quality check on the prompts

Sanity test the prompts: ask Klo a turn where the buyer just dropped a hard date. Read both `klo_take_seller` and `klo_take_buyer`:

- ✅ Seller's coaching: "lock down the date, get them on parallel tracks, push for a kickoff call"
- ✅ Buyer's coaching: "loop in your procurement now, brief your CFO, don't let the seller dictate timeline"

If they sound the same, the prompt is broken — go back to step 05 and tighten the buyer-coaching rules.

If the buyer coaching ever recommends the seller's product or trashes a competitor — also broken. Same fix.

→ Next: `13-klo-manager-update.md`
