// =============================================================================
// Shared Razorpay helpers — Phase 12.3
// =============================================================================
// Used by razorpay-webhook (lifecycle events) and razorpay-verify-subscription
// (synchronous post-checkout activation). Keeping the status/plan mapping in
// one place avoids the two paths drifting out of sync.
// =============================================================================

// Server-side Razorpay plan_id → klosure plan slug. Mirrors the maps in
// src/lib/razorpay-plans.ts. Both webhook and verify prefer the
// klosure_plan_slug stored on the subscription's notes (set at create time)
// and only fall back to this map.
// Phase A sprint 08: collapsed to a single 'klosure' plan. Legacy plan IDs
// from the previous 6-tier structure are kept here mapping to 'klosure' so any
// old in-flight test subscriptions migrate gracefully when their next webhook
// fires. Drop the legacy entries once no subscriptions reference them.
export const PLAN_ID_TO_SLUG: Record<string, string> = {
  // New unified plan (populate with the actual Razorpay plan_id once created):
  "plan_<paste-new-test-plan-id-here>": "klosure",
  // Legacy test mode — migrate gracefully:
  "plan_SjJt4hH14l4xTF": "klosure",
  "plan_SjJtU4Ic9gMKQT": "klosure",
  "plan_SjJtqGy7KxXBv1": "klosure",
  "plan_SjJu9eaMjFv92Y": "klosure",
  // Legacy live mode:
  "plan_SjJAkRxX87ZYuz": "klosure",
  "plan_SjJi8s6ORnUzxb": "klosure",
  "plan_SjJikkUK5hjVVw": "klosure",
  "plan_SjJjCRGcjI8Os1": "klosure",
}

export type SubscriptionStatus = "active" | "pending" | "halted" | "cancelled" | "completed"

// Razorpay subscription statuses → the four buckets update_subscription_state
// understands. Anything we don't recognise is treated as a no-op state-wise
// (still logged in payment_events).
export function mapStatus(rzpStatus: string): SubscriptionStatus | null {
  switch (rzpStatus) {
    case "active":
    case "authenticated":   // mandate authorised, first charge imminent — treat as active so UI unblocks
      return "active"
    case "pending":         // payment retry window; not yet read-only
      return "pending"
    case "halted":
      return "halted"
    case "cancelled":
      return "cancelled"
    case "completed":
      return "completed"
    default:
      return null
  }
}

export type SubscriptionEntity = {
  id: string
  plan_id?: string
  status?: string
  current_end?: number
  end_at?: number
  notes?: Record<string, unknown>
}

// Plan slug resolution: prefer notes.klosure_plan_slug (set by us at create
// time, immune to plan-id table drift), fall back to PLAN_ID_TO_SLUG.
export function resolvePlanSlug(subscription: SubscriptionEntity): string {
  const notes = (subscription.notes ?? {}) as Record<string, unknown>
  const slugFromNotes = typeof notes.klosure_plan_slug === "string" ? notes.klosure_plan_slug : ""
  return slugFromNotes || PLAN_ID_TO_SLUG[subscription.plan_id ?? ""] || ""
}

// Razorpay sends current_end / end_at as Unix timestamps (seconds). Translate
// to ISO; return null if neither is present (the RPC keeps existing
// period_end on null).
export function periodEndFromSubscription(subscription: SubscriptionEntity): string | null {
  if (subscription.current_end) {
    return new Date(subscription.current_end * 1000).toISOString()
  }
  if (subscription.end_at) {
    return new Date(subscription.end_at * 1000).toISOString()
  }
  return null
}
