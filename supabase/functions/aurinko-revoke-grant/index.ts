// =============================================================================
// aurinko-revoke-grant — Phase B
// =============================================================================
// Authenticated POST. Body: { accountId }.
// Revokes the grant on Aurinko's side and marks the local row as 'revoked'.
// Best-effort — frontend doesn't block on the Aurinko response.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const AURINKO_API_BASE = Deno.env.get("AURINKO_API_BASE") ?? "https://api.aurinko.io/v1"

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
    const accountId = Number(body.accountId ?? 0)
    if (!accountId) {
      return json({ ok: false, error: "missing_accountId" }, 400)
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: grant } = await sb.from("aurinko_grants")
      .select("user_id, sync_state, access_token")
      .eq("aurinko_account_id", accountId)
      .maybeSingle()
    if (!grant || grant.user_id !== userId) {
      return json({ ok: false, error: "grant_not_owned" }, 403)
    }

    // Revoke on Aurinko. Best-effort; we mark local revoked even on failure
    // so the user can't keep using a half-revoked grant.
    if (grant.access_token) {
      try {
        const res = await fetch(`${AURINKO_API_BASE}/auth/account`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${grant.access_token}` },
        })
        if (!res.ok) {
          console.warn("aurinko revoke returned", res.status, await res.text())
        }
      } catch (e) {
        console.warn("aurinko revoke fetch failed", e)
      }
    }

    await sb.from("aurinko_grants")
      .update({
        sync_state: "revoked",
        last_seen_at: new Date().toISOString(),
        access_token: null,
        token_expires_at: null,
      })
      .eq("aurinko_account_id", accountId)

    return json({ ok: true })
  } catch (err) {
    console.error("aurinko-revoke-grant error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  })
}
