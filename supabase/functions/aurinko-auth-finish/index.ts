// =============================================================================
// aurinko-auth-finish — Phase B
// =============================================================================
// Authenticated POST. Body: { code, state }.
// Exchanges Aurinko's auth code for an accountId + tokens, persists the row
// to aurinko_grants. Returns { ok, account_id, email_address, provider }.
//
// The frontend reads code+state from the callback URL and POSTs here. We
// don't use a GET callback because we need the auth header to bind the new
// grant to the correct Klosure user.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { verify as jwtVerify } from "https://deno.land/x/djwt@v3.0.2/mod.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const AURINKO_API_BASE = Deno.env.get("AURINKO_API_BASE") ?? "https://api.aurinko.io/v1"
const AURINKO_APP_ID = Deno.env.get("AURINKO_APP_ID") ?? ""
const AURINKO_CLIENT_SECRET = Deno.env.get("AURINKO_CLIENT_SECRET") ?? ""
const STATE_SECRET = Deno.env.get("AURINKO_AUTH_STATE_SECRET") ?? ""

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
    const code = String(body.code ?? "")
    const state = String(body.state ?? "")
    if (!code || !state) {
      return json({ ok: false, error: "missing_code_or_state" }, 400)
    }

    // Verify state — confirms this OAuth completion belongs to this user.
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
    const provider = statePayload.provider as "google" | "office365"

    // Exchange code -> tokens. Aurinko uses HTTP Basic auth on this endpoint:
    //   POST /v1/auth/token/{code}
    //   Authorization: Basic base64(clientId:clientSecret)
    const basicAuth = btoa(`${AURINKO_APP_ID}:${AURINKO_CLIENT_SECRET}`)
    const exchangeRes = await fetch(`${AURINKO_API_BASE}/auth/token/${encodeURIComponent(code)}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
    })
    const exchangeBody = await exchangeRes.json().catch(() => ({}))
    if (!exchangeRes.ok) {
      console.error("aurinko token exchange failed", exchangeRes.status, exchangeBody)
      return json({ ok: false, error: "aurinko_exchange_failed", detail: exchangeBody }, 502)
    }

    const accountId = Number(exchangeBody.accountId)
    const accessToken = String(exchangeBody.accessToken ?? "")
    const expiresIn = Number(exchangeBody.expiresIn ?? 3600)
    const scopes = ((exchangeBody.scopes as string | undefined) ?? "").split(/\s+/).filter(Boolean)

    if (!accountId || !accessToken) {
      return json({ ok: false, error: "aurinko_response_incomplete", detail: exchangeBody }, 502)
    }

    // Pull the account's email address. Aurinko returns it in /accounts/{id}.
    const accountInfoRes = await fetch(`${AURINKO_API_BASE}/account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const accountInfo = await accountInfoRes.json().catch(() => ({}))
    if (!accountInfoRes.ok) {
      console.error("aurinko account fetch failed", accountInfoRes.status, accountInfo)
      return json({ ok: false, error: "aurinko_account_fetch_failed", detail: accountInfo }, 502)
    }
    const emailAddress = String(accountInfo.email ?? accountInfo.username ?? "")
    if (!emailAddress) {
      return json({ ok: false, error: "no_email_on_account", detail: accountInfo }, 502)
    }

    // Look up the Klosure user's team for denormalisation.
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: userRow } = await sb.from("users")
      .select("team_id, email")
      .eq("id", userId)
      .maybeSingle()

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    const { error: insertErr } = await sb.from("aurinko_grants")
      .upsert({
        user_id: userId,
        team_id: userRow?.team_id ?? null,
        aurinko_account_id: accountId,
        provider,
        email_address: emailAddress,
        scopes,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        sync_state: "active",
        last_seen_at: new Date().toISOString(),
        granted_at: new Date().toISOString(),
        user_email: userRow?.email ?? "",
      }, { onConflict: "aurinko_account_id" })

    if (insertErr) {
      console.error("insert grant failed", insertErr)
      return json({ ok: false, error: "db_insert_failed", detail: insertErr.message }, 500)
    }

    return json({
      ok: true,
      account_id: accountId,
      email_address: emailAddress,
      provider,
    })
  } catch (err) {
    console.error("aurinko-auth-finish error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  })
}
