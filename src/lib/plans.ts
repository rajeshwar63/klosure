// =============================================================================
// Plan definitions — Phase 12.1
// =============================================================================
// All pricing/seat/feature data lives here as a constant. The DB only stores
// the plan slug ("pro", "team_starter", etc.) and references this for limits.
// Updating a price = code change + redeploy. Intentional — payment-relevant
// data should not be edited via SQL.
// =============================================================================

export type PlanSlug =
  | 'trial'
  | 'pro'
  | 'team_starter'
  | 'team_growth'
  | 'team_scale'
  | 'enterprise'

export type Currency = 'INR' | 'AED'

export interface PlanDefinition {
  slug: PlanSlug
  label: string
  shortLabel: string
  isTeam: boolean
  seatCap: number
  monthly: Record<Currency, number | null>
  // Per-seat add-on price (matches base per-seat math). null = no add-ons on
  // this tier (solo / contact-sales / trial). Charged via a separate Razorpay
  // subscription with quantity = extra_seats.
  perSeatAddon?: Record<Currency, number | null>
  // Hard cap on extra seats. Once hit, the upgrade flow forces a tier change
  // — we never let a tier+addon combo cost more than the next tier's base.
  // Computed as (next_tier.seatCap - this.seatCap - 1).
  maxExtraSeats?: number
  // Slug of the next tier the customer should upgrade to once they hit the
  // add-on cap. Used by the UI to drive the "you've hit the cap, upgrade
  // to X" CTA.
  nextTierSlug?: PlanSlug
  features: {
    klo_coaching: boolean
    manager_view: boolean
    forecast_view: boolean
    askklo: boolean
    seller_profile: boolean
    daily_focus: boolean
    weekly_brief: boolean
    realtime_buyer_link: boolean
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
    seatCap: 1,
    monthly: { INR: 0, AED: 0 },
    features: {
      klo_coaching: true,
      manager_view: false,
      forecast_view: false,
      askklo: false,
      seller_profile: true,
      daily_focus: true,
      weekly_brief: false,
      realtime_buyer_link: true,
    },
    description: '14 days of full Pro access',
    highlights: [
      'Full Klo coaching on every deal',
      'Unlimited deals during trial',
      'Buyer link sharing',
    ],
    hiddenFromPricingPage: true,
  },

  pro: {
    slug: 'pro',
    label: 'Pro',
    shortLabel: 'Pro',
    isTeam: false,
    seatCap: 1,
    monthly: { INR: 4999, AED: 179 },
    features: {
      klo_coaching: true,
      manager_view: false,
      forecast_view: false,
      askklo: false,
      seller_profile: true,
      daily_focus: true,
      weekly_brief: false,
      realtime_buyer_link: true,
    },
    description: 'For solo reps running their own pipeline',
    highlights: [
      'Unlimited deals',
      'Klo coaching on every conversation',
      'Daily focus paragraph',
      'Buyer link sharing with live coaching',
    ],
  },

  team_starter: {
    slug: 'team_starter',
    label: 'Team Starter',
    shortLabel: 'Starter',
    isTeam: true,
    seatCap: 5,
    monthly: { INR: 19999, AED: 799 },
    // Same per-seat math as base (₹19,999 / 5 = ₹4,000; AED 799 / 5 = AED 160).
    perSeatAddon: { INR: 4000, AED: 160 },
    // Up to 9 extras (total 14) — at 15 reps, force upgrade to Growth so the
    // customer doesn't overpay vs. the next tier.
    maxExtraSeats: 9,
    nextTierSlug: 'team_growth',
    features: {
      klo_coaching: true,
      manager_view: true,
      forecast_view: true,
      askklo: true,
      seller_profile: true,
      daily_focus: true,
      weekly_brief: true,
      realtime_buyer_link: true,
    },
    description: 'For small teams who want a coach across the whole pipeline',
    highlights: [
      'Up to 5 reps · add seats as you grow',
      'Manager view: full team rollup',
      'Ask Klo about any deal across the team',
      'Weekly team brief',
    ],
  },

  team_growth: {
    slug: 'team_growth',
    label: 'Team Growth',
    shortLabel: 'Growth',
    isTeam: true,
    seatCap: 15,
    monthly: { INR: 49999, AED: 1999 },
    // ₹49,999 / 15 ≈ ₹3,333; AED 1,999 / 15 ≈ AED 133.
    perSeatAddon: { INR: 3333, AED: 133 },
    // Up to 14 extras (total 29) — at 30 reps, upgrade to Scale.
    maxExtraSeats: 14,
    nextTierSlug: 'team_scale',
    features: {
      klo_coaching: true,
      manager_view: true,
      forecast_view: true,
      askklo: true,
      seller_profile: true,
      daily_focus: true,
      weekly_brief: true,
      realtime_buyer_link: true,
    },
    description: 'For growing sales orgs',
    highlights: [
      'Up to 15 reps · add seats as you grow',
      'Everything in Starter',
      'Forecast view for the manager',
      'Pattern detection across reps',
    ],
  },

  team_scale: {
    slug: 'team_scale',
    label: 'Team Scale',
    shortLabel: 'Scale',
    isTeam: true,
    seatCap: 30,
    monthly: { INR: 89999, AED: 3499 },
    // ₹89,999 / 30 ≈ ₹3,000; AED 3,499 / 30 ≈ AED 117.
    perSeatAddon: { INR: 3000, AED: 117 },
    // Up to 69 extras (total 99) — at 100 reps, customer needs Enterprise.
    maxExtraSeats: 69,
    nextTierSlug: 'enterprise',
    features: {
      klo_coaching: true,
      manager_view: true,
      forecast_view: true,
      askklo: true,
      seller_profile: true,
      daily_focus: true,
      weekly_brief: true,
      realtime_buyer_link: true,
    },
    description: 'For larger sales orgs',
    highlights: [
      'Up to 30 reps · add seats as you grow',
      'Everything in Growth',
      'Priority support',
      'Custom Klo training (Phase 13+)',
    ],
  },

  enterprise: {
    slug: 'enterprise',
    label: 'Enterprise',
    shortLabel: 'Enterprise',
    isTeam: true,
    seatCap: 100,
    monthly: { INR: null, AED: null },
    features: {
      klo_coaching: true,
      manager_view: true,
      forecast_view: true,
      askklo: true,
      seller_profile: true,
      daily_focus: true,
      weekly_brief: true,
      realtime_buyer_link: true,
    },
    description: 'For 30+ rep orgs',
    highlights: [
      'Custom seat counts',
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
  /** Effective cap = base seatCap + extra_seats. */
  seat_cap: number
  /** Base seats from the tier (5/15/30). Excludes add-ons. */
  base_seat_cap?: number
  /** Number of paid add-on seats currently active on this team. */
  extra_seats?: number
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
  return PLANS[slug].monthly[currency]
}

function formatAmount(amount: number, currency: Currency): string {
  if (currency === 'INR') return `₹${amount.toLocaleString('en-IN')}`
  return `AED ${amount.toLocaleString('en-AE')}`
}

export function formatPrice(slug: PlanSlug, currency: Currency): string {
  const p = priceFor(slug, currency)
  if (p === null) return 'Contact sales'
  return formatAmount(p, currency)
}

export function effectivePerSeat(slug: PlanSlug, currency: Currency): number | null {
  const def = PLANS[slug]
  const monthly = def.monthly[currency]
  if (monthly === null || def.seatCap === 0) return null
  return Math.round(monthly / def.seatCap)
}

// =============================================================================
// Per-seat add-on helpers
// =============================================================================
// Add-ons are billed via a *separate* Razorpay subscription that runs alongside
// the base subscription. The base subscription pays for `seatCap` reps; the
// add-on subscription pays for `extra_seats` × `perSeatAddon`. Webhook keeps
// `teams.extra_seats` in sync with the add-on subscription's quantity.
// =============================================================================

export function perSeatAddonPrice(slug: PlanSlug, currency: Currency): number | null {
  const def = PLANS[slug]
  return def.perSeatAddon?.[currency] ?? null
}

export function maxExtraSeatsFor(slug: PlanSlug): number {
  return PLANS[slug].maxExtraSeats ?? 0
}

/** True if this tier supports paid per-seat add-ons in the given currency. */
export function supportsAddonSeats(slug: PlanSlug, currency: Currency): boolean {
  return perSeatAddonPrice(slug, currency) !== null && maxExtraSeatsFor(slug) > 0
}

/** Format an extra-seat price like "₹4,000 / seat / mo". */
export function formatPerSeatAddon(slug: PlanSlug, currency: Currency): string {
  const price = perSeatAddonPrice(slug, currency)
  if (price === null) return ''
  return formatAmount(price, currency)
}

/**
 * Total monthly cost for a base plan + N extra seats, before any launch
 * discount. Returns null when either price is unset for this currency.
 */
export function totalMonthlyForSeats(
  slug: PlanSlug,
  currency: Currency,
  extraSeats: number,
): number | null {
  const base = priceFor(slug, currency)
  if (base === null) return null
  if (extraSeats <= 0) return base
  const perSeat = perSeatAddonPrice(slug, currency)
  if (perSeat === null) return base // add-ons not available; ignore extras
  return base + perSeat * extraSeats
}

// =============================================================================
// Launch discount — promotional 30% off, applied via a Razorpay Offer.
// =============================================================================
// `active` toggles both the UI treatment (strikethrough + badge) and whether
// the create-subscription edge function passes the offer_id to Razorpay. The
// percent here is purely for *display* — the actual amount charged comes from
// the Offer configured in the Razorpay dashboard. Keep them in sync, and when
// the launch period ends, flip `active` to false and remove the offer in
// Razorpay (or let it expire).
// =============================================================================
export const LAUNCH_DISCOUNT = {
  active: true,
  percentOff: 30,
  label: 'Launch offer',
} as const

export interface PriceDisplay {
  hasDiscount: boolean
  /** What to show as the headline price (discounted if active, otherwise the regular price). */
  primary: string
  /** Original price to render with strikethrough alongside `primary`. Null when there's no discount. */
  original: string | null
  percentOff: number
}

export function priceDisplayFor(slug: PlanSlug, currency: Currency): PriceDisplay {
  const monthly = priceFor(slug, currency)
  const regular = formatPrice(slug, currency)

  // No discount on free/contact-sales tiers, or when the launch is off.
  if (!LAUNCH_DISCOUNT.active || monthly === null || monthly === 0) {
    return { hasDiscount: false, primary: regular, original: null, percentOff: 0 }
  }

  const discounted = Math.round(monthly * (1 - LAUNCH_DISCOUNT.percentOff / 100))
  return {
    hasDiscount: true,
    primary: formatAmount(discounted, currency),
    original: regular,
    percentOff: LAUNCH_DISCOUNT.percentOff,
  }
}
