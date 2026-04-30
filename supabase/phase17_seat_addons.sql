-- =============================================================================
-- Klosure.ai — Phase 17 Schema Delta (Per-seat add-ons)
-- =============================================================================
-- Lets a team buy *extra* seats on top of the base tier without jumping to the
-- next plan. The add-on is billed via a separate Razorpay subscription that
-- runs alongside the base subscription; this migration wires the database
-- side: extra_seats column, updated seat-cap math, addon subscription pointer,
-- and an idempotent RPC for the webhook to keep extra_seats in sync.
--
-- Apply AFTER phase12_3_razorpay.sql. Idempotent — safe to re-run.
-- =============================================================================

-- ----- teams: add-on columns -----------------------------------------------
alter table public.teams
  add column if not exists extra_seats int not null default 0
  check (extra_seats >= 0);

-- Hard upper bound on add-on quantity per tier. Mirrors src/lib/plans.ts and
-- exists here so the DB enforces the cap independent of the UI.
-- Starter (5) → +9 max (cap 14, force upgrade to Growth at 15).
-- Growth (15) → +14 max (cap 29, force upgrade to Scale at 30).
-- Scale (30) → +69 max (cap 99, force upgrade to Enterprise at 100).
alter table public.teams
  drop constraint if exists teams_extra_seats_within_tier;
alter table public.teams
  add constraint teams_extra_seats_within_tier check (
    case coalesce(plan_override->>'plan', plan)
      when 'team_starter' then extra_seats <= 9
      when 'team_growth'  then extra_seats <= 14
      when 'team_scale'   then extra_seats <= 69
      when 'enterprise'   then true       -- enterprise is custom; no cap here
      else extra_seats = 0                -- non-team tiers can't have extras
    end
  );

alter table public.teams
  add column if not exists razorpay_addon_subscription_id text;

create index if not exists teams_razorpay_addon_subscription_idx
  on public.teams(razorpay_addon_subscription_id)
  where razorpay_addon_subscription_id is not null;

-- ----- get_account_status(uid) — fold extra_seats into the seat cap --------
-- The previous version returned a fixed cap per plan slug. With add-ons the
-- effective cap is base_cap + team.extra_seats. base_seat_cap is also exposed
-- separately so the UI can show "5 base + 3 extras = 8 seats".
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
  v_base_seat_cap int;
  v_extra_seats int := 0;
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
      v_extra_seats := coalesce(v_team.extra_seats, 0);
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
      v_read_only_since := least(v_team.read_only_since, v_user.read_only_since);
      v_is_team_plan := v_plan in ('team_starter', 'team_growth', 'team_scale', 'enterprise');
    end if;
  end if;

  if v_plan is null or v_plan = 'trial' then
    if v_plan is null then
      v_plan := coalesce(v_user.plan, 'trial');
    end if;
    if v_period_end is null then
      v_period_end := v_user.current_period_end;
    end if;
    if v_read_only_since is null then
      v_read_only_since := v_user.read_only_since;
    end if;
    v_trial_ends := v_user.trial_ends_at;
  end if;

  -- 4. Determine base seat cap from the tier. Effective cap also includes
  --    purchased add-on seats from the team row.
  v_base_seat_cap := case v_plan
    when 'trial' then 1
    when 'pro' then 1
    when 'team_starter' then 5
    when 'team_growth' then 15
    when 'team_scale' then 30
    when 'enterprise' then 100
    else 1
  end;
  v_seat_cap := v_base_seat_cap + v_extra_seats;

  -- 5. Seats used (for team plans only — solo plans by definition have 1).
  if v_team_id is not null then
    select count(*) into v_seats_used
      from public.team_members where team_id = v_team_id;
  else
    v_seats_used := 1;
  end if;

  -- 6. Compute status.
  if v_read_only_since is not null then
    if v_user.deletion_warning_sent_at is not null then
      v_status := 'pending_deletion';
    else
      v_status := 'trial_expired_readonly';
    end if;
  elsif v_period_end is not null and v_period_end > now() then
    v_status := 'paid_active';
  elsif v_period_end is not null and v_period_end <= now() then
    v_status := 'paid_grace';
  elsif v_trial_ends is not null and v_trial_ends > now() then
    v_status := 'trial_active';
  elsif v_trial_ends is not null and v_trial_ends <= now() then
    v_status := 'trial_expired_readonly';
  else
    v_status := 'trial_active';
  end if;

  return jsonb_build_object(
    'plan', v_plan,
    'status', v_status,
    'seat_cap', v_seat_cap,
    'base_seat_cap', v_base_seat_cap,
    'extra_seats', v_extra_seats,
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

-- ----- seats_available(team_id) — include extra_seats ---------------------
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
  v_cap := v_cap + coalesce(v_team.extra_seats, 0);

  select count(*) into v_used
    from public.team_members where team_id = p_team_id;

  return greatest(v_cap - v_used, 0);
end;
$$;
grant execute on function public.seats_available(uuid) to authenticated;

-- ----- update_addon_seats(team_id, extras, subscription_id) ----------------
-- Idempotent setter for add-on quantity. Called by the Razorpay webhook when
-- the add-on subscription's quantity changes (purchase, increase, decrease,
-- cancel). NOT granted to authenticated — service-role only.
create or replace function public.update_addon_seats(
  p_team_id uuid,
  p_extra_seats int,
  p_addon_subscription_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max_extras int;
begin
  if p_extra_seats < 0 then
    return jsonb_build_object('ok', false, 'error', 'negative_extras');
  end if;

  select coalesce(plan_override->>'plan', plan) into v_plan
    from public.teams where id = p_team_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'team_not_found');
  end if;

  v_max_extras := case v_plan
    when 'team_starter' then 9
    when 'team_growth'  then 14
    when 'team_scale'   then 69
    when 'enterprise'   then 9999
    else 0
  end;
  if p_extra_seats > v_max_extras then
    return jsonb_build_object(
      'ok', false,
      'error', 'exceeds_tier_cap',
      'plan', v_plan,
      'max_extras', v_max_extras
    );
  end if;

  update public.teams
     set extra_seats = p_extra_seats,
         razorpay_addon_subscription_id = coalesce(
           p_addon_subscription_id,
           razorpay_addon_subscription_id
         )
   where id = p_team_id;

  return jsonb_build_object(
    'ok', true,
    'team_id', p_team_id,
    'extra_seats', p_extra_seats
  );
end;
$$;

-- ----- find_addon_subscription_team(subscription_id) -----------------------
-- Webhook helper: maps a Razorpay subscription id to a team IF that id matches
-- the team's *add-on* subscription. The base-sub matching stays in
-- find_subscription_owner (unchanged from phase12_3) so that the existing
-- update_subscription_state path doesn't accidentally fire on add-on events.
create or replace function public.find_addon_subscription_team(p_subscription_id text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.teams
   where razorpay_addon_subscription_id = p_subscription_id
   limit 1;
$$;
