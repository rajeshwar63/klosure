# Manual onboarding — Phase 12.1 / 12.2

Until Razorpay ships in Phase 12.3, plans are granted by hand. This is the
cheat sheet. Run everything from the Supabase SQL Editor against project
`azpdsgnvqkrfdvqxacqw` (klosure).

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
