// =============================================================================
// Razorpay plan ID lookup — Phase A sprint 08
// =============================================================================
// Single 'klosure' plan replaces the 4-tier structure. Trial / enterprise
// have no Razorpay plan IDs (trial is unbilled; enterprise is contact-sales).
//
// Test mode is the default for dev + preview. The legacy plan IDs from the
// pre-Phase-A 6-tier structure stay in the reverse map below so any old test
// subscriptions still in flight resolve gracefully — the webhook handler
// normalises them onto 'klosure'.
// =============================================================================

import type { PlanSlug, Currency } from './plans'

const RAZORPAY_MODE = (import.meta.env.VITE_RAZORPAY_MODE ?? 'test') as 'test' | 'live'

// Replace the placeholder once the new test plan is created in Razorpay.
const TEST_PLANS: Record<string, string | null> = {
  'klosure:INR': 'plan_<paste-new-test-plan-id-here>',
  'klosure:AED': null,
  'klosure:USD': null,
}

const LIVE_PLANS: Record<string, string | null> = {
  'klosure:INR': null,
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
