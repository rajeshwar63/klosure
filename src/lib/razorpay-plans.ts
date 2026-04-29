// =============================================================================
// Razorpay plan ID lookup — Phase 12.3
// =============================================================================
// AED entries are null until international subscriptions are enabled (12.3.1).
// Frontend hides "Upgrade" buttons for null plan IDs and shows "Contact sales".
// =============================================================================

import type { PlanSlug, Currency } from './plans'

const RAZORPAY_MODE = (import.meta.env.VITE_RAZORPAY_MODE ?? 'test') as 'test' | 'live'

// Test-mode plan IDs (default for dev + preview)
const TEST_PLANS: Record<string, string | null> = {
  'pro:INR':           'plan_SjJt4hH1414xTF',
  'team_starter:INR':  'plan_SjJtU4Ic9gMKQT',
  'team_growth:INR':   'plan_SjJtqGy7KxXBv1',
  'team_scale:INR':    'plan_SjJu9eaMjFv92Y',
  'pro:AED':           null,
  'team_starter:AED':  null,
  'team_growth:AED':   null,
  'team_scale:AED':    null,
}

// Live-mode plan IDs (used after Chunk 5 cutover)
const LIVE_PLANS: Record<string, string | null> = {
  'pro:INR':           'plan_SjJAkRxX87ZYuz',
  'team_starter:INR':  'plan_SjJi8s6ORnUzxb',
  'team_growth:INR':   'plan_SjJikkUK5hjVVw',
  'team_scale:INR':    'plan_SjJjCRGcjI8Os1',
  'pro:AED':           null,
  'team_starter:AED':  null,
  'team_growth:AED':   null,
  'team_scale:AED':    null,
}

const PLAN_MAP = RAZORPAY_MODE === 'live' ? LIVE_PLANS : TEST_PLANS

export function getRazorpayPlanId(slug: PlanSlug, currency: Currency): string | null {
  if (slug === 'trial' || slug === 'enterprise') return null
  return PLAN_MAP[`${slug}:${currency}`] ?? null
}

// Public Razorpay key ID (safe to bundle — Razorpay's checkout SDK requires it client-side).
export const RAZORPAY_KEY_ID =
  RAZORPAY_MODE === 'live'
    ? 'rzp_live_SjJpkGgapRmMyt'
    : 'rzp_test_SjJv6qkfBn4O70'

export const RAZORPAY_IS_LIVE = RAZORPAY_MODE === 'live'

// Reverse lookup: Razorpay plan ID → our plan slug. Used by webhook handler
// (server-side, so test/live distinction matters less — but still distinct).
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
