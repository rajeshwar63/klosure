# Step 07 — Overview redesign

**Goal:** Rebuild the seller's Overview tab using the same component library as the Buyer view, with seller-side voice and seller-only sections (confidence, factors, hard calls). The Overview becomes the seller's *deal command center*, not a thin three-card summary.

## Why

Current Overview (Image 1 from Apr 28 feedback):
- "Klo Recommends" → 1 paragraph
- "Klo's Confidence" → 1 number with trend
- "Klo's Full Read" → repeats the same paragraph
- Stage strip + small commitments card

That's 3 cards saying the same thing. Meanwhile the Buyer view has 10 sections. The seller's own page is *less informative than what they're selling to buyers*. That's the problem.

The fix: Overview adopts buyer-view's component shapes, but with seller-side data and voice. Same UI language, different content.

## Files to modify

- `src/components/shared/` — promote buyer-view components to shared (if not already done in step 04)
- `src/pages/DealRoomPage.jsx` (Overview tab) — rebuild
- `src/components/seller/SellerOverview.jsx` — new top-level Overview component

## Layout (top to bottom)

```
┌──────────────────────────────────────────────────────────────┐
│  DealHeader                                                   │
│  Klosure × Emirates Logistics Group · $80K · Discovery       │
│  64 days to deadline · Last meeting today · Buyer last spoke │
│  never                                                        │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  Klo brief (seller voice) — hero card                         │
│  ◆ Klo · Your deal coach                                      │
│  [3-5 sentences. Direct. Hard call if warranted.]             │
│  Updated just now                                             │
└──────────────────────────────────────────────────────────────┘
┌─────────────────────────────────┬────────────────────────────┐
│  Confidence                      │  Klo's Take                │
│  65% ─ stable                    │  [klo_take_seller body]    │
│  Factors moving it up:           │                            │
│    +20%  Send ROI brief...       │                            │
│    +15%  Initiate procurement... │                            │
│    +10%  Confirm sec review...   │                            │
└─────────────────────────────────┴────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  This week's moves (seller playbook)                          │
│  ─ Send ROI brief to Omar by Thursday          ⏱ Apr 30      │
│      Why: Without ROI, security review slips                  │
│      Status: Not started                                      │
│  [3-5 items derived from klo_state's recommendations]         │
└──────────────────────────────────────────────────────────────┘
┌─────────────────────────────────┬────────────────────────────┐
│  Stakeholder map                 │  Vendor team               │
│  Buyer-side stakeholders         │  Your team on this deal    │
└─────────────────────────────────┴────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  Timeline strip                                               │
│  Discovery─Demo─Sec Review─Procurement─Contract─Live          │
└──────────────────────────────────────────────────────────────┘
┌─────────────────────────────────┬────────────────────────────┐
│  On you (pending_on_seller)     │  On vendor (pending_on_buyer)│
└─────────────────────────────────┴────────────────────────────┘
┌─────────────────────────────────┬────────────────────────────┐
│  Confidence trend chart          │  Risks                     │
│  30-day confidence over time     │  Klo's blockers list       │
└─────────────────────────────────┴────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  Recent moments / change log                                  │
│  Pulled from klo_state_history                                │
└──────────────────────────────────────────────────────────────┘
```

## Component reuse map

| Section | Component | Source data | Voice |
|---|---|---|---|
| Deal header | `DealHeader` (shared) | `deals` row | neutral |
| Klo brief | `KloBriefHero` (shared, perspective="seller") | `klo_state.klo_take_seller` | seller |
| Confidence | `ConfidenceCard` (new, seller-only) | `klo_state.confidence` + `klo_state.factors_*` | seller |
| Klo's Take | `KloTakeCard` (new, seller-only) | `klo_state.klo_take_seller` | seller |
| Playbook | `PlaybookCard` (shared, perspective="seller") | `klo_state.next_actions` (or derived) | seller |
| Stakeholder map | `StakeholderMap` (shared) | `klo_state.people` | neutral |
| Vendor team | `VendorTeamCard` (shared) | `users` table for `seller_id` | neutral |
| Timeline | `TimelineStrip` (shared) | `klo_state.stage` + `deadline` | neutral |
| Pending tasks | `PendingTasksTwoCol` (shared, perspective="seller") | `klo_state.pending_on_*` | neutral |
| Confidence chart | `ConfidenceChart` (new, replaces buyer-side momentum chart) | `klo_state_history` confidence values | seller-only |
| Risks | `RisksList` (shared) | `klo_state.blockers` | neutral framing, seller voice OK |
| Recent moments | `RecentMomentsFeed` (shared) | `klo_state_history` | neutral |

The Klo brief and Playbook get a `perspective` prop so they pull from the right field (`klo_take_seller` vs `klo_brief_for_buyer`).

## Voice differences (seller vs buyer)

For the components that vary by perspective, here's what changes:

**KloBriefHero**
- Buyer: reads `klo_state.buyer_view.klo_brief_for_buyer`
- Seller: reads `klo_state.klo_take_seller`
- Same component, different field. The component just renders the string. Voice difference comes from the LLM, not the UI.

**PlaybookCard**
- Buyer: reads `klo_state.buyer_view.playbook`
- Seller: reads from a new `klo_state.next_actions` array (or repurpose existing recommendation field — see below)

**Seller-side next_actions extraction**

Currently the seller side has "Klo Recommends" with 1 action and 3 confidence factors. Replace with a structured `next_actions[]` array similar to the buyer playbook. Add to extraction tool schema in step 03 or as part of this step:

```typescript
export interface NextAction {
  id: string
  action: string         // ≤ 12 words, imperative
  why_it_matters: string // 1 sentence
  who: string           // "you", "buyer's CFO", etc.
  deadline: string | null
  status: 'not_started' | 'in_flight' | 'done'
}

// in KloState
next_actions?: NextAction[]
```

Update `extraction-rules-text.ts` with a section on `next_actions` extraction. Update the tool schema in `klo-respond/index.ts`.

This unifies the structure across seller and buyer, just with different voice in the LLM output.

## Sections that stay seller-only

These never appear on buyer view — must NOT be promoted to shared:

- `ConfidenceCard` (with score + factors)
- `KloTakeCard` (full klo_take_seller, may be longer/harder than the brief)
- `ConfidenceChart` (30-day confidence trendline)

These live in `src/components/seller/` and are imported only by `SellerOverview.jsx`.

## Removing redundancy

**Delete from current Overview:**
- Standalone "Klo Recommends" card with 1 action and Take/Snooze/Mark done buttons (replaced by Playbook + Klo brief)
- Standalone "Klo's Full Read" card that just repeats Klo Recommends (consolidated into Klo's Take)

**Keep:**
- Deal stat strip (stage / value / deadline / health) — actually fold this into DealHeader

## What this step does NOT do

- Does NOT change the buyer view (already redesigned in Phase 8)
- Does NOT change the chat tab (step 08 handles its visual polish)
- Does NOT add interactive Take/Snooze/Mark done — those buttons go away with the redesign; revisit in Phase 10 if needed

## Claude Code instructions

```
1. Move shared buyer components to src/components/shared/:
   - DealHeader, KloBriefHero, PlaybookCard, StakeholderMap, VendorTeamCard, TimelineStrip, RisksList, RecentMomentsFeed
   - Add `perspective` prop where needed
2. Create seller-only components in src/components/seller/:
   - ConfidenceCard
   - KloTakeCard
   - ConfidenceChart
3. Add NextAction type and next_actions array to klo-state-types.ts.
4. Add extraction rules for next_actions to extraction-rules-text.ts.
5. Add next_actions to KLO_OUTPUT_TOOL schema in klo-respond/index.ts.
6. Create src/components/seller/SellerOverview.jsx that composes all sections.
7. Replace the Overview tab content in src/pages/DealRoomPage.jsx with <SellerOverview deal={deal} />.
8. Delete the old "Klo Recommends" / "Klo's Full Read" cards.
9. Deploy klo-respond: `supabase functions deploy klo-respond --no-verify-jwt`.
10. Test on Emirates deal: send a chat message, verify Overview re-renders with full layout, all sections populated, voice is seller-appropriate (hard calls allowed).
11. Side-by-side compare with Buyer view tab — same components, different voice.
12. Commit: "Phase 9 step 07: Overview redesign with shared component library"
13. Push.
```

## Acceptance

- [ ] Overview tab renders all 10+ sections
- [ ] Klo brief uses seller voice (can be hard, can mention confidence)
- [ ] Playbook items are derived from `klo_state.next_actions`
- [ ] Confidence card shows score + factors (still seller-only)
- [ ] Stakeholder map matches buyer view's, same component
- [ ] On you / On vendor populated from `pending_on_*`
- [ ] No "Klo Recommends" / "Klo's Full Read" duplicates
- [ ] Seller and buyer voices are honestly different (test 7 from Phase 8 acceptance)

→ Next: `08-ui-polish-bundle.md`
