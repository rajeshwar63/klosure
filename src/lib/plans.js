// =============================================================================
// Plan gating — Phase 4 (Week 9)
// =============================================================================
// Single source of truth for what each plan unlocks. Section 6 of the project
// doc spells out the bands: Free trial, Pro (the seller plan), Team (manager
// view + Klo team chat). Limits are enforced in two places:
//   - The UI grays out / locks features on a plan that doesn't have them.
//   - The server (RLS + edge functions) enforces the same limits so a power-
//     user can't bypass via the SDK.
// =============================================================================

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    priceLabel: 'Free',
    description: 'Try Klosure with one live deal. Solo mode only.',
    activeDealLimit: 1,
    canShare: false,
    canUseManagerView: false,
    canUseManagerKlo: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 49,
    priceLabel: '$49 / seller / month',
    description: 'Unlimited deals. Shared rooms with buyers. Klo coaching.',
    activeDealLimit: Infinity,
    canShare: true,
    canUseManagerView: false,
    canUseManagerKlo: false,
  },
  team: {
    id: 'team',
    name: 'Team',
    price: 79,
    priceLabel: '$79 / seller / month',
    description: 'Everything in Pro plus the manager view and Klo team-pipeline coaching.',
    activeDealLimit: Infinity,
    canShare: true,
    canUseManagerView: true,
    canUseManagerKlo: true,
  },
}

export function planConfig(plan) {
  return PLANS[plan] || PLANS.free
}

export function canCreateDeal({ plan, activeCount }) {
  const cfg = planConfig(plan)
  return activeCount < cfg.activeDealLimit
}

export function canShareWithBuyer(plan) {
  return planConfig(plan).canShare
}

// Returned from billing checks so the gate UI knows what to nudge the user
// toward ("Upgrade to Pro to share with buyers").
export function nextPlanFor(feature) {
  if (feature === 'share' || feature === 'unlimited_deals') return PLANS.pro
  if (feature === 'manager_view' || feature === 'manager_klo') return PLANS.team
  return PLANS.pro
}
