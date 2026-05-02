// =============================================================================
// nylas-auth-finish — Phase A
// =============================================================================
// Authenticated POST. Body: { code, state }.
// Exchanges the OAuth code with Nylas for a grant_id, then writes the row to
// nylas_grants. Returns { ok, grant_id, email_address, provider } or an error.
//
// The frontend extracts code+state from the callback URL params and POSTs
// here. We don't use a GET callback because we want auth headers on this
// request to bind the new grant to the correct Klosure user.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { verify as jwtVerify } from "https://deno.land/x/djwt@v3.0.2/mod.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const NYLAS_API_URL = Deno.env.get("NYLAS_API_URL") ?? "https://api.us.nylas.com"
const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY") ?? ""
const NYLAS_APP_ID = Deno.env.get("NYLAS_APP_ID") ?? ""
const STATE_SECRET = Deno.env.get("NYLAS_AUTH_STATE_SECRET") ?? ""
const APP_URL = Deno.env.get("APP_URL") ?? "https://klosure.ai"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    // 1. Authenticate the caller.
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

    // 2. Parse the request.
    const body = await req.json().catch(() => ({}))
    const code = String(body.code ?? "")
    const state = String(body.state ?? "")
    if (!code || !state) {
      return json({ ok: false, error: "missing_code_or_state" }, 400)
    }

    // 3. Verify state — confirms this OAuth completion belongs to this user.
    let statePayload: { sub: string; provider: string; nonce: string }
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(STATE_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      )
      statePayload = await jwtVerify(state, key) as typeof statePayload
    } catch (e) {
      return json({ ok: false, error: "invalid_state", detail: String(e) }, 400)
    }
    if (statePayload.sub !== userId) {
      return json({ ok: false, error: "state_user_mismatch" }, 403)
    }
    const provider = statePayload.provider as "google" | "microsoft"

    // 4. Exchange the code with Nylas.
    // v3 expects the API key in the body as `client_secret`, NOT as an
    // Authorization Bearer header. The Authorization header is ignored on
    // this endpoint.
    const exchangeRes = await fetch(`${NYLAS_API_URL}/v3/connect/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: NYLAS_APP_ID,
        client_secret: NYLAS_API_KEY,
        code,
        redirect_uri: `${APP_URL}/settings/connect/callback`,
        grant_type: "authorization_code",
      }),
    })
    const exchangeBody = await exchangeRes.json().catch(() => ({}))
    if (!exchangeRes.ok) {
      console.error("nylas token exchange failed", exchangeRes.status, exchangeBody)
      return json({ ok: false, error: "nylas_exchange_failed", detail: exchangeBody }, 502)
    }

    const grantId = exchangeBody.grant_id as string
    const emailAddress = exchangeBody.email as string
    const scopes = (exchangeBody.scope ?? "").split(" ").filter(Boolean)

    if (!grantId || !emailAddress) {
      return json({ ok: false, error: "nylas_response_incomplete", detail: exchangeBody }, 502)
    }

    // 5. Look up the Klosure user's team.
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: userRow } = await sb.from("users")
      .select("team_id, email")
      .eq("id", userId)
      .maybeSingle()

    // 6. Insert the grant. ON CONFLICT updates if the user re-connected.
    const { error: insertErr } = await sb.from("nylas_grants")
      .upsert({
        user_id: userId,
        team_id: userRow?.team_id ?? null,
        nylas_grant_id: grantId,
        provider,
        email_address: emailAddress,
        scopes,
        sync_state: "active",
        last_seen_at: new Date().toISOString(),
        granted_at: new Date().toISOString(),
        user_email: userRow?.email ?? "",
      }, { onConflict: "nylas_grant_id" })

    if (insertErr) {
      console.error("insert grant failed", insertErr)
      return json({ ok: false, error: "db_insert_failed", detail: insertErr.message }, 500)
    }

    return json({
      ok: true,
      grant_id: grantId,
      email_address: emailAddress,
      provider,
    })
  } catch (err) {
    console.error("nylas-auth-finish error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  })
}
