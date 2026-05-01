// =============================================================================
// nylas-auth-start — Phase A
// =============================================================================
// Authenticated POST. Body: { provider: 'google' | 'microsoft' }.
// Returns: { url } — the hosted auth URL the frontend should redirect to.
//
// State: we encode a signed JWT containing { sub, provider, nonce, exp }.
// nylas-auth-finish verifies the state on callback. Without this, an attacker
// could complete OAuth in their own browser and land grants on someone else's
// account.
//
// Deploy:
//   supabase functions deploy nylas-auth-start
//
// Required secrets:
//   NYLAS_API_KEY, NYLAS_API_URL, NYLAS_APP_ID, NYLAS_GOOGLE_CONNECTOR_ID,
//   NYLAS_MICROSOFT_CONNECTOR_ID, NYLAS_AUTH_STATE_SECRET, APP_URL
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { create as jwtCreate, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const NYLAS_API_URL = Deno.env.get("NYLAS_API_URL") ?? "https://api.us.nylas.com"
const GOOGLE_CONNECTOR = Deno.env.get("NYLAS_GOOGLE_CONNECTOR_ID") ?? ""
const MICROSOFT_CONNECTOR = Deno.env.get("NYLAS_MICROSOFT_CONNECTOR_ID") ?? ""
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
    const auth = req.headers.get("Authorization") ?? ""
    if (!auth.startsWith("Bearer ")) {
      return json({ ok: false, error: "not_authenticated" }, 401)
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    })
    const { data: userData, error: userErr } = await sb.auth.getUser()
    if (userErr || !userData?.user) {
      return json({ ok: false, error: "not_authenticated" }, 401)
    }
    const userId = userData.user.id

    const body = await req.json().catch(() => ({}))
    const provider = String(body.provider ?? "")
    if (provider !== "google" && provider !== "microsoft") {
      return json({ ok: false, error: "invalid_provider" }, 400)
    }
    const connectorId = provider === "google" ? GOOGLE_CONNECTOR : MICROSOFT_CONNECTOR
    if (!connectorId) {
      return json({ ok: false, error: "connector_not_configured" }, 500)
    }
    if (!STATE_SECRET) {
      return json({ ok: false, error: "state_secret_not_configured" }, 500)
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(STATE_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    )
    const state = await jwtCreate(
      { alg: "HS256", typ: "JWT" },
      {
        sub: userId,
        provider,
        exp: getNumericDate(15 * 60),
        nonce: crypto.randomUUID(),
      },
      key,
    )

    const redirectUri = `${APP_URL}/settings/connect/callback`
    const params = new URLSearchParams({
      client_id: Deno.env.get("NYLAS_APP_ID") ?? "",
      provider,
      connector_id: connectorId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      access_type: "offline",
    })

    const url = `${NYLAS_API_URL}/v3/connect/auth?${params.toString()}`
    return json({ ok: true, url })
  } catch (err) {
    console.error("nylas-auth-start error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  })
}
