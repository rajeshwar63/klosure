// =============================================================================
// Plan definitions — Phase A sprint 09 (Coach / Closer / Command split)
// =============================================================================
// Three plan slugs:
//   - 'coach'   — $49 / AED 180 / ₹4500 per seat/mo. Core Klo coaching.
//                 NO email + Notetaker integration.
//   - 'closer'  — $79 / AED 290 / ₹7500 per seat/mo. Coach + Email + Notetaker.
//                 (Renamed from the old 'klosure' slug.)
//   - 'command' — Enterprise contact-sales tier. SSO, custom seats, dedicated
//                 support. (Renamed from 'enterprise'.)
//
// Plus 'trial' as the unbilled 14-day onboarding state.
//
// Pricing is monthly per-seat. Teams pay (price_per_seat × seat_count). Pool
// quotas (meeting minutes, voice minutes, chat messages) are computed at the
// team level via team_pool table from sprint 02.
//
// Razorpay charges INR only until international card processing is activated
// (ticket #18895606). USD / AED prices are display-only on landing for global
// marketing reach; the BillingPage routes non-INR users to a concierge form.
// =============================================================================

export type PlanSlug = 'trial' | 'coach' | 'closer' | 'command'

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

  coach: {
    slug: 'coach',
    label: 'Coach',
    shortLabel: 'Coach',
    isTeam: true,
    // Anchor INR price (₹4500) is what Razorpay actually bills. USD ($49) and
    // AED (180) are display-only until international payments activate.
    monthlyPerSeat: {
      INR: 4500,
      AED: 180,
      USD: 49,
    },
    poolDefaults: {
      meeting_minutes_per_seat: 0,    // no Notetaker on Coach
      voice_minutes_per_seat: 60,
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
      // Email + Notetaker are Closer-tier only.
      email_capture: false,
      meeting_capture: false,
      voice: false,
    },
    description: 'Klo coaching, dashboards, manager rollup — per seat, monthly',
    highlights: [
      'Klo coaching on every conversation',
      'AI Dashboard for Rep',
      'AI Dashboard for the Client',
      'Manager dashboard with team rollup',
      'Daily focus + weekly brief for Manager and Rep',
    ],
  },

  closer: {
    slug: 'closer',
    label: 'Closer',
    shortLabel: 'Closer',
    isTeam: true,
    monthlyPerSeat: {
      INR: 7500,
      AED: 290,
      USD: 79,
    },
    poolDefaults: {
      meeting_minutes_per_seat: 900,    // 15 hrs/seat/mo Notetaker
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
    description: 'Coach + Email & Notetaker across Gmail, Outlook, Zoom, Meet, Teams',
    highlights: [
      'Everything in Coach',
      'Email + Note Taker (Gmail, Outlook, Zoom, Meet, Teams)',
      'Unlimited email events',
      'Unlimited calendar events',
      '15 hours of Notetaker meetings per seat',
      'Pooled meeting hours across the team',
    ],
  },

  command: {
    slug: 'command',
    label: 'Command',
    shortLabel: 'Command',
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
    description: 'Enterprise pricing for larger orgs',
    highlights: [
      'Enterprise pricing',
      'SSO (SAML)',
      'Custom seat counts',
      'Dedicated support',
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
  // Returns "$79/seat" — the surrounding card template appends "/mo" as a
  // smaller suffix span, so the two combined render as "$79/seat /mo".
  return `${formatAmount(p, currency)}/seat`
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

// Plain numeric total (per-seat × seat_count). Returns null for contact-sales
// tiers. Use formatAmount for display.
export function totalAmountForTeam(
  slug: PlanSlug,
  currency: Currency,
  seatCount: number,
): number | null {
  const perSeat = priceFor(slug, currency)
  if (perSeat === null) return null
  return perSeat * seatCount
}

export function formatCurrencyAmount(amount: number, currency: Currency): string {
  return formatAmount(amount, currency)
}

export interface PriceDisplay {
  primary: string
}

export function priceDisplayFor(slug: PlanSlug, currency: Currency): PriceDisplay {
  return {
    primary: formatPrice(slug, currency),
  }
}
