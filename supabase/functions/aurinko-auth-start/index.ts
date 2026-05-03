// =============================================================================
// aurinko-auth-start — Phase B
// =============================================================================
// Authenticated POST. Body: { provider: 'google' | 'office365' }.
// Returns: { url } — the Aurinko hosted-auth URL the frontend redirects to.
//
// State: signed JWT containing { sub, provider, nonce, exp }. aurinko-auth-
// finish verifies the state on callback to bind the new account to the
// correct Klosure user; without it, an attacker could complete OAuth in
// their own browser and land a grant on someone else's account.
//
// Deploy:
//   supabase functions deploy aurinko-auth-start
//
// Required Supabase secrets:
//   AURINKO_APP_ID, AURINKO_CLIENT_SECRET, AURINKO_API_BASE,
//   AURINKO_AUTH_STATE_SECRET, APP_URL
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { create as jwtCreate, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const AURINKO_API_BASE = Deno.env.get("AURINKO_API_BASE") ?? "https://api.aurinko.io/v1"
const AURINKO_APP_ID = Deno.env.get("AURINKO_APP_ID") ?? ""
const STATE_SECRET = Deno.env.get("AURINKO_AUTH_STATE_SECRET") ?? ""
const APP_URL = Deno.env.get("APP_URL") ?? "https://klosure.ai"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Aurinko's serviceType slugs are PascalCase. Our public API takes the same
// 'google' | 'office365' strings the Nylas flow used; we translate here.
const SERVICE_TYPE: Record<string, string> = {
  google: "Google",
  office365: "Office365",
}

// Inbox + calendar in one grant. Mail.Drafts intentionally omitted — Klo
// doesn't send email, only reads.
const SCOPES = "Mail.Read Mail.ReadWrite Calendar.Read"

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
    const serviceType = SERVICE_TYPE[provider]
    if (!serviceType) {
      return json({ ok: false, error: "invalid_provider" }, 400)
    }
    if (!AURINKO_APP_ID) {
      return json({ ok: false, error: "aurinko_app_not_configured" }, 500)
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

    const returnUrl = `${APP_URL}/settings/connect/callback`
    const params = new URLSearchParams({
      clientId: AURINKO_APP_ID,
      serviceType,
      scopes: SCOPES,
      responseType: "code",
      returnUrl,
      state,
    })

    const url = `${AURINKO_API_BASE}/auth/authorize?${params.toString()}`
    return json({ ok: true, url })
  } catch (err) {
    console.error("aurinko-auth-start error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  })
}
