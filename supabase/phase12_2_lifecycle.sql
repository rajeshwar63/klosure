-- =============================================================================
-- Klosure.ai — Phase 12.2 Lifecycle Functions
-- =============================================================================
-- Companion to phase12_licensing.sql. Adds the daily-cron transition functions:
--   1. mark_trials_expired        — flips lapsed trials to read-only
--   2. mark_teams_expired         — flips lapsed team subscriptions to read-only
--   3. users_needing_deletion_warning(p_days) — at 75 / 85 days read-only
--   4. purge_expired_users        — hard-deletes after 90 days read-only
--
-- The cron Edge Function (klo-lifecycle-cron) calls these in sequence once a
-- day. Each function is idempotent — running twice in a row is a no-op for
-- already-transitioned rows. Apply AFTER phase12_licensing.sql.
-- =============================================================================

-- ----- mark_trials_expired -------------------------------------------------
-- Flip users to read-only when:
--   * their trial has ended,
--   * they are not in a paid period,
--   * no active plan_override is in effect,
--   * read_only_since is not already set (idempotency).
create or replace function public.mark_trials_expired()
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.users u
     set read_only_since = coalesce(u.read_only_since, now())
   where u.read_only_since is null
     and u.trial_ends_at is not null
     and u.trial_ends_at <= now()
     and (u.current_period_end is null or u.current_period_end <= now())
     and (
       u.plan_override is null
       or coalesce((u.plan_override->>'expires_at')::timestamptz, 'infinity'::timestamptz) <= now()
     )
   returning u.id, u.email;
end;
$$;

-- ----- mark_teams_expired --------------------------------------------------
-- Flip teams to read-only when their paid period has lapsed and no active
-- plan_override is in effect.
create or replace function public.mark_teams_expired()
returns table(team_id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.teams t
     set read_only_since = coalesce(t.read_only_since, now())
   where t.read_only_since is null
     and t.current_period_end is not null
     and t.current_period_end <= now()
     and (
       t.plan_override is null
       or coalesce((t.plan_override->>'expires_at')::timestamptz, 'infinity'::timestamptz) <= now()
     )
   returning t.id, t.name;
end;
$$;

-- ----- users_needing_deletion_warning(p_days) ------------------------------
-- Returns users who are at p_days into read-only and haven't received the
-- corresponding warning yet. Used at 75 (15-day notice) and 85 (5-day final).
-- Idempotent: once deletion_warning_sent_at / final_warning_sent_at is set,
-- the user drops out of subsequent runs at the same window.
create or replace function public.users_needing_deletion_warning(p_days int)
returns table(user_id uuid, email text, name text, read_only_since timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select u.id, u.email, u.name, u.read_only_since
    from public.users u
   where u.read_only_since is not null
     and u.read_only_since <= now() - (p_days || ' days')::interval
     and (
       (p_days = 75 and u.deletion_warning_sent_at is null)
       or
       (p_days = 85 and u.deletion_warning_sent_at is not null
                    and u.final_warning_sent_at is null)
     );
$$;

-- ----- purge_expired_users -------------------------------------------------
-- Hard-delete users that have been read-only for 90+ days. Cascade through
-- auth.users → public.users → deals/messages/etc.
--
-- SAFETY: the WHERE clause is the ONLY gate between a user and permanent
-- destruction. read_only_since must be set AND at least 90 days in the past.
-- The cron should NEVER run before mark_trials_expired/mark_teams_expired —
-- those set read_only_since; the 90-day clock starts there.
create or replace function public.purge_expired_users()
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
begin
  -- Qualify the SELECT with a table alias — the OUT params (user_id, email)
  -- are in scope inside the plpgsql body, and an unqualified `email` in the
  -- SELECT is ambiguous between the column and the OUT parameter.
  for v_user in
    select u.id, u.email from public.users u
     where u.read_only_since is not null
       and u.read_only_since <= now() - interval '90 days'
  loop
    -- Delete from auth.users — cascades to public.users via the FK on
    -- public.users.id (references auth.users(id) on delete cascade), which
    -- in turn cascades to deals, messages, team_members, etc.
    delete from auth.users where id = v_user.id;
    user_id := v_user.id;
    email   := v_user.email;
    return next;
  end loop;
  return;
end;
$$;
