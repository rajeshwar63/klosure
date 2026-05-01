# Sprint 08 — Pricing collapse to one Razorpay plan

**Sprint:** 8 of 11
**Estimated:** 1.5 days
**Goal:** Collapse the 6-plan structure (`trial` / `pro` / `team_starter` / `team_growth` / `team_scale` / `enterprise`) to a single per-seat plan called `klosure`. Wipe and rebuild the Razorpay test plans. Keep `trial` as a separate non-billed mode and `enterprise` as a contact-sales placeholder.

## Why this matters

The roadmap's Section 3.1 decision: **"One plan. One price. Everything included. Per seat."** The existing 6-tier structure was built when we thought feature-gating would drive upsell — six months of operation has shown it doesn't (zero customers paid, so we have zero data, but the absence of inbound questions about feature differences is itself signal).

The collapse also unblocks Phase A's core promise: **every customer gets email + meetings + manager dashboard out of the box.** Tiering them across plans would mean "your sub-$99 customer can't see meetings," which contradicts the value prop entirely.

## ⚠️ Razorpay, not Stripe

The roadmap text says "Update lib/plans.ts and Stripe products." The codebase moved off Stripe in Phase 12.3 — all billing is Razorpay. This sprint targets Razorpay test mode, then a separate cutover to Razorpay live mode happens later (out of scope for Phase A — needs legal pages, see "Pre-cutover requirements").

## Pre-cutover requirements

Before flipping to Razorpay live mode (NOT done in this sprint):
- `/privacy` and `/terms` pages must be live at klosure.ai
- `/refund` page (Razorpay India compliance requirement) must exist
- Razorpay account must complete KYC
- Domain `klosure.ai` must be DNS-verified

This sprint only does test-mode rebuild. Live cutover is a deliberately separate decision once Phase A has 1+ design partner using Klosure on real deals.

## What ships

1. New `lib/plans.ts` with single `klosure` plan
2. New Razorpay test plans (wipe the 4 existing test plans, create new ones)
3. Updated `razorpay-create-subscription` — every paid plan is now a team plan
4. Auto-team-creation on signup (so solo users get a team_id automatically)
5. Updated `BillingPage.jsx` — single plan card instead of 4
6. Updated `razorpay-plans.ts` mapping
7. Migration: any existing test users on `pro/team_*` get migrated to `klosure`

## Decision: trial flow stays

Trial users get 14 days of full Klosure with a generous default pool (10 hours of meetings, 1000 chat messages). After trial they convert to paid `klosure` or go read-only. Keep `trial` and `paid_active` as the two real states; `pro/team_starter/team_growth/team_scale` go away.

## New lib/plans.ts

Path: `src/lib/plans.ts`

```typescript
// =============================================================================
// Plan definitions — Phase A sprint 08
// =============================================================================
// One plan: 'klosure'. Plus 'trial' and 'enterprise' as edge states.
//
// 'klosure' is a per-seat plan. Pricing is monthly; teams pay
// (price_per_seat × seat_count). Pool quotas (meeting minutes, voice minutes,
// chat messages) are computed at the team level via team_pool table from
// sprint 02.
// =============================================================================

export type PlanSlug = 'trial' | 'klosure' | 'enterprise'

export type Currency = 'INR' | 'AED' | 'USD'

export interface PlanDefinition {
  slug: PlanSlug
  label: string
  shortLabel: string
  isTeam: boolean
  /** Per-seat monthly price. null = contact sales. */
  monthlyPerSeat: Record<Currency, number | null>
  /** Per-seat default pool quotas. team_pool is initialised from these. */
  poolDefaults: {
    meeting_minutes_per_seat: number
    voice_minutes_per_seat: number
    chat_messages_per_seat: number
  }
  features: {
    klo_coaching: boolean
    manager_view: boolean
    forecast_view: boolean
    askklo: boolean
    seller_profile: boolean
    daily_focus: boolean
    weekly_brief: boolean
    realtime_buyer_link: boolean
    email_capture: boolean       // Phase A
    meeting_capture: boolean     // Phase A
    voice: boolean               // Phase F (false until shipped)
  }
  description: string
  highlights: string[]
  hiddenFromPricingPage?: boolean
}

export const PLANS: Record<PlanSlug, PlanDefinition> = {
  trial: {
    slug: 'trial',
    label: 'Trial',
    shortLabel: 'Trial',
    isTeam: false,
    monthlyPerSeat: { INR: 0, AED: 0, USD: 0 },
    poolDefaults: {
      meeting_minutes_per_seat: 600,    // 10h trial
      voice_minutes_per_seat: 60,
      chat_messages_per_seat: 1000,
    },
    features: {
      klo_coaching: true,
      manager_view: false,
      forecast_view: false,
      askklo: false,
      seller_profile: true,
      daily_focus: true,
      weekly_brief: false,
      realtime_buyer_link: true,
      email_capture: true,
      meeting_capture: true,
      voice: false,
    },
    description: '14 days of full Klosure',
    highlights: [
      'Full Klo coaching on every deal',
      'Email + meeting capture',
      'Buyer link sharing',
    ],
    hiddenFromPricingPage: true,
  },

  klosure: {
    slug: 'klosure',
    label: 'Klosure',
    shortLabel: 'Klosure',
    isTeam: true,                        // every paid customer is a "team" now
    monthlyPerSeat: {
      INR: 3999,
      AED: 290,                          // ~$79
      USD: 79,
    },
    poolDefaults: {
      meeting_minutes_per_seat: 900,     // 15h/seat/month
      voice_minutes_per_seat: 100,
      chat_messages_per_seat: 1500,
    },
    features: {
      klo_coaching: true,
      manager_view: true,
      forecast_view: true,
      askklo: true,
      seller_profile: true,
      daily_focus: true,
      weekly_brief: true,
      realtime_buyer_link: true,
      email_capture: true,
      meeting_capture: true,
      voice: false,                       // flips to true when Phase F ships
    },
    description: 'Everything Klosure does, per seat, per month',
    highlights: [
      'Klo coaching on every conversation',
      'Email + meeting capture (Gmail, Outlook, Zoom, Meet, Teams)',
      'Manager dashboard with team rollup',
      'Daily focus + weekly brief',
      'Pooled meeting hours across the team',
    ],
  },

  enterprise: {
    slug: 'enterprise',
    label: 'Enterprise',
    shortLabel: 'Enterprise',
    isTeam: true,
    monthlyPerSeat: { INR: null, AED: null, USD: null },
    poolDefaults: {
      meeting_minutes_per_seat: 1800,    // 30h/seat
      voice_minutes_per_seat: 200,
      chat_messages_per_seat: 3000,
    },
    features: {
      klo_coaching: true,
      manager_view: true,
      forecast_view: true,
      askklo: true,
      seller_profile: true,
      daily_focus: true,
      weekly_brief: true,
      realtime_buyer_link: true,
      email_capture: true,
      meeting_capture: true,
      voice: false,
    },
    description: 'For 30+ rep orgs needing custom contracts',
    highlights: [
      'Custom seat counts',
      'Custom pool quotas',
      'SSO & SAML (Phase 14+)',
      'Dedicated onboarding',
      'Custom contracts & invoicing',
    ],
  },
}

export type AccountStatus =
  | 'trial_active'
  | 'trial_expired_readonly'
  | 'paid_active'
  | 'paid_grace'
  | 'cancelled_readonly'
  | 'pending_deletion'
  | 'overridden'

export interface EffectivePlan {
  plan: PlanSlug
  status: AccountStatus
  seat_cap: number          // soft target only; pricing is per-seat not per-cap
  seats_used: number
  currency: Currency
  trial_started_at: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  read_only_since: string | null
  team_id: string | null
  is_team_plan: boolean
  features: PlanDefinition['features']
}

export function priceFor(slug: PlanSlug, currency: Currency): number | null {
  return PLANS[slug].monthlyPerSeat[currency]
}

function formatAmount(amount: number, currency: Currency): string {
  if (currency === 'INR') return `₹${amount.toLocaleString('en-IN')}`
  if (currency === 'AED') return `AED ${amount.toLocaleString('en-AE')}`
  return `$${amount.toLocaleString('en-US')}`
}

export function formatPrice(slug: PlanSlug, currency: Currency): string {
  const p = priceFor(slug, currency)
  if (p === null) return 'Contact sales'
  return `${formatAmount(p, currency)}/seat/mo`
}

export function totalPriceForTeam(
  slug: PlanSlug,
  currency: Currency,
  seatCount: number,
): string {
  const perSeat = priceFor(slug, currency)
  if (perSeat === null) return 'Contact sales'
  return formatAmount(perSeat * seatCount, currency)
}

// =============================================================================
// Launch discount — same shape as before, but per-seat now.
// =============================================================================
export const LAUNCH_DISCOUNT = {
  active: true,
  percentOff: 0,                          // disabled — the $79 IS the founding price
  label: 'Founding member',
} as const

export interface PriceDisplay {
  hasDiscount: boolean
  primary: string
  original: string | null
  percentOff: number
}

export function priceDisplayFor(slug: PlanSlug, currency: Currency): PriceDisplay {
  return {
    hasDiscount: false,
    primary: formatPrice(slug, currency),
    original: null,
    percentOff: 0,
  }
}
```

## Rebuild Razorpay test plans

Run this manually in Razorpay test dashboard, or use the API:

```bash
# Cancel & delete all existing test plans (in dashboard: Subscriptions → Plans)
# - plan_SjJt4hH14l4xTF (pro INR)
# - plan_SjJtU4Ic9gMKQT (team_starter INR)
# - plan_SjJtqGy7KxXBv1 (team_growth INR)
# - plan_SjJu9eaMjFv92Y (team_scale INR)
# Note: Razorpay doesn't allow deletion, only marking inactive — that's fine.
```

Create the new single plan via dashboard or API. Use API for speed:

```bash
# INR plan, ₹3,999/month per seat
curl -u rzp_test_SjJv6qkfBn4O70:<your-test-secret> \
  -X POST https://api.razorpay.com/v1/plans \
  -H "Content-Type: application/json" \
  -d '{
    "period": "monthly",
    "interval": 1,
    "item": {
      "name": "Klosure",
      "amount": 399900,
      "currency": "INR",
      "description": "Klosure — per seat, per month"
    },
    "notes": {
      "klosure_plan_slug": "klosure",
      "currency": "INR"
    }
  }'
# -> response includes the new plan_id; capture it as KLOSURE_PLAN_INR_TEST
```

Repeat for AED if Razorpay International is enabled (likely not yet — keep AED null for now). USD plans only become real when Razorpay International or Stripe-as-supplement is added (post-Phase A).

## Updated razorpay-plans.ts

Path: `src/lib/razorpay-plans.ts`

```typescript
// =============================================================================
// Razorpay plan ID lookup — Phase A sprint 08
// =============================================================================
// Single 'klosure' plan replaces the 4-tier structure. Trial / enterprise
// have no Razorpay plan IDs (trial is unbilled; enterprise is contact-sales).
// =============================================================================

import type { PlanSlug, Currency } from './plans'

const RAZORPAY_MODE = (import.meta.env.VITE_RAZORPAY_MODE ?? 'test') as 'test' | 'live'

const TEST_PLANS: Record<string, string | null> = {
  'klosure:INR': 'plan_<paste-new-test-plan-id-here>',
  'klosure:AED': null,        // Razorpay International not yet enabled
  'klosure:USD': null,
}

const LIVE_PLANS: Record<string, string | null> = {
  'klosure:INR': null,        // populate when going live
  'klosure:AED': null,
  'klosure:USD': null,
}

const PLAN_MAP = RAZORPAY_MODE === 'live' ? LIVE_PLANS : TEST_PLANS

export function getRazorpayPlanId(slug: PlanSlug, currency: Currency): string | null {
  if (slug === 'trial' || slug === 'enterprise') return null
  return PLAN_MAP[`${slug}:${currency}`] ?? null
}

export const RAZORPAY_KEY_ID =
  RAZORPAY_MODE === 'live'
    ? 'rzp_live_SjJpkGgapRmMyt'
    : 'rzp_test_SjJv6qkfBn4O70'

export const RAZORPAY_IS_LIVE = RAZORPAY_MODE === 'live'

const REVERSE_TEST: Record<string, PlanSlug> = Object.fromEntries(
  Object.entries(TEST_PLANS)
    .filter(([, v]) => v)
    .map(([k, v]) => [v as string, k.split(':')[0] as PlanSlug])
)
const REVERSE_LIVE: Record<string, PlanSlug> = Object.fromEntries(
  Object.entries(LIVE_PLANS)
    .filter(([, v]) => v)
    .map(([k, v]) => [v as string, k.split(':')[0] as PlanSlug])
)

export function getPlanSlugFromRazorpayId(razorpayPlanId: string): PlanSlug | null {
  return REVERSE_LIVE[razorpayPlanId] ?? REVERSE_TEST[razorpayPlanId] ?? null
}
```

## Server-side mapping update

Path: `supabase/functions/_shared/razorpay.ts` — replace `PLAN_ID_TO_SLUG`:

```typescript
export const PLAN_ID_TO_SLUG: Record<string, string> = {
  // Test mode
  "plan_<new-test-plan-id>": "klosure",
  // Live mode (populate when going live)
}
```

## Auto-team-creation

Every paid user becomes a team owner. We need an RPC that creates a team for a solo user on first paid checkout.

Add to `supabase/phase_a.sql` (or a new file `phase_a_pricing.sql`):

```sql
-- =============================================================================
-- Auto-team creation for paid users — Phase A sprint 08
-- =============================================================================

create or replace function public.ensure_team_for_user(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_user_email text;
  v_user_name text;
begin
  -- If the user already owns a team, return it.
  select id into v_team_id from public.teams where owner_id = p_user_id limit 1;
  if v_team_id is not null then return v_team_id; end if;

  -- If the user is on someone else's team, refuse — they shouldn't be paying.
  if exists (select 1 from public.team_members where user_id = p_user_id and role = 'rep') then
    raise exception 'user_is_member_of_other_team';
  end if;

  -- Otherwise create a single-seat team and add the user as owner-member.
  select email, name into v_user_email, v_user_name from public.users where id = p_user_id;

  insert into public.teams (name, owner_id, plan)
    values (coalesce(v_user_name, v_user_email, 'Klosure team'), p_user_id, 'klosure')
    returning id into v_team_id;

  insert into public.team_members (team_id, user_id, role, added_at)
    values (v_team_id, p_user_id, 'manager', now());

  -- The team_pool row is auto-created by the trigger from sprint 02.

  -- Update the user row with the team reference.
  update public.users set team_id = v_team_id where id = p_user_id;

  return v_team_id;
end;
$$;

grant execute on function public.ensure_team_for_user(uuid) to authenticated;
```

## Updated razorpay-create-subscription

Path: `supabase/functions/razorpay-create-subscription/index.ts`

The big change: every paid plan is now a team plan, so we always ensure a team exists before creating the subscription.

```typescript
// REPLACE the TEAM_PLANS Set logic with: every paid plan is a team plan.
const PAID_PLANS = new Set(["klosure"])  // 'enterprise' is contact-sales, no checkout

// Inside the handler, after auth and body parsing:

if (!PAID_PLANS.has(planSlug)) {
  return json({ ok: false, error: "invalid_plan_for_checkout" }, 400)
}

// Ensure user has a team (auto-creates if not).
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const { data: teamId, error: teamErr } = await sb.rpc("ensure_team_for_user", {
  p_user_id: userId,
})
if (teamErr || !teamId) {
  console.error("ensure_team_for_user failed", teamErr)
  return json({ ok: false, error: "team_setup_failed", detail: teamErr?.message }, 500)
}

// All downstream code now treats this as a team plan unconditionally.
// Remove the old isTeamPlan / TEAM_PLANS branching.

const { data: team } = await sb.from("teams")
  .select("razorpay_subscription_id, razorpay_customer_id")
  .eq("id", teamId)
  .maybeSingle()

const existingSubscriptionId = team?.razorpay_subscription_id ?? null
let razorpayCustomerId = team?.razorpay_customer_id ?? null

// ... rest of the function uses teamId / team table everywhere instead of
// branching on isTeamPlan. The user.razorpay_subscription_id column becomes
// vestigial — leave it but stop writing to it.
```

## Migration: existing test users

Anyone currently on `pro/team_starter/team_growth/team_scale` needs to be moved to `klosure`. Since you have zero paying customers, this is just internal/test users.

```sql
-- Run once during deployment.
update public.users set plan = 'klosure' where plan in ('pro');
update public.teams set plan = 'klosure' where plan in ('team_starter', 'team_growth', 'team_scale');

-- For solo (pro) users, create a team for each so they're on the unified path.
-- Use the new RPC.
do $$
declare
  user_rec record;
  v_team_id uuid;
begin
  for user_rec in
    select id from public.users
     where plan = 'klosure'
       and team_id is null
       and razorpay_subscription_id is not null
  loop
    select public.ensure_team_for_user(user_rec.id) into v_team_id;
    raise notice 'created team % for user %', v_team_id, user_rec.id;
  end loop;
end $$;
```

## Updated BillingPage.jsx

The current BillingPage renders a card per plan in `SHOWN_PLANS`. With one plan, that's now a single card with a seat-count input.

Path: `src/pages/BillingPage.jsx` — key change: replace the SHOWN_PLANS map with a single `PlanCard`:

```jsx
const SHOWN_PLANS = ['klosure']  // was: ['pro', 'team_starter', 'team_growth', 'team_scale', 'enterprise']

// Below the existing tabs/header, render:

<div className="grid md:grid-cols-2 gap-4 mt-6">
  <PlanCard plan={PLANS.klosure} currency={currency} isCurrent={effectivePlan === 'klosure'} user={user} />
  <EnterpriseCard />
</div>
```

The `PlanCard` component needs a seat-count selector:

```jsx
function PlanCard({ plan, currency, isCurrent, user }) {
  const [seatCount, setSeatCount] = useState(1)
  // ... existing busy/err state ...

  const perSeat = priceDisplayFor(plan.slug, currency).primary
  const total = totalPriceForTeam(plan.slug, currency, seatCount)

  return (
    <div className="...">
      <h3>{plan.label}</h3>
      <div className="text-3xl font-bold">{perSeat}</div>
      <p className="text-sm">Pay only for the seats you use.</p>

      <div className="mt-4">
        <label className="text-sm">Seats:</label>
        <input
          type="number"
          min={1}
          max={50}
          value={seatCount}
          onChange={(e) => setSeatCount(Math.max(1, parseInt(e.target.value) || 1))}
          className="ml-2 w-16 border rounded px-2 py-1"
        />
        <div className="text-sm mt-1">Total: {total}/month</div>
      </div>

      <ul className="...">
        {plan.highlights.map((h) => <li key={h}>{h}</li>)}
      </ul>

      <button onClick={handleUpgrade} disabled={!planAvailable || busy}>
        {busy ? 'Opening checkout…' : isCurrent ? 'Manage' : 'Start now'}
      </button>
    </div>
  )
}
```

A simpler V1 ships seat_count=1 for everyone and lets the manager add seats post-checkout via the existing team-invite flow. **Recommended for sprint 08:** ship the simpler V1, defer the seat selector to Phase B. The Razorpay subscription is a flat per-seat price, so adding seats means creating a new subscription with the new total. That's complex enough to deserve its own sprint.

## Acceptance

- [ ] `lib/plans.ts` has only `trial`, `klosure`, `enterprise` slugs
- [ ] `razorpay-plans.ts` references the new test plan ID
- [ ] `_shared/razorpay.ts` `PLAN_ID_TO_SLUG` only contains the new plan
- [ ] `ensure_team_for_user` RPC works: call with a solo user's id, verify a team is created and they're owner
- [ ] BillingPage shows one Klosure card + one Enterprise card (no Pro/Starter/Growth/Scale)
- [ ] Clicking "Start now" creates a Razorpay subscription for the new plan ID
- [ ] After checkout completes, user's plan column shows `klosure`, not `pro`
- [ ] Existing test users were migrated correctly (verify in DB)
- [ ] Old plan slugs (`pro`, `team_starter`, etc.) no longer appear anywhere in the codebase — grep:
  ```powershell
  Select-String -Path "src\**\*.{ts,tsx,js,jsx}" -Pattern "team_starter|team_growth|team_scale" -Recurse
  # Expected: zero matches (besides this spec file)
  ```
- [ ] `useAccountStatus` returns valid `EffectivePlan` for klosure-plan users
- [ ] Trial flow still works (new signup → trial_active for 14 days)

## Pitfalls

- **The `users.plan` column has CHECK constraints** in some prior migrations. If you renamed plans without updating the constraint, inserts will fail. Check `\d users` for `users_plan_check` constraint and ALTER if needed:
  ```sql
  alter table public.users drop constraint if exists users_plan_check;
  alter table public.users add constraint users_plan_check
    check (plan in ('trial', 'klosure', 'enterprise'));
  -- Same for teams.plan
  ```

- **`razorpay_subscription_id` exists on BOTH users and teams**. With every paid customer being team-based, only `teams.razorpay_subscription_id` matters going forward. Don't delete the user column (legacy state lives there); just stop writing to it. Sprint 09 in Phase B can drop it cleanly.

- **The launch_discount.percentOff is set to 0** intentionally — the $79 base IS the founding price. If you bring back a discount later, set both `active=true` and `percentOff=N`, and configure a Razorpay Offer with the matching discount.

- **Old subscriptions in test mode** still reference the old plan IDs. They'll fire `webhook` events with `plan_id` not in `PLAN_ID_TO_SLUG`, returning `unresolved_plan` errors. Either:
  (a) cancel old test subscriptions in Razorpay dashboard, OR
  (b) keep the old IDs in `PLAN_ID_TO_SLUG` mapping to `'klosure'` so they migrate gracefully

  **Recommendation: option (b)** — additive, less risk:
  ```typescript
  export const PLAN_ID_TO_SLUG: Record<string, string> = {
    "plan_<new-id>": "klosure",
    // Legacy mappings — migrate gracefully, can remove after webhook quiet period
    "plan_SjJt4hH14l4xTF": "klosure",
    "plan_SjJtU4Ic9gMKQT": "klosure",
    "plan_SjJtqGy7KxXBv1": "klosure",
    "plan_SjJu9eaMjFv92Y": "klosure",
  }
  ```

- **Currency confusion**: USD doesn't work in Razorpay India accounts. AED works only with Razorpay International (separate KYC). For Phase A, INR is the only billable currency. AED + USD prices in the UI are display-only for the Gulf positioning narrative.

## What this sprint does NOT do

- Razorpay live mode cutover (separate decision, requires legal pages + KYC)
- Stripe integration as USD/AED supplement (post-Phase A)
- Seat-count selector at checkout (defer to Phase B)
- Mid-cycle seat addition (defer to Phase B)
- Annual billing (defer indefinitely)
- Refund flow (defer until first refund request)

→ Next: `09-settings-ui-connect-accounts.md`
