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
    email_capture: boolean
    meeting_capture: boolean
    voice: boolean
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
      meeting_minutes_per_seat: 600,
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
    isTeam: true,
    monthlyPerSeat: {
      // Launch pricing — $49/seat/mo. Goes to $79 once Google integration
      // (email + meeting capture) ships. INR/AED kept at rough $49 parity.
      INR: 3999,
      AED: 180,
      USD: 49,
    },
    poolDefaults: {
      meeting_minutes_per_seat: 900,
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
      voice: false,
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
      meeting_minutes_per_seat: 1800,
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
  seat_cap: number
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
// Launch discount — kept as a struct for future promos. The $79 is the
// founding price; no discount is applied.
// =============================================================================
export const LAUNCH_DISCOUNT = {
  active: true,
  percentOff: 0,
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
