# Step 07 — Buyer dashboard UI

**Sprint:** C
**Goal:** Build the premium buyer dashboard. Ten sections, Stripe/Linear/Notion aesthetic, fully responsive. This is the page that justifies $99-199/mo Gulf pricing — visual polish is part of the product.

## Files

- `src/pages/BuyerDashboardPage.jsx` — new top-level page
- `src/components/buyer/` — new folder for all buyer-dashboard components
  - `BuyerDealHeader.jsx`
  - `BuyerKloBriefHero.jsx`
  - `BuyerSignalsRow.jsx`
  - `BuyerPlaybookCard.jsx`
  - `BuyerStakeholderMap.jsx`
  - `BuyerVendorTeamCard.jsx`
  - `BuyerTimelineStrip.jsx`
  - `BuyerCommitmentsTwoCol.jsx`
  - `BuyerMomentumChart.jsx`
  - `BuyerRisksList.jsx`
  - `BuyerRecentMomentsFeed.jsx`
  - `BuyerEmptyState.jsx`
- `src/styles/buyer-dashboard.css` — scoped styles (or extend the existing token-based styles)
- Routing: extend the existing buyer route (`/join/:token`) so when the buyer is already joined, they land on this dashboard instead of the chat-style Overview

## Reuse, do not duplicate

Phase 4-5 step 12 already established the buyer-view differentiation pattern. **Replace** the existing buyer Overview with this new dashboard for buyers. Sellers still see their normal Overview, plus a new "Buyer view" tab (step 08) that renders this dashboard.

So the routing logic becomes:

- `/join/:token` (anon buyer) → `<BuyerDashboardPage>` (this step)
- `/deal/:id` (seller, normal flow) → existing `<DealRoom>` Overview
- `/deal/:id?view=buyer` (seller previewing) → `<BuyerDashboardPage>` rendered inside the seller's deal page (step 08)

## Page structure (top to bottom)

```
┌──────────────────────────────────────────────────────────────┐
│  BuyerDealHeader                                              │
│  Klosure × Acme Corp · ARR $48K · Go-live Mar 15 · 23 days   │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  BuyerKloBriefHero  (the centerpiece)                         │
│  ◆ Klo · Your deal advisor                                    │
│  [3-5 sentence brief in elegant prose]                        │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  BuyerSignalsRow  (3 cards in a row, 1 col on mobile)         │
│  Timeline health  │ Stakeholder align │ Vendor responsive     │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  BuyerPlaybookCard  (THE action card)                         │
│  This week's moves                                            │
│  ─ Loop in your CISO before Friday              ⏱ Mar 30      │
│      Security review is the timeline killer                   │
│      Who: your team                            ○ Not started  │
│  [3-5 items]                                                  │
└──────────────────────────────────────────────────────────────┘
┌─────────────────────────────┬────────────────────────────────┐
│  BuyerStakeholderMap        │  BuyerVendorTeamCard           │
│  Your team's engagement     │  Vendor team on your deal      │
└─────────────────────────────┴────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  BuyerTimelineStrip                                           │
│  Discovery─Demo─Sec Review─Procurement─Contract─Live          │
└──────────────────────────────────────────────────────────────┘
┌─────────────────────────────┬────────────────────────────────┐
│  BuyerCommitmentsTwoCol                                        │
│  On you                      │  On vendor                     │
└─────────────────────────────┴────────────────────────────────┘
┌─────────────────────────────┬────────────────────────────────┐
│  BuyerMomentumChart         │  BuyerRisksList                │
│  30-day deal momentum        │  Risks Klo is watching         │
└─────────────────────────────┴────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  BuyerRecentMomentsFeed                                       │
│  Recent moments · last 2 weeks                                │
└──────────────────────────────────────────────────────────────┘
```

On mobile (≤480px) every two-column row collapses to single column. Hero, brief, and playbook always full-width.

## Component specs

### BuyerDealHeader

Minimal, type-driven.

- Left: deal title in larger weight (e.g., "Klosure × Acme Corp")
- Middle dot separators · ARR / one-time deal value · Target go-live date · `{N} days` countdown
- Right (desktop only): subtle "Powered by Klosure" wordmark, very light grey, click → `klosure.ai`
- Background: very light, almost transparent — sits flat above the page
- Mobile: stacks the elements vertically with smaller font, no wordmark

The countdown updates client-side every minute (just `setInterval` with `Math.ceil((goLive - now) / 86400000)`).

If `klo_state.deadline.date` is null: show "No go-live date set" in muted text (no countdown).

### BuyerKloBriefHero

The centerpiece card. This is the single most important component visually.

- Premium card: white/dark background depending on theme, subtle border, generous padding (32-40px desktop, 20px mobile)
- Top row: small Klo monogram (◆ or whatever brand mark exists) + "Klo · Your deal advisor" in caps + smaller font, muted color
- Body: `klo_state.buyer_view.klo_brief_for_buyer` rendered in the body font, slightly larger than default (~17px desktop, 16px mobile), comfortable line-height (~1.6)
- Optional: a quote-style left border in accent color (very subtle)
- Bottom-right corner: tiny timestamp `Updated 4 minutes ago` (relative time, derived from `buyer_view.generated_at`)

If `klo_brief_for_buyer` is empty or buyer_view is missing → render `<BuyerEmptyState />` instead of this and skip the rest of the page.

### BuyerSignalsRow

Three signal cards side by side. Each card:

- Icon + signal label (caps, muted) — "Timeline health" / "Stakeholder alignment" / "Vendor responsiveness"
- Big level word: "Strong" / "Mixed" / "Weak" in a level-tinted color:
  - strong: green (use existing `--green` token or equivalent)
  - mixed: amber
  - weak: red (use existing `--amber` for "warning" if no red exists; never invent new colors per the founding rules)
- Below: `one_line_why` in body color, slightly muted

Card style: subtle border, small padding, equal width with gap. Mobile: stack vertically, 100% width each.

### BuyerPlaybookCard

The action card. Must feel like THE thing on the page — it earns the buyer's "this dashboard is useful" reaction.

- Card header: "This week's moves" + small icon
- Each item is a row:
  - Left edge: status indicator dot (○ not_started, ◐ in_flight, ● done) — clickable to cycle through states (purely client-side, more on this below)
  - First line: action text in stronger weight
  - Second line (smaller, muted): "Why: " + why_it_matters
  - Third line (muted, with chips): `Who: {who}` · `By: {deadline_formatted}`
- Items separated by hairline dividers
- Empty state: "No new moves this week — Klo will add items as the deal evolves."

#### Status interaction (client-only)

The `status` field is generated by the LLM but updated by the buyer locally for their own tracking. Use localStorage:

```javascript
const key = `klosure:buyer:playbook-status:${dealId}`
// Stores: { [actionHash]: 'not_started' | 'in_flight' | 'done' }
```

This is per-deal, per-browser. Match Klosure's existing per-deal localStorage pattern (`klosure:*:{dealId}`).

When the LLM regenerates the playbook on the next material change, the actions may change — server-side status should always reset to 'not_started' on regeneration. Local overrides only apply for items whose actionHash matches.

### BuyerStakeholderMap

This is the "wow" component — no CRM does this for the buyer. Make it count.

- Card header: "Your team on this deal"
- Grid of stakeholder cards (3 cols desktop, 1 col mobile):
  - Name (bold) + role (muted)
  - Engagement chip with color:
    - aligned (green dot): "✓ Aligned"
    - engaged (blue dot): "● Engaged"
    - quiet (amber dot): "◐ Quiet"
    - blocker (red dot): "⚠ Blocker"
    - unknown (grey dot): "? Not yet engaged"
  - klo_note rendered as small italic text below (≤ 1 line truncated with title attribute)

The buyer sees this and immediately knows who internally needs attention.

If `stakeholder_takes` is empty: card renders "Klo will identify your internal stakeholders as they appear in your conversations with the vendor."

### BuyerVendorTeamCard

Smaller, simpler. Shows the seller's team members assigned to this deal.

- Card header: "Vendor team"
- For Phase 8 v1: just the seller (`deals.seller_id` → user record). Future phases can add multiple vendor reps.
- Render: avatar (initials), name, role ("Account Executive at Klosure"), "Last reply: 3 hours ago" in muted text (derived from latest message from this seller in this deal).

### BuyerTimelineStrip

Visual horizontal strip across the full width.

- 6 stages: Discovery → Demo → Security Review → Procurement → Contract → Go-live
- Map from `klo_state.stage`:
  - `discovery` → first segment active
  - `proposal` → second segment active (label "Demo & Proposal")
  - `negotiation` → fourth segment active ("Procurement")
  - `legal` → fifth segment active ("Contract")
  - `closed` → sixth segment active ("Go-live")
  - "Security Review" doesn't have a 1:1 stage; mark it as a sub-stage indicator if `blockers` mentions security or InfoSec; otherwise just show as inactive
- Active stage: full-color background
- Past stages: filled in muted accent
- Future stages: outline only
- Below each segment: target date in tiny muted text, derived from `klo_state.deadline.date` if set, else blank

Mobile: shrink fonts, allow horizontal scroll on overflow.

### BuyerCommitmentsTwoCol

Two columns side by side, equal width.

- Left column: "On you" — items with `owner = 'buyer'` from the `commitments` table
- Right column: "On vendor" — items with `owner = 'seller'`

Each item is a row:
- Status dot (pending: amber / done: green / overdue: red)
- Task text (truncate to 2 lines)
- Due date in muted text
- If overdue, the row gets a subtle red-tinted background

Show only `pending` and `overdue` items by default. A small "Show completed (3)" link at the bottom expands to include `done` items.

Empty column state: "No pending items on you" / "No pending items on vendor".

### BuyerMomentumChart

A small line chart, subtle, premium.

- Use Recharts (already in the stack)
- Width: full card width, height ~120px
- Data: derive from `klo_state_history` — every row that recorded a buyer_view generation also recorded the `momentum_score` at that time. For Phase 8 v1, just store last N momentum scores in `buyer_view.momentum_history` (extend the buyer view with an array of `{date, score}` — see schema note below).
- Single line chart, no axes, no grid, just the line + start/end labels
- Color: accent color, slightly translucent fill below the line
- Hover: tooltip with date + score

Below chart: current momentum score in big number, with trend arrow:
- `momentum_score: 72` ↑ vs last week (or ↓ or →)

If only 1 data point exists, render: "Building your momentum chart — it'll fill in as your deal evolves."

#### Schema addendum

Extend `BuyerView` in step 04 types with:

```typescript
momentum_history?: Array<{ date: string; score: number }>  // last 30 entries
```

When step 06 writes a new buyer_view, append `{date: now, score: momentum_score}` to the existing history array, capped at 30 entries.

### BuyerRisksList

Card next to momentum chart (on desktop) or below it (on mobile).

- Card header: "Risks Klo is watching"
- Each risk:
  - Label as a tag/chip in amber color
  - `why_it_matters` as body text
  - `mitigation` rendered as a callout: "→ {mitigation}" in slightly accented styling

Empty state: "No risks identified — Klo will flag concerns here as the deal progresses."

### BuyerRecentMomentsFeed

Last section, full-width.

- Card header: "Recent moments"
- Vertical timeline-style list:
  - Date (muted, smaller) on left
  - Text on right
  - Items separated by light dividers
- 3-5 items, oldest at bottom, newest at top — reverse the order from the model (which emits oldest-to-newest)

Subtle. This is reference, not action.

### BuyerEmptyState

Shown when `klo_state.buyer_view` is null/missing.

```
[centered, lots of vertical breathing room]
◆ Klo
Building your dashboard...

Klo creates this dashboard from your conversations with the vendor.
As the deal develops, this page fills in with your action items,
stakeholder map, and timeline.

Check back in a few minutes.
```

## Data loading

Top of `BuyerDashboardPage.jsx`:

```jsx
function BuyerDashboardPage() {
  const { token } = useParams()
  const [deal, setDeal] = useState(null)
  const [commitments, setCommitments] = useState([])

  useEffect(() => {
    let mounted = true
    async function load() {
      // Resolve deal by buyer_token (anon-friendly query — relies on RLS or
      // a public RPC; reuse whatever Phase 4-5 step 12 set up)
      const { data: dealData } = await supabase
        .from('deals')
        .select('*')
        .eq('buyer_token', token)
        .maybeSingle()
      if (!mounted) return
      setDeal(dealData)

      const { data: commData } = await supabase
        .from('commitments')
        .select('*')
        .eq('deal_id', dealData.id)
      if (!mounted) return
      setCommitments(commData ?? [])
    }
    load()

    // Subscribe to klo_state realtime updates
    const channel = supabase
      .channel(`buyer-deal-${token}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'deals',
        filter: `buyer_token=eq.${token}`,
      }, (payload) => {
        setDeal((d) => ({ ...d, ...payload.new }))
      })
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [token])

  if (!deal) return <BuyerLoadingState />

  const buyerView = deal.klo_state?.buyer_view
  if (!buyerView) return <BuyerEmptyState />

  return (
    <div className="buyer-dashboard">
      <BuyerDealHeader deal={deal} />
      <BuyerKloBriefHero buyerView={buyerView} />
      <BuyerSignalsRow signals={buyerView.signals} />
      <BuyerPlaybookCard playbook={buyerView.playbook} dealId={deal.id} />
      <div className="buyer-row-2col">
        <BuyerStakeholderMap stakeholders={buyerView.stakeholder_takes} />
        <BuyerVendorTeamCard deal={deal} />
      </div>
      <BuyerTimelineStrip stage={deal.klo_state.stage} deadline={deal.klo_state.deadline} />
      <BuyerCommitmentsTwoCol commitments={commitments} />
      <div className="buyer-row-2col">
        <BuyerMomentumChart buyerView={buyerView} />
        <BuyerRisksList risks={buyerView.risks_klo_is_watching} />
      </div>
      <BuyerRecentMomentsFeed moments={buyerView.recent_moments} />
    </div>
  )
}
```

## Aesthetic — Stripe/Linear/Notion

- **Spacing is the design.** Generous whitespace between cards (24-32px desktop, 16px mobile).
- **Typography hierarchy is restrained.** Three or four sizes max. Body text leads; emphasis comes from weight, not color or size jumps.
- **Color is sparse.** Use the existing Klosure tokens. Accent color (whatever the brand color is) appears in: Klo monogram, signal levels, momentum line, status dots. Everything else is neutral.
- **Borders are hairlines.** 0.5px or 1px, very low contrast against the background.
- **Cards have soft, not heavy, shadows.** A single 1px border or a 0-2px-12px-black/4% shadow. Not both.
- **No flourishes.** No gradients (except maybe a subtle one under the momentum line). No bouncy animations. Transitions are 150-200ms ease-out.
- **The Klo brief card gets one extra design touch** — slight inset shadow, or accent left-border, or larger padding — to mark it as the centerpiece. Don't go overboard.

## Use the existing UI/UX skill

Before writing any component code, read `/mnt/skills/user/ui-ux-pro-max-skill/SKILL.md` AND `/mnt/skills/public/frontend-design/SKILL.md` for design tokens, component patterns, and styling constraints already established in this codebase. The buyer dashboard MUST match the visual language of the existing seller-side Overview, KloRead panel, and deal stat strip. No new design system.

## What this step does NOT do

- Does NOT add the seller's preview tab — that's step 08
- Does NOT add interactive elements like "request meeting" — explicitly out per Rajeshwar's call (buyer and seller already communicate via email/WhatsApp)
- Does NOT add a chat input anywhere on the buyer dashboard — buyer never chats with Klo
- Does NOT add deep historical analytics — momentum chart is 30 days max

## Claude Code instructions

```
1. Read /mnt/skills/user/ui-ux-pro-max-skill/SKILL.md and /mnt/skills/public/frontend-design/SKILL.md.
2. Read existing components: src/components related to KloRead panel, OverviewView, DealStatStrip, PeopleGrid — to extract the design language.
3. Create src/components/buyer/ folder with all 12 components listed above.
4. Create src/pages/BuyerDashboardPage.jsx.
5. Wire routing: /join/:token now routes to BuyerDashboardPage (replacing the old buyer Overview from phase 4-5 step 12 — or, more conservatively, gate by feature flag and old buyer view stays as fallback for now).
6. Test on a real deal: open the buyer URL in incognito. Should see the full dashboard if buyer_view exists, BuyerEmptyState if not.
7. Test on mobile (375px viewport via Chrome devtools): every section renders without horizontal overflow.
8. Test realtime: have the seller send a chat message that materially changes the deal — within ~10 seconds, the buyer dashboard should update without refresh.
9. Commit: "Phase 8 step 07: buyer dashboard UI"
10. Push.
```

## Acceptance

- [ ] All 10 sections render on desktop
- [ ] All sections render on mobile (375px) without horizontal scroll
- [ ] Realtime updates work (seller chat → buyer dashboard updates)
- [ ] BuyerEmptyState renders when buyer_view is missing
- [ ] localStorage status updates persist across reloads (per-deal)
- [ ] No design tokens or colors invented — all reuse existing Klosure tokens
- [ ] Lighthouse / aesthetic check: the page feels like Stripe/Linear/Notion, not generic SaaS
- [ ] Side-by-side with the seller Overview: buyer view is honestly different (no confidence score, no factors, no "deal dying" framing)
- [ ] Committed and pushed

→ Next: `08-seller-preview-tab.md`
