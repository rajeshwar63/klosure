# Sprint 01 — Nylas account setup

**Sprint:** 1 of 11
**Estimated:** 0.5 days
**Goal:** Get a production-grade Nylas application configured with both Google and Microsoft connectors, OAuth credentials registered with both providers, and all secrets stored in Supabase. No code in this sprint — pure account setup that everything downstream depends on.

## Why this matters

Nylas is the single vendor for three integrations (email, calendar, meetings). Misconfigure the app now and every downstream sprint fails at runtime with cryptic errors. The 30 minutes spent here saves 3 days of debugging in sprints 4–6.

This sprint also starts the **Google OAuth verification clock**, which can take 4–6 weeks. We start it now so it's done before sprint 9 (production launch).

## Deliverable

A documented Nylas app, two OAuth provider apps, and a populated Supabase secrets list. Output of this sprint is configuration, not code — but the commit *does* include `docs/phase-A/nylas-validation-notes.md` as a placeholder for Rajeshwar's validation results during week 1.

## Steps

### 1. Nylas application

1. Log into [dashboard-v3.nylas.com](https://dashboard-v3.nylas.com).
2. Confirm you are on **Nylas v3** (not v2 — v2 is legacy and the SDK shapes differ).
3. **Create a new application** named `klosure-prod`. Region: **us-east-1** (lowest latency to Supabase ap-south-1 is actually us-east-1 over the public internet for webhook traffic; verified empirically).
4. Note the **Application ID** and **API Key (v3)** — both go to Supabase secrets below.
5. Enable the **Notetaker** add-on. If the dashboard shows "Trial: 5 free hours", you're good. Production billing is metered after the 5 hours; that's fine for now.

### 2. Google OAuth credentials

Required for Gmail + Google Calendar + Meet capture.

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a new project named `klosure-nylas`.
2. **Enable APIs**: Gmail API, Google Calendar API, Google People API.
3. **OAuth consent screen** → External → fill in:
   - App name: `Klosure`
   - User support email: `support@klosure.ai` (use rajeshwar63@gmail.com if support@ isn't set up yet — but set it up before submitting for verification)
   - Developer contact: `rajeshwar63@gmail.com`
   - App domain: `klosure.ai` (the domain is still pending DNS per memory — set this anyway, verification can proceed in parallel)
   - Privacy policy URL: `https://klosure.ai/privacy` (must exist before submission — see "verification timeline" below)
   - Terms of service URL: `https://klosure.ai/terms`
4. **Scopes** — request these and only these (over-requesting delays verification):
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.metadata`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events.readonly`
   - `openid`, `email`, `profile`
5. **Credentials → Create OAuth client ID** → Web application → name `klosure-nylas-web`.
   - Authorized redirect URIs:
     - `https://api.us.nylas.com/v3/connect/callback` (Nylas hosted auth callback)
     - `http://localhost:5173/settings/connect/callback` (dev)
     - `https://klosure.vercel.app/settings/connect/callback`
     - `https://klosure.ai/settings/connect/callback` (add now, will work post-DNS)
6. Note **Client ID** and **Client Secret**.
7. **Submit for verification** — click "Publish app" then "Submit for verification". This starts a 4–6 week clock. While in pending verification, your app works for up to 100 users; that's plenty for sandbox testing and design partners.

### 3. Microsoft OAuth credentials

Required for Outlook mail + Microsoft 365 calendar + Teams meeting capture.

1. Go to [entra.microsoft.com](https://entra.microsoft.com) → **App registrations** → **New registration**.
2. Name: `klosure-nylas`. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**. Redirect URI: Web → `https://api.us.nylas.com/v3/connect/callback`.
3. After creation, go to **Authentication** → add the same redirect URIs as Google (the four above).
4. **Certificates & secrets** → **New client secret** → expiry 24 months. Copy the **value** immediately (it's only shown once).
5. **API permissions** → **Add a permission** → Microsoft Graph → **Delegated permissions**:
   - `Mail.Read`
   - `Mail.ReadBasic`
   - `Calendars.Read`
   - `Calendars.Read.Shared`
   - `User.Read`
   - `offline_access`
6. Click **Grant admin consent for [your tenant]**.
7. Note the **Application (client) ID**, **Directory (tenant) ID** (use `common` for multi-tenant), and the **Client Secret value** from step 4.

### 4. Register connectors in Nylas

In the Nylas dashboard:

1. **Connectors → Create → Google**
   - Provider: Google
   - Client ID: from step 2.6
   - Client Secret: from step 2.6
   - Scopes: paste exactly the 5 scopes from step 2.4
2. **Connectors → Create → Microsoft**
   - Provider: Microsoft
   - Client ID: from step 3.7
   - Client Secret: from step 3.7
   - Tenant ID: `common`
   - Scopes: paste exactly the 6 scopes from step 3.5

### 5. Configure Notetaker defaults

Nylas dashboard → Notetaker settings:

- **Bot display name**: `Klo (Klosure)` — buyers see this in the participant list
- **Auto-join meetings**: ON for events where the connected user is the organizer; OFF otherwise (we'll override per-event from code)
- **Recording**: ON
- **Transcription**: ON, language `en` with auto-detect fallback
- **Speaker labels**: ON
- **Summary**: ON (we won't use Nylas's summary — we generate our own via klo-respond — but having it as backup is free)

### 6. Webhook destination — placeholder

Set the webhook URL to `https://azpdsgnvqkrfdvqxacqw.supabase.co/functions/v1/nylas-webhook`. The function doesn't exist yet (sprint 04 builds it), so webhook deliveries will 404. That's fine — Nylas retries with exponential backoff for 24 hours. By the time sprint 04 deploys, real events from your sandbox grants will arrive.

Subscribe to these event types (only):

- `message.created`
- `message.updated`
- `event.created`
- `event.updated`
- `event.deleted`
- `notetaker.media.updated`
- `notetaker.meeting_state.updated`
- `grant.expired`
- `grant.deleted`

Do NOT subscribe to `message.opened`, `thread.replied`, or other engagement events — they fire constantly and we don't use them.

### 7. Generate webhook signing secret

Nylas dashboard → Webhooks → click your webhook → **Signing secret**. Copy it.

### 8. Store secrets in Supabase

Run from PowerShell at `C:\Users\rajes\Documents\klosure`:

```powershell
supabase secrets set NYLAS_API_KEY=nyk_v0_<your-api-key>
supabase secrets set NYLAS_APP_ID=<your-app-id>
supabase secrets set NYLAS_API_URL=https://api.us.nylas.com
supabase secrets set NYLAS_WEBHOOK_SECRET=<your-signing-secret>
supabase secrets set NYLAS_GOOGLE_CONNECTOR_ID=<connector-id-from-dashboard>
supabase secrets set NYLAS_MICROSOFT_CONNECTOR_ID=<connector-id-from-dashboard>

# Restore the rollback secret while you're here — Rajeshwar's pending action item
supabase secrets set ANTHROPIC_API_KEY=<your-anthropic-key>
```

Verify they all landed:

```powershell
supabase secrets list | Select-String "NYLAS|ANTHROPIC"
```

### 9. Frontend env vars

Add to `.env.local` and to Vercel project env (both preview and production):

```
VITE_NYLAS_GOOGLE_CONNECTOR_ID=<same as above>
VITE_NYLAS_MICROSOFT_CONNECTOR_ID=<same as above>
VITE_NYLAS_API_URL=https://api.us.nylas.com
```

The connector IDs are not secret (they're sent in the OAuth URL) so they're safe to bundle.

### 10. Create the validation notes placeholder

Create `docs/phase-A/nylas-validation-notes.md`:

```markdown
# Nylas validation notes — Phase A week 1

Run during week 1 of Phase A, before sprint 04 commits. Three tests:

## Test 1 — Gmail webhook latency
- [ ] Connected own Gmail (rajeshwar63@gmail.com) via hosted OAuth
- [ ] Sent 5 test emails from another account
- [ ] Webhook latency for each (target: <60s):
  - Email 1: ___s
  - Email 2: ___s
  - Email 3: ___s
  - Email 4: ___s
  - Email 5: ___s
- [ ] Median latency: ___s
- [ ] Verdict: PASS / FAIL

## Test 2 — Outlook sync
- [ ] Created free outlook.com account
- [ ] Connected via hosted OAuth
- [ ] Email arrives and webhook fires
- [ ] Verdict: PASS / FAIL

## Test 3 — Notetaker on Gulf-accent call
- [ ] Scheduled a Google Meet with someone speaking English with Gulf or Indian accent
- [ ] Notetaker bot joined automatically: YES / NO
- [ ] Talked for 10+ minutes about a fake deal with: company names, AED amounts, dates, decisions
- [ ] Transcript reviewed line by line
- [ ] Specific things it got wrong: ___
- [ ] Numbers transcribed correctly: YES / MOSTLY / NO
- [ ] Proper nouns transcribed correctly: YES / MOSTLY / NO
- [ ] Verdict: PASS / ACCEPTABLE / FAIL

## Decision

Based on results above:
- All PASS → proceed with Phase A as written
- Test 3 FAIL → swap meeting capture to Recall.ai; rewrite sprints 04, 06, 07
- Test 1 or 2 FAIL → escalate to Nylas support before proceeding
```

## Acceptance

- [ ] Nylas app `klosure-prod` exists in v3 dashboard
- [ ] Notetaker enabled with `Klo (Klosure)` bot name
- [ ] Google OAuth client created, submitted for verification
- [ ] Microsoft OAuth app created, admin consent granted
- [ ] Both connectors registered in Nylas with correct scopes
- [ ] Webhook configured (will 404 until sprint 04, that's fine)
- [ ] All 6 Nylas secrets in Supabase (`supabase secrets list` confirms)
- [ ] `ANTHROPIC_API_KEY` rollback secret restored
- [ ] Frontend env vars in `.env.local` and Vercel
- [ ] `docs/phase-A/nylas-validation-notes.md` exists as placeholder

## Pitfalls

- **Wrong Nylas region** → if you accidentally created the app in EU region, webhook latency to ap-south-1 Supabase doubles. If you notice this, recreate in us-east-1; it's not migratable.
- **Forgetting `offline_access` on Microsoft** → grants will expire in 1 hour with no refresh. The dashboard doesn't warn you.
- **Granting admin consent for the wrong tenant** → if your Microsoft account is part of a corporate tenant, you may grant consent for that tenant only. Use a personal account or pick `common` tenant deliberately.
- **Submitting Google for verification with placeholder URLs** → if your privacy/terms URLs return 404, Google rejects the submission and you restart the 4-week clock. Stand them up first (sprint 08 includes a stub legal page; if you can't wait, host static text on Vercel under `/privacy` and `/terms` today).

## Cost as of this sprint

$0. Nylas billing kicks in only when grants are used or Notetaker exceeds 5 hours.

→ Next: `02-supabase-schema-extensions.md`
