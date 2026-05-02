// =============================================================================
// nylas-revoke-grant — Phase A
// =============================================================================
// Authenticated POST. Body: { grantId }.
// Revokes the grant on Nylas's side and marks the local row as 'revoked'.
// Called from the Settings UI's Disconnect button. Best-effort — frontend
// doesn't block on the Nylas response.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const NYLAS_API_URL = Deno.env.get("NYLAS_API_URL") ?? "https://api.us.nylas.com"
const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY") ?? ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const auth = req.headers.get("Authorization") ?? ""
    if (!auth.startsWith("Bearer ")) {
      return json({ ok: false, error: "not_authenticated" }, 401)
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return json({ ok: false, error: "not_authenticated" }, 401)
    }
    const userId = userData.user.id

    const body = await req.json().catch(() => ({}))
    const grantId = String(body.grantId ?? "")
    if (!grantId) {
      return json({ ok: false, error: "missing_grantId" }, 400)
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Confirm the user owns this grant before talking to Nylas.
    const { data: grant } = await sb.from("nylas_grants")
      .select("user_id, sync_state")
      .eq("nylas_grant_id", grantId)
      .maybeSingle()
    if (!grant || grant.user_id !== userId) {
      return json({ ok: false, error: "grant_not_owned" }, 403)
    }

    // Revoke on Nylas. Best-effort; we still mark local revoked even on failure.
    try {
      const res = await fetch(`${NYLAS_API_URL}/v3/grants/${grantId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${NYLAS_API_KEY}` },
      })
      if (!res.ok) {
        console.warn("nylas grant revoke returned", res.status, await res.text())
      }
    } catch (e) {
      console.warn("nylas revoke fetch failed", e)
    }

    await sb.from("nylas_grants")
      .update({
        sync_state: "revoked",
        last_seen_at: new Date().toISOString(),
      })
      .eq("nylas_grant_id", grantId)

    return json({ ok: true })
  } catch (err) {
    console.error("nylas-revoke-grant error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  })
}
