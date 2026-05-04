// =============================================================================
// Shared Razorpay helpers — Phase 12.3
// =============================================================================
// Used by razorpay-webhook (lifecycle events) and razorpay-verify-subscription
// (synchronous post-checkout activation). Keeping the status/plan mapping in
// one place avoids the two paths drifting out of sync.
// =============================================================================

// Server-side Razorpay plan_id → Klosure plan slug. Mirrors the LIVE_PLANS
// map in src/lib/razorpay-plans.ts. Both webhook and verify prefer the
// klosure_plan_slug stored on the subscription's notes (set at create time,
// immune to plan-id table drift) and only fall back to this map.
//
// Phase A sprint 09: split into 'coach' + 'closer'. Legacy IDs (and the
// previous 'klosure' label) are kept mapped to 'closer' so any in-flight
// subscription created before the split routes to the right tier when its
// next webhook fires. Drop the legacy entries once no subscriptions
// reference them.
export const PLAN_ID_TO_SLUG: Record<string, string> = {
  // Live (current):
  "plan_SlMh7xd9N4El0k": "coach",     // ₹4500/seat/mo
  "plan_SlMhXsDUplIPhn": "closer",    // ₹7500/seat/mo
  // Legacy test/live IDs from the pre-split 'klosure' tier — map to 'closer'
  // (the renamed klosure tier).
  "plan_SjJt4hH14l4xTF": "closer",
  "plan_SjJtU4Ic9gMKQT": "closer",
  "plan_SjJtqGy7KxXBv1": "closer",
  "plan_SjJu9eaMjFv92Y": "closer",
  "plan_SjJAkRxX87ZYuz": "closer",
  "plan_SjJi8s6ORnUzxb": "closer",
  "plan_SjJikkUK5hjVVw": "closer",
  "plan_SjJjCRGcjI8Os1": "closer",
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
  /** Per-seat multiplier. plan.amount × quantity is what's billed each cycle. */
  quantity?: number
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
