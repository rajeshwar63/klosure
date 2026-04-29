# Manual onboarding — Phase 12.1 / 12.2 / 12.3

Razorpay self-serve upgrade ships in Phase 12.3, but the manual grant path
below is still the right tool for design partners, refunds, and anything
that doesn't want to flow through Razorpay. Run everything from the Supabase
SQL Editor against project `azpdsgnvqkrfdvqxacqw` (klosure).

The SQL helper `public.admin_grant_plan(email, plan, period_end)` is the
primary tool. It is **not** granted to `authenticated` — only the postgres
role (i.e. you, in the SQL Editor) can call it. It updates either
`public.users` or `public.teams` depending on whether the plan is solo or
team, clears `read_only_since`, and sets `current_period_end`.

---

## Granting plans

```sql
-- Grant Pro solo for 1 month (default period):
select public.admin_grant_plan('user@example.com', 'pro');

-- Grant Team Growth for 12 months (annual paid up front):
select public.admin_grant_plan('manager@example.com', 'team_growth', now() + interval '12 months');

-- Extend an existing customer:
select public.admin_grant_plan('user@example.com', 'pro', now() + interval '6 months');
```

`admin_grant_plan` will raise:

- `user not found` — typo in email, user hasn't signed up yet.
- `user has no team — they must create a team first via /billing` —
  if you try to grant a team plan to someone whose `users.team_id` is null.
  Have them create a team via the **Create Team** card on `/billing`, then
  grant.

## Permanent / partner overrides

For design partners, internal accounts, and special cases that should
bypass all trial / payment logic, use `plan_override` directly. This lives
on either `public.users` (solo) or `public.teams` (team plans).

```sql
-- Design partner with permanent Team Scale access until end of 2027:
update public.users set plan_override = jsonb_build_object(
  'plan', 'team_scale',
  'expires_at', '2027-12-31T00:00:00Z',
  'granted_by', 'rajeshwar',
  'reason', 'design partner'
) where email = 'partner@example.com';

-- Internal Klosure team account, no expiry:
update public.users set plan_override = jsonb_build_object(
  'plan', 'team_scale',
  'expires_at', null,
  'granted_by', 'rajeshwar',
  'reason', 'internal'
) where email = 'internal@klosure.ai';

-- Team-level override (whole team gets Enterprise):
update public.teams set plan_override = jsonb_build_object(
  'plan', 'enterprise',
  'expires_at', null,
  'granted_by', 'rajeshwar',
  'reason', 'pilot customer'
) where id = '<team-uuid>';
```

`get_account_status` checks override **before** trial/period logic, so a
non-expired override always wins. Status flips to `'overridden'` (treated as
active by `can_write` and the frontend).

## Reversing a grant

```sql
-- Revoke a plan, drop the user back to read-only if their trial has lapsed,
-- or back to trial_active if they're still inside the 14-day window:
update public.users set
  current_period_end = null,
  plan = 'trial',
  read_only_since = case when trial_ends_at < now() then now() else null end
where email = 'mistake@example.com';

-- Revoke a team plan:
update public.teams set
  current_period_end = null,
  plan = 'trial',
  read_only_since = null
where id = '<team-uuid>';

-- Lift an override:
update public.users set plan_override = null where email = 'partner@example.com';
update public.teams set plan_override = null where id = '<team-uuid>';
```

## Verifying status

```sql
-- What does the system think about this user right now?
select public.get_account_status(id) from public.users where email = 'user@example.com';

-- Spot-check anyone who is read-only:
select email, read_only_since, deletion_warning_sent_at, final_warning_sent_at
  from public.users
 where read_only_since is not null
 order by read_only_since asc;

-- Seats used vs cap on a team:
select t.id, t.name, t.plan,
       (select count(*) from public.team_members where team_id = t.id) as seats_used,
       public.seats_available(t.id) as seats_left
  from public.teams t;
```

---

## Lifecycle cron — `klo-lifecycle-cron`

Daily job that flips trials/teams to read-only at expiry, sends 75/85-day
warning emails, and hard-deletes at 90 days. Deployed but you schedule it.

### One-time setup

```powershell
supabase functions deploy klo-lifecycle-cron --no-verify-jwt

# Generate a 32-char hex secret and save it to your password manager.
# In PowerShell:
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToHexString($bytes).ToLower()
# Or in Bash / WSL:
#   openssl rand -hex 32

supabase secrets set CRON_SECRET=<that hex string>
supabase secrets set FROM_EMAIL=noreply@klosure.ai
# APP_URL and RESEND_API_KEY should already be set from earlier phases.
```

### Schedule the cron job

Supabase Dashboard → Database → Cron Jobs → New job:

- **Name:** `klosure-lifecycle-daily`
- **Schedule:** `30 20 * * *`  (20:30 UTC = 02:00 IST)
- **Type:** HTTP request
- **URL:** `https://azpdsgnvqkrfdvqxacqw.supabase.co/functions/v1/klo-lifecycle-cron`
- **Method:** POST
- **Headers:** `x-cron-secret: <the value you generated>`

### Manual invocation (dry run / debugging)

```powershell
curl -X POST `
  -H "x-cron-secret: <secret>" `
  https://azpdsgnvqkrfdvqxacqw.supabase.co/functions/v1/klo-lifecycle-cron
```

Healthy response on a fresh DB:

```json
{ "ok": true, "trials_expired": 0, "teams_expired": 0, "warning_75": 0, "warning_85": 0, "purged": 0, "errors": [] }
```

### Tests for confidence

Set up disposable test users (e.g. `+test1@gmail.com`, `+test2@gmail.com`)
and verify the cron handles each transition. Hard-delete each test user when
done so the prod data set stays clean.

```sql
-- Trial-expiry transition (user → read_only):
update public.users set trial_started_at = now() - interval '15 days',
                        trial_ends_at = now() - interval '1 day'
 where email = 'rajeshwar63+test1@gmail.com';

-- 75-day warning (15 days until deletion):
update public.users set read_only_since = now() - interval '76 days'
 where email = 'rajeshwar63+test2@gmail.com';

-- 85-day final warning (5 days until deletion):
update public.users set read_only_since = now() - interval '86 days',
                        deletion_warning_sent_at = now() - interval '10 days'
 where email = 'rajeshwar63+test3@gmail.com';

-- 90-day hard delete (cascades through auth.users):
update public.users set read_only_since = now() - interval '91 days'
 where email = 'rajeshwar63+test4@gmail.com';
```

Trigger the cron manually after each, then verify:

- `read_only_since` is set after the first.
- `deletion_warning_sent_at` is set after the second; warning email arrives.
- `final_warning_sent_at` is set after the third; final email arrives.
- `select * from public.users where email = 'rajeshwar63+test4@gmail.com'`
  returns 0 rows after the fourth — and `auth.users` is also empty for that
  email. All deals/messages/team_members for that user are gone too.

---

## Razorpay webhook — `razorpay-webhook` (Phase 12.3 Chunk 3)

The Razorpay edge functions split work into two halves:

- `razorpay-create-subscription` — called from the Billing page when a user
  clicks Upgrade. Creates the subscription on Razorpay's side, opens the
  Checkout JS modal, and stores `razorpay_subscription_id` on `users` or
  `teams`. **Does not** flip the account to paid.
- `razorpay-webhook` — receives subscription lifecycle events from Razorpay
  and is the only thing that mutates `plan` / `current_period_end` /
  `read_only_since` for paid users.

Treat the webhook as the source of truth for paid state. The frontend polls
`get_my_account_status` after the modal closes and only unblocks the user
once the webhook has updated their row.

### One-time setup

```powershell
# 1. Deploy the function (no-verify-jwt because Razorpay doesn't send a
#    Supabase JWT).
supabase functions deploy razorpay-webhook --no-verify-jwt

# 2. Generate a webhook secret (any random string — used to HMAC-verify
#    incoming events). 32 hex chars is plenty.
#    PowerShell:
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToHexString($bytes).ToLower()
#    Bash / WSL:
#      openssl rand -hex 32

# 3. Save it on Supabase AND in Razorpay (next step). They must match.
supabase secrets set RAZORPAY_WEBHOOK_SECRET=<that hex string>
```

### Register the webhook in Razorpay dashboard

Razorpay Dashboard → **Settings → Webhooks → Add new webhook**:

- **URL:** `https://azpdsgnvqkrfdvqxacqw.supabase.co/functions/v1/razorpay-webhook`
- **Secret:** the same hex string you stored as `RAZORPAY_WEBHOOK_SECRET`.
- **Active events** (tick at minimum):
  - `subscription.activated`
  - `subscription.charged`
  - `subscription.pending`
  - `subscription.halted`
  - `subscription.cancelled`
  - `subscription.completed`
- **Alert email:** rajeshwar63@gmail.com (Razorpay alerts on >24h failure
  streaks; the inbox is the canary).

Do this **twice** — once on the Razorpay test account (with the test secret)
and again on the live account (with a separate live secret) at Chunk 5
cutover. The function reads whichever secret matches the incoming
signature, so you can't run both at once on the same Supabase project
without splitting environments.

### Verifying end-to-end

1. From a test user, click Upgrade on `/billing` and complete the test-card
   flow in the Razorpay modal (use `4111 1111 1111 1111`, any future date,
   any CVV; OTP `1234` on test).
2. Watch the function logs:

   ```powershell
   supabase functions logs razorpay-webhook --follow
   ```

   You should see `subscription.activated` arrive within a few seconds of the
   modal closing, followed by `subscription.charged` once Razorpay charges
   the first cycle (typically immediate on test).
3. Confirm the row state:

   ```sql
   select email, plan, current_period_end, read_only_since,
          razorpay_subscription_id
     from public.users
    where email = 'rajeshwar63+test@gmail.com';

   -- And the audit log:
   select event_type, signature_verified, processed_at, processing_error
     from public.payment_events
    where subscription_id = '<sub_…>'
    order by created_at;
   ```

   `plan` should be the upgraded slug, `current_period_end` ~30 days out,
   `read_only_since` null, and every payment_events row should have
   `signature_verified=true` and a non-null `processed_at` with no
   `processing_error`.
4. Cancel from the Razorpay dashboard (Subscriptions → pick the sub →
   Cancel). `subscription.cancelled` should arrive and flip the user back
   to `read_only_since = now()`.

### Replaying / debugging events

Razorpay Dashboard → Webhooks → click the URL → **Recent Deliveries**.
Failed deliveries can be replayed individually. The function is
idempotent — replaying a successful event short-circuits on the
`payment_events.event_id` unique constraint and returns
`{"ok":true,"duplicate":true}`.

If a payload couldn't be processed, look at the row in `payment_events`:

```sql
select event_id, event_type, processing_error, payload
  from public.payment_events
 where processing_error is not null
 order by created_at desc
 limit 20;
```

Common `processing_error` values:

- `subscription_not_found` — Razorpay event for a sub we don't have on our
  side (e.g. a manual sub created in the dashboard, or a sub created
  before its `razorpay_subscription_id` was persisted to our DB).
- `unresolved_plan:<plan_id>` — the active/pending event references a
  plan_id we don't recognise. Add it to `PLAN_ID_TO_SLUG` in
  `supabase/functions/razorpay-webhook/index.ts` (and to
  `src/lib/razorpay-plans.ts`), redeploy, replay the event.
- `unknown_status:<value>` — Razorpay sent a status we don't map (e.g.
  `paused`/`resumed`). Decide on the policy and extend `mapStatus`.

---

## Things to be careful about

1. `purge_expired_users` deletes from `auth.users`. The cascade chain
   (`public.users` → `deals` → `messages` → `klo_state_history` → ...)
   means **everything** for that user disappears. There is no soft-delete
   and no recovery.
2. The 90-day clock starts at `read_only_since`, not at trial expiry. If a
   user gets a manual extension after going read-only, reset
   `read_only_since` to `null` via `admin_grant_plan` — don't just bump
   `current_period_end`.
3. Don't grant a team plan to a user whose `team_id` is null. The helper
   raises a clear error in that case; don't paper over it by inserting into
   `teams` directly.
4. Warning emails frame the action honestly: *upgrade to keep your account*.
   Don't change the copy to imply that clicking a link or logging in
   preserves data — only payment does, and saying otherwise would be
   misleading.
5. The Razorpay webhook is the only writer of paid state. Don't bypass it
   by editing `users.plan` directly during a paid flow — the next webhook
   event will overwrite your manual edit anyway. Use `admin_grant_plan` /
   `plan_override` for manual interventions, both of which the webhook
   respects.
6. Keep `PLAN_ID_TO_SLUG` in `supabase/functions/razorpay-webhook/index.ts`
   in sync with `src/lib/razorpay-plans.ts`. They're separate copies because
   the edge function can't import frontend modules; whenever you add a new
   plan or rotate a plan ID, edit both.
