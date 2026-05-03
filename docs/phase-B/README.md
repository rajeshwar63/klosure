# Phase B — Aurinko + Recall.ai migration

Replaces the Nylas integration from Phase A with two providers split by job:

| Job | Provider | User-visible? |
|---|---|---|
| Inbox + calendar (one OAuth grant) | Aurinko | No — user sees Klosure + Google/Microsoft consent only |
| Meeting bot + transcription | Recall.ai | No — server-to-server, no user OAuth |

The user-facing flow is unchanged: one "Connect your inbox & calendar" button
in `/settings/connections`. Vendor names never appear in our UI.

## What changed

- **`supabase/phase_b_aurinko_recall.sql`** — adds `aurinko_grants` and
  `recall_bots`, extends `email_events` and `meeting_events` with
  `aurinko_account_id` / `aurinko_event_id` / `recall_bot_id`. Old Nylas
  columns become NULLable so legacy rows stay readable.
- **8 new edge functions:**
  - `aurinko-auth-start`, `aurinko-auth-finish`, `aurinko-revoke-grant` — OAuth lifecycle
  - `aurinko-webhook` — receives email + calendar deltas
  - `aurinko-process-email` — fetches the message body, matches a deal,
    posts a system message into chat, triggers `klo-respond`
  - `aurinko-process-calendar` — fetches the event, matches a deal, ensures
    the 📅 calendar pill, dispatches a Recall bot when a Zoom/Meet/Teams
    URL is present
  - `recall-webhook` — receives bot lifecycle + transcript-ready events
  - `recall-process-meeting` — fetches the transcript, posts it as a
    system 'meeting' message, triggers `klo-respond`, increments
    `meeting_usage`
- **Frontend:** `src/services/aurinko.js` (replaces `nylas.js`),
  `src/pages/InboxConnectCallbackPage.jsx` (replaces `NylasCallbackPage`).
  `ConnectButtons`, `GrantsList`, `GrantsListEnhanced` and
  `SettingsConnectionsPage` now read from `aurinko_grants`.
  `ChatView` recognises the new `aurinko_email` / `aurinko_calendar_event` /
  `recall_notetaker` metadata sources alongside the legacy `nylas_*` ones so
  rooms with old rows still render correctly.

## What I have NOT removed

- **`supabase/functions/nylas-*`** — left in place but no longer wired up.
  Safe to delete once Phase B has been live for a week.
- **`nylas_grants` table** — still in the database. Drop with a follow-up
  migration after the new pipeline has run cleanly for a billing cycle.

## Configuration checklist

Before deploying:

1. Apply `phase_b_aurinko_recall.sql` to Supabase.
2. Set Supabase secrets (see `.env.example` Phase B block).
3. Deploy all 8 edge functions:
   ```sh
   supabase functions deploy aurinko-auth-start
   supabase functions deploy aurinko-auth-finish
   supabase functions deploy aurinko-revoke-grant
   supabase functions deploy aurinko-webhook --no-verify-jwt
   supabase functions deploy aurinko-process-email
   supabase functions deploy aurinko-process-calendar
   supabase functions deploy recall-webhook --no-verify-jwt
   supabase functions deploy recall-process-meeting
   ```
4. In Aurinko dashboard → register webhook subscription URL:
   `https://<project>.supabase.co/functions/v1/aurinko-webhook`. Aurinko
   will send a `validationToken` GET; our handler echoes it back. Copy the
   signing key from Aurinko and set it as `AURINKO_SIGNING_KEY`.
5. In Recall dashboard → Webhooks → add endpoint:
   `https://<project>.supabase.co/functions/v1/recall-webhook`. Subscribe to
   `bot.status_change`, `bot.done`, and `transcript.done`. Copy the Svix
   signing secret and set it as `RECALL_WEBHOOK_SECRET`.

## Cost model

Per-seller heavy-user profile (3,000 Klo chats/month):

| Component | Calc | Monthly |
|---|---|---|
| Aurinko (1 connected account) | $1/account | $1.00 |
| Recall.ai meetings + transcription | 13 hrs × $0.65 all-in (`meeting_captions`) | $8.45 |
| Gemini 3.1 Flash-Lite (Klo chats) | 3,000 × $0.0009 | $2.70 |
| Stripe fees on $79 | 2.9% + $0.30 | $2.59 |
| **Per-seller variable cost** | | **$14.74** |

`meeting_captions` (the host platform's free captions) is hardcoded in
`aurinko-process-calendar` to keep the Recall cost at $0.65/hr. Switch to
`assemblyai` or `deepgram` only when accuracy demands it — both raise
per-meeting cost by ~3-5×.
