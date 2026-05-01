# Sprint 03 — OAuth flow frontend

**Sprint:** 3 of 11
**Estimated:** 1.5 days
**Goal:** Build the user-facing flow that connects a Gmail or Outlook account via Nylas hosted authentication. After this sprint, a user can hit a "Connect Gmail" button, complete OAuth in Google's UI, and end up with a row in `nylas_grants`.

## Why this matters

This is the most user-facing piece of Phase A and the demo moment. If the OAuth flow is janky, customers won't complete it — and without grants, nothing else in Phase A produces any value. We use Nylas's **hosted authentication** so we don't have to host our own OAuth callback logic, deal with state CSRF protection ourselves, or store provider tokens.

## Deliverable

Three things ship in this sprint:

1. A new edge function `nylas-auth-start` that returns a hosted-auth URL
2. A new edge function `nylas-auth-finish` that exchanges the code for a grant
3. Frontend UI for the connect/disconnect buttons (the page itself ships in sprint 09 — this sprint just provides the components)

## Architecture decision: hosted auth, not native

Nylas offers two flows:
- **Hosted**: User clicks our button → we redirect to Nylas → Nylas redirects to Google/Microsoft → user grants → Nylas exchanges code → Nylas calls our callback with a `code` we exchange for a grant ID
- **Native**: We talk OAuth directly to Google/Microsoft, then hand the tokens to Nylas

Hosted is the correct choice for Klosure because:
- We don't store provider tokens (lower compliance burden)
- Token refresh is Nylas's problem, not ours
- One code path for both Gmail and Outlook
- 10x less code to maintain

Native auth is only worth the overhead at scale-out (10K+ grants) where the hosted flow's per-grant fee adds up. Not us, not now.

## Edge function 1: nylas-auth-start

Path: `supabase/functions/nylas-auth-start/index.ts`

```typescript
// =============================================================================
// nylas-auth-start
// =============================================================================
// Authenticated POST. Body: { provider: 'google' | 'microsoft' }.
// Returns: { url } — the hosted auth URL the frontend should redirect to.
//
// State: we encode a signed JWT containing { user_id, provider, nonce, exp }.
// nylas-auth-finish verifies the state on callback. Without this, an attacker
// could complete OAuth in their own browser and land grants on someone else's
// account.
//
// Deploy:
//   supabase functions deploy nylas-auth-start
//
// Required secrets:
//   NYLAS_API_KEY, NYLAS_API_URL, NYLAS_GOOGLE_CONNECTOR_ID,
//   NYLAS_MICROSOFT_CONNECTOR_ID, NYLAS_AUTH_STATE_SECRET (sprint 03 adds this)
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { create as jwtCreate, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const NYLAS_API_URL = Deno.env.get("NYLAS_API_URL") ?? "https://api.us.nylas.com"
const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY") ?? ""
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
    // Authenticate the caller.
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

    // Parse the request.
    const body = await req.json().catch(() => ({}))
    const provider = String(body.provider ?? "")
    if (provider !== "google" && provider !== "microsoft") {
      return json({ ok: false, error: "invalid_provider" }, 400)
    }
    const connectorId = provider === "google" ? GOOGLE_CONNECTOR : MICROSOFT_CONNECTOR
    if (!connectorId) {
      return json({ ok: false, error: "connector_not_configured" }, 500)
    }

    // Build a signed state token. Nylas just echoes it back; we verify on the
    // callback to prove the OAuth completion is for the right user.
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
        exp: getNumericDate(15 * 60),  // 15min to complete OAuth
        nonce: crypto.randomUUID(),
      },
      key,
    )

    // Construct the Nylas hosted-auth URL.
    const redirectUri = `${APP_URL}/settings/connect/callback`
    const params = new URLSearchParams({
      client_id: Deno.env.get("NYLAS_APP_ID") ?? "",
      provider,
      connector_id: connectorId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      access_type: "offline",  // Important for refresh tokens
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
```

Generate and store the state secret:

```powershell
# PowerShell:
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = [Convert]::ToHexString($bytes).ToLower()
supabase secrets set NYLAS_AUTH_STATE_SECRET=$secret
```

Deploy:

```powershell
supabase functions deploy nylas-auth-start
```

## Edge function 2: nylas-auth-finish

Path: `supabase/functions/nylas-auth-finish/index.ts`

```typescript
// =============================================================================
// nylas-auth-finish
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
    const exchangeRes = await fetch(`${NYLAS_API_URL}/v3/connect/token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NYLAS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: NYLAS_APP_ID,
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

    // 5. Look up the Klosure user's team (denormalised for fast manager view).
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
```

Deploy:

```powershell
supabase functions deploy nylas-auth-finish
```

## Frontend service: src/services/nylas.js

```javascript
// =============================================================================
// Nylas service — Phase A
// =============================================================================
import { supabase } from '../lib/supabase.js'

export async function startConnect({ provider }) {
  if (provider !== 'google' && provider !== 'microsoft') {
    return { ok: false, error: 'invalid_provider' }
  }
  const { data, error } = await supabase.functions.invoke('nylas-auth-start', {
    body: { provider },
  })
  if (error) return { ok: false, error: error.message }
  return data
}

export async function finishConnect({ code, state }) {
  const { data, error } = await supabase.functions.invoke('nylas-auth-finish', {
    body: { code, state },
  })
  if (error) return { ok: false, error: error.message }
  return data
}

export async function listGrants() {
  const { data, error } = await supabase
    .from('nylas_grants')
    .select('id, nylas_grant_id, provider, email_address, sync_state, granted_at, last_seen_at, last_error')
    .order('granted_at', { ascending: false })
  if (error) return { ok: false, error: error.message, grants: [] }
  return { ok: true, grants: data ?? [] }
}

export async function disconnectGrant({ grantId }) {
  // Soft-delete: mark sync_state='revoked' first, the webhook handler will
  // eventually clean up. We also call Nylas to revoke server-side.
  const { error: updateErr } = await supabase
    .from('nylas_grants')
    .update({ sync_state: 'revoked', last_seen_at: new Date().toISOString() })
    .eq('nylas_grant_id', grantId)
  if (updateErr) return { ok: false, error: updateErr.message }

  // Fire-and-forget the revoke. Even if it fails, the row is marked revoked
  // and the webhook handler will skip it.
  await supabase.functions.invoke('nylas-revoke-grant', { body: { grantId } })
    .catch(() => {})  // intentional swallow

  return { ok: true }
}
```

## Frontend page: callback handler

Path: `src/pages/NylasCallbackPage.jsx`

```jsx
// Phase A — OAuth callback handler.
// Nylas redirects here with ?code=...&state=... after the user completes auth.
// We POST those to nylas-auth-finish and redirect back to settings.

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { finishConnect } from '../services/nylas.js'

export default function NylasCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('connecting')

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    const errParam = params.get('error')

    if (errParam) {
      setStatus('error')
      setError(`Provider returned an error: ${errParam}. ${params.get('error_description') ?? ''}`)
      return
    }
    if (!code || !state) {
      setStatus('error')
      setError('Missing code or state in callback URL.')
      return
    }

    finishConnect({ code, state }).then((result) => {
      if (!result.ok) {
        setStatus('error')
        setError(result.error || 'Connection failed.')
        return
      }
      setStatus('done')
      // Brief success pause, then redirect.
      setTimeout(() => navigate('/settings/connections', { replace: true }), 1500)
    }).catch((e) => {
      setStatus('error')
      setError(String(e))
    })
  }, [params, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full">
        {status === 'connecting' && (
          <>
            <h1 className="text-xl font-semibold text-navy">Connecting your account…</h1>
            <p className="mt-2 text-sm text-navy/60">This usually takes a few seconds.</p>
          </>
        )}
        {status === 'done' && (
          <>
            <h1 className="text-xl font-semibold text-emerald-700">Connected!</h1>
            <p className="mt-2 text-sm text-navy/60">Redirecting back to settings…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-xl font-semibold text-red-700">Connection failed</h1>
            <p className="mt-2 text-sm text-navy/60">{error}</p>
            <button
              onClick={() => navigate('/settings/connections')}
              className="mt-4 bg-klo text-white px-4 py-2 rounded-xl"
            >
              Back to settings
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

Add the route in `src/App.jsx`:

```jsx
import NylasCallbackPage from './pages/NylasCallbackPage.jsx'
// ...
<Route path="/settings/connect/callback" element={<NylasCallbackPage />} />
```

## Frontend component: connect buttons

Path: `src/components/settings/ConnectButtons.jsx`

```jsx
import { useState } from 'react'
import { startConnect } from '../../services/nylas.js'

export default function ConnectButtons() {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function handleConnect(provider) {
    setBusy(provider)
    setError(null)
    const result = await startConnect({ provider })
    if (!result.ok) {
      setBusy(null)
      setError(result.error || 'Could not start connection')
      return
    }
    // Full-page redirect to Nylas — they handle the rest.
    window.location.href = result.url
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => handleConnect('google')}
        disabled={!!busy}
        className="w-full bg-white border border-navy/10 hover:border-navy/30 text-navy font-medium py-3 px-4 rounded-xl flex items-center gap-3 disabled:opacity-50"
      >
        <GoogleLogo />
        {busy === 'google' ? 'Opening Google…' : 'Connect Gmail & Google Calendar'}
      </button>
      <button
        onClick={() => handleConnect('microsoft')}
        disabled={!!busy}
        className="w-full bg-white border border-navy/10 hover:border-navy/30 text-navy font-medium py-3 px-4 rounded-xl flex items-center gap-3 disabled:opacity-50"
      >
        <MicrosoftLogo />
        {busy === 'microsoft' ? 'Opening Microsoft…' : 'Connect Outlook & M365 Calendar'}
      </button>
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </div>
      )}
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.2 5.2C41.4 35.4 44 30 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  )
}

function MicrosoftLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 23 23">
      <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
      <path fill="#f35325" d="M1 1h10v10H1z"/>
      <path fill="#81bc06" d="M12 1h10v10H12z"/>
      <path fill="#05a6f0" d="M1 12h10v10H1z"/>
      <path fill="#ffba08" d="M12 12h10v10H12z"/>
    </svg>
  )
}
```

## Frontend component: grants list

Path: `src/components/settings/GrantsList.jsx`

```jsx
import { useEffect, useState } from 'react'
import { listGrants, disconnectGrant } from '../../services/nylas.js'

export default function GrantsList() {
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function refresh() {
    const result = await listGrants()
    setGrants(result.grants)
    setLoading(false)
    if (!result.ok) setError(result.error)
  }

  useEffect(() => { refresh() }, [])

  async function handleDisconnect(grantId, label) {
    if (!confirm(`Disconnect ${label}? Klo will stop reading email and meetings from this account.`)) return
    const result = await disconnectGrant({ grantId })
    if (!result.ok) {
      alert(`Could not disconnect: ${result.error}`)
      return
    }
    refresh()
  }

  if (loading) return <div className="text-sm text-navy/50">Loading connections…</div>
  if (error) return <div className="text-sm text-red-700">{error}</div>
  if (grants.length === 0) {
    return (
      <div className="text-sm text-navy/50 italic">
        No accounts connected yet. Connect one above so Klo can read your email and meetings.
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {grants.map((g) => (
        <li key={g.nylas_grant_id} className="bg-white border border-navy/10 rounded-xl p-3 flex justify-between items-center">
          <div>
            <div className="font-medium text-navy">{g.email_address}</div>
            <div className="text-xs text-navy/50">
              {g.provider === 'google' ? 'Google' : 'Microsoft'} · {g.sync_state}
              {g.last_error && <span className="text-red-600"> · {g.last_error}</span>}
            </div>
          </div>
          {g.sync_state !== 'revoked' && (
            <button
              onClick={() => handleDisconnect(g.nylas_grant_id, g.email_address)}
              className="text-sm text-red-600 hover:underline"
            >
              Disconnect
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
```

## Acceptance

- [ ] `nylas-auth-start` deploys without errors
- [ ] `nylas-auth-finish` deploys without errors
- [ ] `NYLAS_AUTH_STATE_SECRET` is set in Supabase secrets
- [ ] Calling `startConnect({ provider: 'google' })` returns a URL pointing to `api.us.nylas.com/v3/connect/auth`
- [ ] Loading that URL in a browser shows Google's OAuth consent screen for Klosure
- [ ] Granting consent redirects to `/settings/connect/callback?code=...&state=...`
- [ ] The callback page shows "Connecting…" then "Connected!" then redirects
- [ ] After redirect, `select * from nylas_grants where user_id = auth.uid()` returns the new row with `sync_state='active'`
- [ ] `GrantsList` shows the new grant
- [ ] Clicking Disconnect updates `sync_state` to `'revoked'`
- [ ] Repeat for Microsoft connector with an outlook.com account

## Pitfalls

- **Verification status**: while Google OAuth is in pending verification, you'll see an "unverified app" warning to users. Acceptable for dev/internal/early customers. Past 100 users without verification, OAuth blocks new sign-ups — that's the hard ceiling.
- **State token expiry**: 15 minutes. If the user hesitates on the consent screen for longer, they'll get `invalid_state` on callback. Acceptable; tell them in the error message to "try connecting again."
- **`access_type=offline`**: required for refresh tokens. Without it, grants expire in 1 hour. Already in the spec but worth noting.
- **Mismatched redirect URI**: the URI in the start request and finish request must match exactly. Even a trailing slash difference causes Nylas to refuse the exchange.
- **Test with both Vercel preview URLs and localhost**: each environment needs its own redirect URI registered with Google, Microsoft, *and* Nylas.

→ Next: `04-nylas-webhook-handler.md`
