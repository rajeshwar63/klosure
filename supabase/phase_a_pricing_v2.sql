-- =============================================================================
-- Phase A sprint 09 — Coach / Closer / Command pricing rollout
-- =============================================================================
-- 1. Constraint widening: add 'coach', 'closer', 'command' as allowed plan
--    values on users + teams.
-- 2. Data migration: existing 'klosure' rows → 'closer' (Closer is the renamed
--    klosure tier, same price, now the upper of two paid tiers).
-- 3. Add teams.seat_cap (set from Razorpay subscription quantity at create +
--    update events). Default 1.
-- 4. Add teams.pending_seat_cap (for downsizes scheduled at next cycle).
-- 5. Rewrite get_account_status to recognise the new plan slugs and to read
--    seat_cap from the teams column.
-- 6. New table intl_billing_leads — captures USD/AED concierge form
--    submissions while Razorpay international processing pends activation.
-- =============================================================================

-- ----- 1. Constraints -------------------------------------------------------
alter table public.users  drop constraint if exists users_plan_check;
alter table public.teams  drop constraint if exists teams_plan_check;

-- ----- 2. Data migration ----------------------------------------------------
-- Existing 'klosure' rows become 'closer' (renamed). 'enterprise' remains
-- legal under the old name AND the new 'command' slug — we don't auto-rename
-- enterprise contracts to avoid surprising in-flight admin conversations.
do $$
begin
  update public.users set plan = 'closer'  where plan = 'klosure';
  update public.teams set plan = 'closer'  where plan = 'klosure';
exception when others then
  raise notice 'plan rename skipped: %', sqlerrm;
end $$;

-- New defaults: solo accounts start on 'trial', teams start on 'coach' so
-- self-serve checkout has a sensible default tier.
alter table public.users alter column plan set default 'trial';
alter table public.teams alter column plan set default 'coach';

-- Re-add constraints with the union of legacy + new slugs. Legacy slugs stay
-- valid as a backstop; once verified zero rows reference them, narrow further.
alter table public.users
  add constraint users_plan_check
  check (plan in (
    -- New canonical:
    'trial', 'coach', 'closer', 'command',
    -- Legacy (kept until verified empty):
    'klosure', 'enterprise',
    'free', 'pro', 'team', 'team_starter', 'team_growth', 'team_scale'
  ));

alter table public.teams
  add constraint teams_plan_check
  check (plan in (
    'trial', 'coach', 'closer', 'command',
    'klosure', 'enterprise',
    'free', 'pro', 'team', 'team_starter', 'team_growth', 'team_scale'
  ));

-- ----- 3 & 4. Seat columns on teams -----------------------------------------
-- seat_cap: authoritative count of paid seats, mirrored from Razorpay
-- subscription.quantity by the webhook. Default 1 covers solo / pre-checkout
-- teams.
alter table public.teams
  add column if not exists seat_cap int not null default 1;

-- pending_seat_cap: when an admin schedules a downsize (industry-standard
-- next-cycle effect, no mid-cycle refund), the new lower count goes here. The
-- webhook applies it to seat_cap when subscription.charged fires for the new
-- cycle. NULL when no downsize is scheduled.
alter table public.teams
  add column if not exists pending_seat_cap int;

alter table public.teams
  add constraint teams_seat_cap_min check (seat_cap >= 1);
alter table public.teams
  add constraint teams_pending_seat_cap_min
  check (pending_seat_cap is null or pending_seat_cap >= 1);

-- ----- 5. get_account_status — recognise new plans + use teams.seat_cap ----
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
          'is_team_plan', v_plan in ('coach', 'closer', 'command',
                                     'team_starter', 'team_growth', 'team_scale', 'enterprise'),
          'override_expires_at', v_override_expires
        );
      end if;
    end;
  end if;

  if v_user.team_id is not null then
    select * into v_team from public.teams where id = v_user.team_id;
    if found then
      v_team_id := v_team.id;
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
      v_is_team_plan := v_plan in ('coach', 'closer', 'command',
                                   'team_starter', 'team_growth', 'team_scale', 'enterprise');
    end if;
  end if;

  -- Solo path OR team-on-trial path. If the team is still on 'trial' but the
  -- user themselves has upgraded, the user row wins.
  if v_plan is null or v_plan = 'trial' then
    if (v_plan is null or v_plan = 'trial')
       and v_user.plan is not null
       and v_user.plan <> 'trial'
       and v_user.plan <> 'free' then
      v_plan := v_user.plan;
      v_is_team_plan := v_plan in ('coach', 'closer', 'command',
                                   'team_starter', 'team_growth', 'team_scale', 'enterprise');
    elsif v_plan is null then
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

  -- seat_cap: prefer the Razorpay-synced value on the teams row when we have
  -- a team plan. Fall back to per-plan defaults for legacy / solo paths.
  if v_team_id is not null and v_team.seat_cap is not null then
    v_seat_cap := v_team.seat_cap;
  else
    v_seat_cap := case v_plan
      when 'trial'        then 1
      when 'coach'        then 1
      when 'closer'       then 1
      when 'command'      then 1
      when 'pro'          then 1
      when 'team_starter' then 5
      when 'team_growth'  then 15
      when 'team_scale'   then 30
      when 'enterprise'   then 100
      else 1
    end;
  end if;

  if v_team_id is not null then
    select count(*) into v_seats_used
      from public.team_members where team_id = v_team_id;
  else
    v_seats_used := 1;
  end if;

  -- Status calculation. Paid plans anchor on the plan column even when
  -- period_end is briefly null (Razorpay can return that between authorise
  -- and first charge), so the trial countdown never re-appears once paid.
  if v_read_only_since is not null then
    if v_user.deletion_warning_sent_at is not null then
      v_status := 'pending_deletion';
    else
      v_status := 'trial_expired_readonly';
    end if;
  elsif v_plan in ('coach', 'closer', 'command',
                   'pro', 'team_starter', 'team_growth', 'team_scale', 'enterprise') then
    if v_period_end is null then
      v_status := 'paid_active';
    elsif v_period_end > now() then
      v_status := 'paid_active';
    else
      v_status := 'paid_grace';
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
    'seats_used', v_seats_used,
    'pending_seat_cap', v_team.pending_seat_cap,
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

-- ----- 6. intl_billing_leads ------------------------------------------------
-- Concierge form submissions from USD / AED visitors who can't auto-debit
-- yet. The intl-billing-lead edge function inserts here AND emails the
-- founder via Resend, so leads aren't lost if either path fails.
create table if not exists public.intl_billing_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  plan_slug text not null check (plan_slug in ('coach', 'closer', 'command')),
  currency text not null check (currency in ('USD', 'AED', 'INR')),
  seats int not null default 1 check (seats >= 1 and seats <= 500),
  notes text,
  user_id uuid references public.users(id) on delete set null,
  -- Ops fields — set as the founder works the lead.
  status text not null default 'new'
    check (status in ('new', 'contacted', 'invoiced', 'paid', 'declined', 'closed')),
  contacted_at timestamptz,
  invoiced_at timestamptz,
  paid_at timestamptz,
  internal_notes text
);

create index if not exists intl_billing_leads_status_idx on public.intl_billing_leads (status, created_at desc);
create index if not exists intl_billing_leads_email_idx on public.intl_billing_leads (email);

alter table public.intl_billing_leads enable row level security;

-- No public read policy — only the service role (used by the founder via
-- Supabase dashboard or admin tooling) can see leads. Inserts go through the
-- edge function with the service role.
drop policy if exists intl_leads_no_select on public.intl_billing_leads;
create policy intl_leads_no_select on public.intl_billing_leads
  for select using (false);

drop policy if exists intl_leads_no_insert on public.intl_billing_leads;
create policy intl_leads_no_insert on public.intl_billing_leads
  for insert with check (false);
