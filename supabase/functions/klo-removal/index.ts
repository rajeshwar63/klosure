// Klosure — Phase 4.5 klo-removal
// Handles user × removals from the Overview.
// Inserts the removed item into klo_state.removed_items so Klo never re-adds it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import type { KloState, RemovedItem } from "../_shared/klo-state-types.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

type Kind = "people" | "blockers" | "open_questions" | "decisions"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }
  if (req.method !== "POST") {
    return json({ error: "use POST" }, 405)
  }

  try {
    const { deal_id, kind, match, reason } = (await req.json()) as {
      deal_id: string
      kind: Kind
      match: Record<string, unknown>  // e.g. { name: 'Ahmed' } for people
      reason: string
    }

    if (!deal_id || !kind || !match || !reason || !reason.trim()) {
      return json({ error: "deal_id, kind, match, reason all required" }, 400)
    }

    // Verify caller is the deal's seller.
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "not authorized" }, 401)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ error: "not authorized" }, 401)

    const { data: deal, error: dealErr } = await sb
      .from("deals")
      .select("seller_id, klo_state")
      .eq("id", deal_id)
      .single()
    if (dealErr || !deal) return json({ error: "deal not found" }, 404)
    if (deal.seller_id !== userData.user.id) {
      return json({ error: "only seller can remove" }, 403)
    }

    const state = deal.klo_state as KloState | null
    if (!state) return json({ error: "no klo_state yet" }, 400)

    // Locate the item and remove it.
    const arr = ((state as unknown as Record<string, unknown[]>)[kind] ?? []) as Array<Record<string, unknown>>
    const idx = arr.findIndex((item) =>
      Object.entries(match).every(([k, v]) => item[k] === v),
    )
    if (idx < 0) return json({ error: "item not found" }, 404)

    const removedValue = arr[idx]
    const newArr = arr.slice(0, idx).concat(arr.slice(idx + 1))

    const removedItem: RemovedItem = {
      kind,
      value: removedValue,
      reason: reason.trim(),
      removed_at: new Date().toISOString(),
    }

    const newState: KloState = {
      ...state,
      [kind]: newArr,
      removed_items: [...(state.removed_items ?? []), removedItem],
    } as KloState

    // Update state.
    const { error: updErr } = await sb
      .from("deals")
      .update({ klo_state: newState })
      .eq("id", deal_id)
    if (updErr) throw updErr

    // Log history.
    const { error: histErr } = await sb.from("klo_state_history").insert({
      deal_id,
      triggered_by_role: "seller",
      change_kind: "removed",
      field_path: `${kind}[removed]`,
      before_value: removedValue,
      after_value: null,
      reason: reason.trim(),
    })
    if (histErr) throw histErr

    return json({ ok: true })
  } catch (err) {
    console.error("klo-removal error", err)
    return json({ ok: false, error: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}
