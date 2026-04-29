// =============================================================================
// can-write — Phase 12.1
// =============================================================================
// Server-side gate. Checks via the get_account_status RPC whether the user is
// allowed to perform write operations (Klo coaching, new deals, etc.). Klo
// coaching is the main cost vector — every Edge Function that emits an LLM
// call must run this guard before spending tokens.
//
// Falls back to "deny" on any error so a status-check failure never racks up
// bills. The RPC is security-definer so a service-role client can call it for
// any user_id.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

export type CanWriteResult = {
  ok: boolean
  status?: string
  reason?: string
}

export async function canWrite(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<CanWriteResult> {
  try {
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })
    const { data, error } = await sb.rpc("get_account_status", { p_user_id: userId })
    if (error) {
      console.error("can_write rpc error", error)
      return { ok: false, reason: "status_check_failed" }
    }
    const status = (data as { status?: string })?.status
    const allowed = ["trial_active", "paid_active", "paid_grace", "overridden"]
    if (allowed.includes(status ?? "")) return { ok: true, status }
    return { ok: false, status, reason: "read_only_or_inactive" }
  } catch (err) {
    console.error("can_write threw", err)
    return { ok: false, reason: "exception" }
  }
}
