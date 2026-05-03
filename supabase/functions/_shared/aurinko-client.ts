// =============================================================================
// Aurinko client helpers — Phase B
// =============================================================================
// Shared utilities for talking to Aurinko's API on behalf of a stored grant:
//   - getValidAccessToken: returns a fresh access token, refreshing inline
//     when the cached one is within 60s of expiry.
//   - aurinkoFetch: wraps fetch with the right Authorization header and
//     retries once on 401 with a forced refresh.
//
// All functions take a Supabase service-role client so they can read/write
// aurinko_grants without going through RLS.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

// deno-lint-ignore no-explicit-any
type SbClient = ReturnType<typeof createClient<any, "public", any>>

const AURINKO_API_BASE = Deno.env.get("AURINKO_API_BASE") ?? "https://api.aurinko.io/v1"
const AURINKO_APP_ID = Deno.env.get("AURINKO_APP_ID") ?? ""
const AURINKO_CLIENT_SECRET = Deno.env.get("AURINKO_CLIENT_SECRET") ?? ""

const REFRESH_GRACE_MS = 60 * 1000 // refresh if less than 60s of life left

interface GrantRow {
  aurinko_account_id: number
  access_token: string | null
  token_expires_at: string | null
  sync_state: string
}

export async function loadGrant(
  sb: SbClient,
  accountId: number,
): Promise<GrantRow | null> {
  const { data, error } = await sb
    .from("aurinko_grants")
    .select("aurinko_account_id, access_token, token_expires_at, sync_state")
    .eq("aurinko_account_id", accountId)
    .maybeSingle()
  if (error) {
    console.error("loadGrant failed", error)
    return null
  }
  return (data as GrantRow | null) ?? null
}

export async function getValidAccessToken(
  sb: SbClient,
  accountId: number,
): Promise<string | null> {
  const grant = await loadGrant(sb, accountId)
  if (!grant) return null
  if (grant.sync_state === "revoked") return null

  const expiresAt = grant.token_expires_at ? new Date(grant.token_expires_at).getTime() : 0
  const needsRefresh = !grant.access_token || expiresAt - Date.now() < REFRESH_GRACE_MS
  if (!needsRefresh) return grant.access_token

  return await refreshAccessToken(sb, accountId)
}

/**
 * Mints a fresh access token for the grant. Aurinko's token-refresh endpoint
 * is authenticated with HTTP Basic (clientId:clientSecret) and takes the
 * accountId in the path.
 */
export async function refreshAccessToken(
  sb: SbClient,
  accountId: number,
): Promise<string | null> {
  if (!AURINKO_APP_ID || !AURINKO_CLIENT_SECRET) {
    console.error("aurinko client credentials missing")
    return null
  }
  const basicAuth = btoa(`${AURINKO_APP_ID}:${AURINKO_CLIENT_SECRET}`)
  const res = await fetch(`${AURINKO_API_BASE}/auth/accounts/${accountId}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error("aurinko token refresh failed", res.status, body)
    await sb
      .from("aurinko_grants")
      .update({
        sync_state: "expired",
        last_error: `refresh_failed_${res.status}`,
      })
      .eq("aurinko_account_id", accountId)
    return null
  }
  const accessToken = String(body.accessToken ?? "")
  const expiresIn = Number(body.expiresIn ?? 3600)
  if (!accessToken) return null

  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  await sb
    .from("aurinko_grants")
    .update({
      access_token: accessToken,
      token_expires_at: tokenExpiresAt,
      sync_state: "active",
      last_seen_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("aurinko_account_id", accountId)
  return accessToken
}

/**
 * Authenticated GET against Aurinko. Retries once on 401 with a forced token
 * refresh. Returns the parsed JSON body or null on failure.
 */
export async function aurinkoFetch(
  sb: SbClient,
  accountId: number,
  path: string,
): Promise<Record<string, unknown> | null> {
  let token = await getValidAccessToken(sb, accountId)
  if (!token) return null

  const url = path.startsWith("http") ? path : `${AURINKO_API_BASE}${path}`
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) {
    token = await refreshAccessToken(sb, accountId)
    if (!token) return null
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  }
  if (!res.ok) {
    console.error("aurinkoFetch failed", res.status, await res.text().catch(() => ""))
    return null
  }
  return (await res.json().catch(() => null)) as Record<string, unknown> | null
}
