-- =============================================================================
-- Klosure.ai — Phase 16: Trial-ending email warning
-- =============================================================================
-- Adds the DB plumbing for the pre-expiry trial warning.
--
-- Sent ~3 days before trial_ends_at while the user is still on the trial
-- (no current_period_end, no plan_override, not yet read-only). One-shot:
-- once trial_ending_email_sent_at is stamped the user drops out of the
-- candidate set so a daily cron can never spam.
--
-- Apply AFTER phase14_email_infrastructure.sql. Idempotent.
-- =============================================================================

-- ----- users.trial_ending_email_sent_at ------------------------------------
alter table public.users
  add column if not exists trial_ending_email_sent_at timestamptz;

-- ----- users_needing_trial_warning(p_days_left) ----------------------------
-- Returns users whose trial ends within the next p_days_left days, who are
-- still on the trial (no paid period, no override active), are not already
-- read-only, and have never been warned.
create or replace function public.users_needing_trial_warning(p_days_left int)
returns table(user_id uuid, email text, name text, trial_ends_at timestamptz, days_left int)
language sql
security definer
stable
set search_path = public
as $$
  select
    u.id,
    u.email,
    u.name,
    u.trial_ends_at,
    greatest(0, ceil(extract(epoch from (u.trial_ends_at - now())) / 86400)::int) as days_left
    from public.users u
   where u.trial_ending_email_sent_at is null
     and u.read_only_since is null
     and u.trial_ends_at is not null
     and u.trial_ends_at > now()
     and u.trial_ends_at <= now() + (p_days_left || ' days')::interval
     and (u.current_period_end is null or u.current_period_end <= now())
     and (
       u.plan_override is null
       or coalesce((u.plan_override->>'expires_at')::timestamptz, 'infinity'::timestamptz) <= now()
     );
$$;
