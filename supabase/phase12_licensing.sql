-- =============================================================================
-- Klosure.ai — Phase 12 Schema Delta (Licensing)
-- =============================================================================
-- Adds plan/trial/license tracking to users + teams. No Razorpay yet — payment
-- integration is Phase 12.3. This delta is the foundation: plan column, trial
-- timestamps, override field, helper functions, seat-cap trigger.
-- =============================================================================

-- ----- users: licensing columns --------------------------------------------
alter table public.users
  add column if not exists trial_started_at timestamptz default now();

-- trial_ends_at is a regular column (not generated) because timestamptz + interval
-- is STABLE in Postgres — generated-column expressions must be IMMUTABLE.
-- trial_started_at is fixed at signup so trial_ends_at never needs recomputing
-- after the row is created. Default + backfill below cover both new and old rows.
alter table public.users
  add column if not exists trial_ends_at timestamptz default (now() + interval '14 days');

update public.users
   set trial_ends_at = trial_started_at + interval '14 days'
 where trial_ends_at is null;

alter table public.users
  add column if not exists currency text default 'INR'
  check (currency in ('INR', 'AED'));

alter table public.users
  add column if not exists country_code text;
  -- ISO 3166-1 alpha-2; populated from IP at signup, user-overridable.

alter table public.users
  add column if not exists read_only_since timestamptz;
  -- null = not read-only. Set when trial expires or sub cancels.

alter table public.users
  add column if not exists deletion_warning_sent_at timestamptz;
alter table public.users
  add column if not exists final_warning_sent_at timestamptz;

-- Manual override — bypasses all trial/payment logic. Used for design partners,
-- internal accounts, problem cases. JSON for forward compat (we may add fields).
alter table public.users
  add column if not exists plan_override jsonb;
-- shape: {plan: 'team_scale', expires_at: '2027-01-01T00:00:00Z',
--         granted_by: 'rajeshwar', reason: 'design partner'}

-- Backfill trial_started_at for any existing users who signed up before this migration.
update public.users
   set trial_started_at = created_at
 where trial_started_at is null;

-- ----- teams: licensing columns --------------------------------------------
alter table public.teams
  add column if not exists plan text default 'trial'
  check (plan in ('trial', 'pro', 'team_starter', 'team_growth', 'team_scale', 'enterprise'));

alter table public.teams
  add column if not exists current_period_end timestamptz;

alter table public.teams
  add column if not exists currency text default 'INR'
  check (currency in ('INR', 'AED'));

alter table public.teams
  add column if not exists plan_override jsonb;

alter table public.teams
  add column if not exists read_only_since timestamptz;

-- Note: existing column `users.plan` from Phase 4 stays. We widen the check
-- constraint to include the new tier names.
alter table public.users
  drop constraint if exists users_plan_check;
alter table public.users
  add constraint users_plan_check
  check (plan in ('free', 'pro', 'team', 'trial', 'team_starter', 'team_growth', 'team_scale', 'enterprise'));

-- New users default to 'trial' plan instead of 'free'.
alter table public.users alter column plan set default 'trial';

-- ----- get_account_status(uid) ---------------------------------------------
-- Computed status per user. Single source of truth for "what can this user do
-- right now?" — gating across the app keys off this function.
create or replace function public.get_account_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_team public.teams%rowtype;
  v_plan text;
  v_seat_cap int;
  v_seats_used int;
  v_status text;
  v_period_end timestamptz;
  v_trial_ends timestamptz;
  v_read_only_since timestamptz;
  v_team_id uuid;
  v_is_team_plan boolean := false;
  v_override jsonb;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    return jsonb_build_object('error', 'user_not_found');
  end if;

  -- 1. Manual override always wins.
  v_override := coalesce(v_user.plan_override, '{}'::jsonb);
  if v_override ? 'plan' then
    declare
      v_override_expires timestamptz := (v_override->>'expires_at')::timestamptz;
    begin
      if v_override_expires is null or v_override_expires > now() then
        v_plan := v_override->>'plan';
        return jsonb_build_object(
          'plan', v_plan,
          'status', 'overridden',
          'currency', v_user.currency,
          'team_id', v_user.team_id,
          'is_team_plan', v_plan in ('team_starter', 'team_growth', 'team_scale', 'enterprise'),
          'override_expires_at', v_override_expires
        );
      end if;
    end;
  end if;

  -- 2. If user is on a team, the team's plan is the authority.
  if v_user.team_id is not null then
    select * into v_team from public.teams where id = v_user.team_id;
    if found then
      v_team_id := v_team.id;
      -- Team override?
      if v_team.plan_override ? 'plan' then
        declare
          v_team_override_expires timestamptz := (v_team.plan_override->>'expires_at')::timestamptz;
        begin
          if v_team_override_expires is null or v_team_override_expires > now() then
            v_plan := v_team.plan_override->>'plan';
            v_is_team_plan := true;
            return jsonb_build_object(
              'plan', v_plan,
              'status', 'overridden',
              'team_id', v_team_id,
              'is_team_plan', true,
              'currency', v_team.currency,
              'override_expires_at', v_team_override_expires
            );
          end if;
        end;
      end if;

      v_plan := v_team.plan;
      v_period_end := v_team.current_period_end;
      v_read_only_since := v_team.read_only_since;
      v_is_team_plan := v_plan in ('team_starter', 'team_growth', 'team_scale', 'enterprise');
    end if;
  end if;

  -- 3. Solo path — fall back to user fields.
  if v_plan is null then
    v_plan := coalesce(v_user.plan, 'trial');
    v_period_end := v_user.current_period_end;
    v_read_only_since := v_user.read_only_since;
    v_trial_ends := v_user.trial_ends_at;
  end if;

  -- 4. Determine seat cap.
  v_seat_cap := case v_plan
    when 'trial' then 1
    when 'pro' then 1
    when 'team_starter' then 5
    when 'team_growth' then 15
    when 'team_scale' then 30
    when 'enterprise' then 100
    else 1
  end;

  -- 5. Seats used (for team plans only — solo plans by definition have 1).
  if v_team_id is not null then
    select count(*) into v_seats_used
      from public.team_members where team_id = v_team_id;
  else
    v_seats_used := 1;
  end if;

  -- 6. Compute status.
  if v_read_only_since is not null then
    -- Read-only sub-states.
    if v_user.deletion_warning_sent_at is not null then
      v_status := 'pending_deletion';
    else
      v_status := 'trial_expired_readonly';
    end if;
  elsif v_period_end is not null and v_period_end > now() then
    v_status := 'paid_active';
  elsif v_period_end is not null and v_period_end <= now() then
    v_status := 'paid_grace';   -- charged failed; grace window before read-only
  elsif v_trial_ends is not null and v_trial_ends > now() then
    v_status := 'trial_active';
  elsif v_trial_ends is not null and v_trial_ends <= now() then
    v_status := 'trial_expired_readonly';
  else
    v_status := 'trial_active';   -- shouldn't happen; default safe
  end if;

  return jsonb_build_object(
    'plan', v_plan,
    'status', v_status,
    'seat_cap', v_seat_cap,
    'seats_used', v_seats_used,
    'currency', coalesce(v_team.currency, v_user.currency, 'INR'),
    'trial_started_at', v_user.trial_started_at,
    'trial_ends_at', v_trial_ends,
    'current_period_end', v_period_end,
    'read_only_since', v_read_only_since,
    'team_id', v_team_id,
    'is_team_plan', v_is_team_plan,
    'days_until_trial_end',
      case when v_trial_ends is null then null
           else extract(epoch from (v_trial_ends - now())) / 86400
      end
  );
end;
$$;

grant execute on function public.get_account_status(uuid) to authenticated;

-- Convenience: status for caller
create or replace function public.get_my_account_status()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select public.get_account_status(auth.uid());
$$;
grant execute on function public.get_my_account_status() to authenticated;

-- ----- can_write(user_id) — boolean for "user is in active state, can mutate" --
-- Edge Functions and triggers gate writes via this. Returns true for
-- trial_active, paid_active, paid_grace, overridden. False for read-only states.
create or replace function public.can_write(p_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_status jsonb;
  v_status_text text;
begin
  v_status := public.get_account_status(p_user_id);
  v_status_text := v_status->>'status';
  return v_status_text in ('trial_active', 'paid_active', 'paid_grace', 'overridden');
end;
$$;
grant execute on function public.can_write(uuid) to authenticated;

-- ----- seats_available(team_id) -------------------------------------------
create or replace function public.seats_available(p_team_id uuid)
returns int
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
  v_cap int;
  v_used int;
begin
  select * into v_team from public.teams where id = p_team_id;
  if not found then return 0; end if;

  v_cap := case coalesce(v_team.plan_override->>'plan', v_team.plan)
    when 'team_starter' then 5
    when 'team_growth' then 15
    when 'team_scale' then 30
    when 'enterprise' then 100
    else 1
  end;

  select count(*) into v_used
    from public.team_members where team_id = p_team_id;

  return greatest(v_cap - v_used, 0);
end;
$$;
grant execute on function public.seats_available(uuid) to authenticated;

-- ----- seat_cap enforcement trigger ----------------------------------------
-- Block team_invites AND team_members inserts when team is at capacity.
-- Defense in depth — UI shows the cap; this enforces it server-side.
create or replace function public.enforce_seat_cap()
returns trigger
language plpgsql
as $$
declare
  v_available int;
begin
  v_available := public.seats_available(new.team_id);
  if v_available <= 0 then
    raise exception 'seat_cap_reached'
      using errcode = 'P0001',
            hint = 'Upgrade to a higher tier to add more seats.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_seat_cap_invites on public.team_invites;
create trigger enforce_seat_cap_invites
  before insert on public.team_invites
  for each row execute function public.enforce_seat_cap();

drop trigger if exists enforce_seat_cap_members on public.team_members;
create trigger enforce_seat_cap_members
  before insert on public.team_members
  for each row execute function public.enforce_seat_cap();

-- ----- Read-only enforcement: block writes on deals/messages ---------------
-- RLS already restricts who can write; this trigger blocks based on status.
-- For simplicity and observability we use a trigger, not RLS — RLS errors are
-- opaque ("policy violation"); a trigger lets us raise a clear message.
create or replace function public.enforce_can_write()
returns trigger
language plpgsql
as $$
declare
  v_seller_id uuid;
begin
  -- For deals: seller_id is on the row directly.
  -- For messages/commitments/deal_context: look up the parent deal.
  if tg_table_name = 'deals' then
    v_seller_id := coalesce(new.seller_id, old.seller_id);
  else
    select d.seller_id into v_seller_id
      from public.deals d
     where d.id = coalesce(new.deal_id, old.deal_id);
  end if;

  -- If we can't find a seller (e.g. system-level inserts), allow.
  if v_seller_id is null then return new; end if;

  if not public.can_write(v_seller_id) then
    raise exception 'account_read_only'
      using errcode = 'P0002',
            hint = 'Your account is read-only. Upgrade to continue creating or editing deals.';
  end if;

  return new;
end;
$$;

-- Apply to writeable seller-owned tables.
drop trigger if exists deals_enforce_can_write on public.deals;
create trigger deals_enforce_can_write
  before insert or update on public.deals
  for each row execute function public.enforce_can_write();

drop trigger if exists messages_enforce_can_write on public.messages;
create trigger messages_enforce_can_write
  before insert on public.messages
  for each row
  when (new.sender_type = 'seller')   -- buyers always allowed; klo bypasses (service role)
  execute function public.enforce_can_write();

-- Note: deal_context, commitments etc. inherit through messages/deal_context
-- write blocking from Phase 4's archive-lock pattern. If those tables don't
-- have similar guards yet, add here. For Phase 12.1 scope, deals + messages
-- gate is sufficient — Klo coaching is the main cost vector and it's blocked
-- in the Edge Function itself (Step 4).

-- ----- Pricing-page anonymous geo lookup (placeholder) ---------------------
-- A function that maps country_code → currency. Used by signup + billing to
-- pick the default. Public — no auth required.
create or replace function public.currency_for_country(p_country_code text)
returns text
language sql
immutable
as $$
  select case
    when p_country_code is null then 'INR'
    when upper(p_country_code) = 'IN' then 'INR'
    when upper(p_country_code) in ('AE', 'SA', 'KW', 'QA', 'BH', 'OM') then 'AED'
    else 'INR'
  end;
$$;
grant execute on function public.currency_for_country(text) to anon, authenticated;

-- ----- Manual onboarding helpers ------------------------------------------
-- Admin-only RPCs. Use these from the Supabase SQL editor to grant a plan to
-- a user/team manually. Until Razorpay ships, this is how you "process payment."

create or replace function public.admin_grant_plan(
  p_user_email text,
  p_plan text,
  p_period_end timestamptz default (now() + interval '1 month')
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_team_id uuid;
begin
  -- This function is intentionally NOT granted to authenticated/anon. Only
  -- callable from the Supabase dashboard as the postgres role. Safe to leave
  -- as security definer because we never grant execute.
  select id, team_id into v_user_id, v_team_id
    from public.users where lower(email) = lower(p_user_email);
  if v_user_id is null then
    raise exception 'user not found: %', p_user_email;
  end if;

  if p_plan in ('team_starter', 'team_growth', 'team_scale', 'enterprise') then
    if v_team_id is null then
      raise exception 'user has no team — they must create a team first via /billing';
    end if;
    update public.teams
       set plan = p_plan,
           current_period_end = p_period_end,
           read_only_since = null
     where id = v_team_id;
  else
    update public.users
       set plan = p_plan,
           current_period_end = p_period_end,
           read_only_since = null
     where id = v_user_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'team_id', v_team_id,
    'plan', p_plan,
    'period_end', p_period_end
  );
end;
$$;
-- NOT granted to authenticated. Only callable from SQL editor.
