// =============================================================================
// Razorpay plan ID lookup — Phase A sprint 09 (Coach / Closer split)
// =============================================================================
// Two paid plans (coach + closer), each requires a per-currency Razorpay plan
// ID. Today only INR is wired — international card processing is pending
// activation (Razorpay ticket #18895606), so AED + USD return null and the
// BillingPage routes those users to a concierge form instead of checkout.
//
// Trial / Command (enterprise) have no Razorpay plan IDs — trial is unbilled,
// Command is contact-sales.
//
// Plan IDs live in source for now (single-tenant deployment, low rotation
// risk). When we add USD + AED, just fill in the corresponding rows.
// =============================================================================

import type { PlanSlug, Currency } from './plans'

const RAZORPAY_MODE = (import.meta.env.VITE_RAZORPAY_MODE ?? 'live') as 'test' | 'live'

const TEST_PLANS: Record<string, string | null> = {
  'coach:INR': null,
  'coach:AED': null,
  'coach:USD': null,
  'closer:INR': null,
  'closer:AED': null,
  'closer:USD': null,
}

const LIVE_PLANS: Record<string, string | null> = {
  'coach:INR': 'plan_SlMh7xd9N4El0k',     // ₹4500/seat/mo
  'coach:AED': null,                       // pending intl activation
  'coach:USD': null,                       // pending intl activation
  'closer:INR': 'plan_SlMhXsDUplIPhn',    // ₹7500/seat/mo
  'closer:AED': null,                      // pending intl activation
  'closer:USD': null,                      // pending intl activation
}

const PLAN_MAP = RAZORPAY_MODE === 'live' ? LIVE_PLANS : TEST_PLANS

export function getRazorpayPlanId(slug: PlanSlug, currency: Currency): string | null {
  if (slug === 'trial' || slug === 'command') return null
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
    .map(([k, v]) => [v as string, k.split(':')[0] as PlanSlug]),
)
const REVERSE_LIVE: Record<string, PlanSlug> = Object.fromEntries(
  Object.entries(LIVE_PLANS)
    .filter(([, v]) => v)
    .map(([k, v]) => [v as string, k.split(':')[0] as PlanSlug]),
)

export function getPlanSlugFromRazorpayId(razorpayPlanId: string): PlanSlug | null {
  return REVERSE_LIVE[razorpayPlanId] ?? REVERSE_TEST[razorpayPlanId] ?? null
}
