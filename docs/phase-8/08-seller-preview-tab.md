# Step 08 — Seller's "Buyer view" preview tab

**Sprint:** C
**Goal:** On the seller's deal page, add a "Buyer view" tab that renders the buyer dashboard exactly as the buyer sees it. This is the conversion surface — the moment the seller realizes Klo is doing real work for the buyer too, and that they're getting their money's worth.

## Files

- `src/pages/DealRoomPage.jsx` — add tab navigation
- `src/components/seller/BuyerViewPreview.jsx` — new wrapper that renders `<BuyerDashboardPage>` content with seller-context framing
- (Reuse all 12 components from step 07)

## Tab placement

The seller's deal page already has the chat + Overview structure. Add a tab strip at the top of the deal page (or wherever the existing nav lives):

```
[Chat]  [Overview]  [Buyer view]
```

If the existing layout doesn't have tabs yet, introduce them now. Tabs match the existing visual language (whatever style is already used for nav elements). On mobile, tabs may collapse to a horizontal scrollable strip or a segmented control.

URL pattern: `/deal/:id?view=buyer` or `/deal/:id/buyer` — match whatever the existing routing pattern uses.

## Tab content

The "Buyer view" tab renders **exactly** the same UI as the buyer sees, with two additions:

### 1. Seller framing banner (top of tab)

Before the dashboard renders, show a subtle banner across the full width:

```
┌──────────────────────────────────────────────────────────────┐
│ 👁  This is what {buyer_company} sees                          │
│    Updated 4 minutes ago by Klo · based on your conversations │
└──────────────────────────────────────────────────────────────┘
```

- Subtle background tint (very light, accent-tinted)
- Eye icon + plain-language "what your buyer sees"
- Right side: small action — `Refresh now` button (only shown if buyer_view exists). Triggers a manual buyer-view regeneration (see "Manual refresh" below).
- The "Updated X minutes ago" is the relative time from `buyer_view.generated_at`

This banner is the **only** visual difference between the seller's preview and the actual buyer view. Resist adding more chrome — the value moment depends on the seller experiencing what the buyer experiences.

### 2. Component reuse

Import and render `<BuyerDashboardPage>`'s component tree directly. Don't duplicate components.

```jsx
import { BuyerDealHeader } from '../components/buyer/BuyerDealHeader'
import { BuyerKloBriefHero } from '../components/buyer/BuyerKloBriefHero'
// ... etc

function BuyerViewPreview({ deal, commitments }) {
  const buyerView = deal.klo_state?.buyer_view

  return (
    <div className="seller-buyer-preview">
      <SellerPreviewBanner deal={deal} buyerView={buyerView} />

      {!buyerView ? (
        <BuyerEmptyState />
      ) : (
        <div className="buyer-dashboard">
          <BuyerDealHeader deal={deal} />
          <BuyerKloBriefHero buyerView={buyerView} />
          <BuyerSignalsRow signals={buyerView.signals} />
          <BuyerPlaybookCard playbook={buyerView.playbook} dealId={deal.id} />
          {/* ...all the same components in the same order... */}
        </div>
      )}
    </div>
  )
}
```

## Manual refresh

The `Refresh now` button in the banner triggers a one-off buyer-view regeneration:

- POST to `/functions/v1/klo-respond` with a special body: `{ deal_id, regenerate_buyer_view: true }` — OR introduce a tiny new endpoint `klo-buyer-view-refresh` that just does the buyer-view extraction without a chat turn.
- Recommendation: **add the optional flag to klo-respond**. It already has all the logic. When the flag is true and the request has no new message, it skips the main extraction and runs only the buyer-view generation, marking it `generation_reason: 'manual_refresh'`.
- UI: while the refresh is running, button text becomes "Refreshing..." and is disabled. On completion, button reverts and the dashboard re-renders via realtime (no manual reload).
- Rate limit (client-side): max 1 manual refresh per 30 seconds per deal. Prevents accidental double-clicks.

### Edge function change for manual refresh

In `supabase/functions/klo-respond/index.ts`:

```typescript
const { regenerate_buyer_view } = body

if (regenerate_buyer_view) {
  // Skip main extraction. Load current klo_state. Run buyer-view extraction.
  // Mark generation_reason = 'manual_refresh'.
  // Return immediately.

  // ...load deal, sellerProfile...
  const currentState = deal.klo_state ?? null
  if (!currentState) {
    return json({ error: 'no klo_state to base buyer view on' }, 400)
  }

  const buyerViewPrompt = buildBuyerViewPrompt({
    // ... usual args ...
    currentState,
    sellerProfile,
    previousMomentumScore: currentState.buyer_view?.momentum_score ?? null,
  })

  const result = await callLlm({
    systemPrompt: buyerViewPrompt,
    messages: [{ role: 'user', content: 'Emit the buyer dashboard.' }],
    tool: BUYER_VIEW_TOOL,
    maxTokens: 1500,
    temperature: 0.6,
  })

  if (!result.toolCalled) {
    return json({ error: 'tool not called' }, 502)
  }

  const buyerView = (result.input as any).buyer_view
  buyerView.generated_at = new Date().toISOString()
  buyerView.generation_reason = 'manual_refresh'
  buyerView.momentum_history = [
    ...(currentState.buyer_view?.momentum_history ?? []),
    { date: buyerView.generated_at, score: buyerView.momentum_score },
  ].slice(-30)

  const mergedState = { ...currentState, buyer_view: buyerView }
  await sb.from('deals').update({ klo_state: mergedState }).eq('id', deal.id)

  return json({ ok: true, buyer_view: buyerView })
}
```

Realtime will deliver the update to the seller's preview tab automatically.

## Auto-refresh indicator

When the realtime channel receives a `klo_state.buyer_view.generated_at` change, briefly highlight the banner:

```
┌──────────────────────────────────────────────────────────────┐
│ ✨ Klo just updated your buyer's dashboard                    │
└──────────────────────────────────────────────────────────────┘
```

Show this for 4 seconds, then revert to the standard banner. This is part of the value moment — the seller literally sees Klo working.

## Notification on dashboard

Optional but recommended for the conversion moment: on the **seller's main dashboard** (the deals list), add a subtle indicator next to deals where buyer_view was updated since the seller last viewed it.

- Track last-viewed timestamp per deal in localStorage: `klosure:lastViewedBuyerView:{dealId}`
- If `buyer_view.generated_at > lastViewed`, show a tiny "✨ Buyer view updated" badge on the deal row
- Clicking the deal opens the Buyer view tab directly (preserves the value moment)

## What this step does NOT do

- Does NOT let the seller edit the buyer view directly — buyer view is generated, not authored
- Does NOT add per-section "regenerate just this" controls — full regeneration only
- Does NOT add a "share to buyer" button — buyer access is via the existing buyer_token URL, no change

## Claude Code instructions

```
1. Add tab navigation to src/pages/DealRoomPage.jsx (or the existing seller deal page).
2. Create src/components/seller/BuyerViewPreview.jsx that renders the buyer-side components with the SellerPreviewBanner on top.
3. Add the regenerate_buyer_view flag to supabase/functions/klo-respond/index.ts (handle case where flag is true and no new message — skip main extraction, just run buyer-view).
4. Add the rate limit on the client side for the Refresh button.
5. Add the realtime auto-refresh indicator (✨ banner for 4 seconds when buyer_view updates).
6. Add the lastViewedBuyerView localStorage tracking on the seller dashboard for the "✨ Buyer view updated" badge.
7. Deploy klo-respond: `supabase functions deploy klo-respond --no-verify-jwt`
8. Test the full flow on a real deal:
   a. Send a chat message → switch to Buyer view tab → see the dashboard
   b. Click Refresh now → see "Refreshing..." → see updated dashboard
   c. Send another material chat → switch back to Buyer view → see ✨ banner appear briefly
   d. Open buyer URL in incognito → confirm content is identical (minus the SellerPreviewBanner)
9. Commit: "Phase 8 step 08: seller preview tab + manual refresh"
10. Push.
```

## Acceptance

- [ ] Buyer view tab renders the full dashboard inside the seller's deal page
- [ ] SellerPreviewBanner shows "what buyer sees" + last-updated time
- [ ] Refresh now button triggers regeneration; UI re-renders within ~3-5 seconds
- [ ] Rate limit prevents rapid clicks
- [ ] Realtime ✨ banner appears when buyer_view auto-updates from a chat turn
- [ ] Seller dashboard shows the "✨ Buyer view updated" badge on deals with new updates
- [ ] Side-by-side test (buyer URL incognito + seller preview): visually identical except the banner
- [ ] Manual refresh recorded with `generation_reason: 'manual_refresh'` in the JSONB
- [ ] No new chat message is created when refresh is triggered (verified in messages table)
- [ ] Committed and pushed

→ Next: `09-acceptance-walkthrough.md`
