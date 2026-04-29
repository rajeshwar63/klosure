-- =============================================================================
-- Klosure.ai — Phase 12.3 Schema Delta (Razorpay)
-- =============================================================================
-- Adds Razorpay-specific columns to users + teams plus a payment_events table
-- for webhook idempotency. Apply AFTER phase12_licensing.sql and
-- phase12_2_lifecycle.sql. Idempotent.
-- =============================================================================

-- ----- users: razorpay columns ---------------------------------------------
alter table public.users
  add column if not exists razorpay_customer_id text;

alter table public.users
  add column if not exists razorpay_subscription_id text;

create index if not exists users_razorpay_subscription_idx
  on public.users(razorpay_subscription_id)
  where razorpay_subscription_id is not null;

-- ----- teams: razorpay columns ---------------------------------------------
alter table public.teams
  add column if not exists razorpay_customer_id text;

alter table public.teams
  add column if not exists razorpay_subscription_id text;

create index if not exists teams_razorpay_subscription_idx
  on public.teams(razorpay_subscription_id)
  where razorpay_subscription_id is not null;

-- ----- payment_events: webhook idempotency log -----------------------------
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  signature text,
  signature_verified boolean default false,
  processed_at timestamptz,
  processing_error text,
  user_id uuid references public.users(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  subscription_id text,
  created_at timestamptz default now()
);

-- Each (provider, event_id) combo is unique. Razorpay can replay events; we
-- short-circuit on duplicates via this constraint.
create unique index if not exists payment_events_provider_event_unique
  on public.payment_events(provider, event_id);

create index if not exists payment_events_subscription_idx
  on public.payment_events(subscription_id)
  where subscription_id is not null;

-- payment_events is internal — no user-facing reads. RLS denies all
-- authenticated access; only the service role (Edge Functions) reads/writes.
alter table public.payment_events enable row level security;

drop policy if exists "payment_events deny all" on public.payment_events;
create policy "payment_events deny all" on public.payment_events
  for all using (false) with check (false);

-- ----- find_subscription_owner helper --------------------------------------
-- Used by webhook handler to map a Razorpay subscription_id back to a user
-- or team. Returns the user_id and team_id (whichever is set).
create or replace function public.find_subscription_owner(p_subscription_id text)
returns table(user_id uuid, team_id uuid, is_team boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid;
  v_team_id uuid;
begin
  -- Check users first; a subscription belongs to either a user OR a team,
  -- never both. plpgsql avoids the UNION ALL + LIMIT parser quirk that
  -- bites the language-sql variant in some Postgres builds.
  select u.id into v_user_id
    from public.users u
   where u.razorpay_subscription_id = p_subscription_id
   limit 1;

  if v_user_id is not null then
    user_id := v_user_id;
    team_id := null;
    is_team := false;
    return next;
    return;
  end if;

  select t.id into v_team_id
    from public.teams t
   where t.razorpay_subscription_id = p_subscription_id
   limit 1;

  if v_team_id is not null then
    user_id := null;
    team_id := v_team_id;
    is_team := true;
    return next;
    return;
  end if;

  return;  -- no owner found; caller checks NOT FOUND
end;
$$;

-- ----- update_subscription_state helper ------------------------------------
-- Idempotent state setter called by webhook handler. Updates plan, period,
-- read_only_since on either users or teams based on the subscription type.
create or replace function public.update_subscription_state(
  p_subscription_id text,
  p_plan_slug text,
  p_status text,            -- 'active', 'pending', 'halted', 'cancelled', 'completed'
  p_period_end timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner record;
  v_read_only_since timestamptz;
begin
  select * into v_owner from public.find_subscription_owner(p_subscription_id) limit 1;
  -- Use NOT FOUND, not IS NULL — when SELECT INTO finds no rows, the record's
  -- fields are set to NULL but the record variable itself is never NULL, so
  -- "v_owner is null" never fires. NOT FOUND is the canonical no-rows test.
  if not found then
    return jsonb_build_object('ok', false, 'error', 'subscription_not_found');
  end if;

  -- Compute read_only_since based on status.
  -- 'active' / 'pending' (in grace) → clear read-only
  -- 'halted' / 'cancelled' / 'completed' → set read-only
  v_read_only_since := case p_status
    when 'active' then null
    when 'pending' then null    -- grace; not yet read-only
    when 'halted' then now()
    when 'cancelled' then now()
    when 'completed' then now()
    else null
  end;

  if v_owner.is_team then
    update public.teams
       set plan = case when p_status in ('active', 'pending') then p_plan_slug else plan end,
           current_period_end = coalesce(p_period_end, current_period_end),
           read_only_since = v_read_only_since
     where id = v_owner.team_id;
  else
    update public.users
       set plan = case when p_status in ('active', 'pending') then p_plan_slug else plan end,
           current_period_end = coalesce(p_period_end, current_period_end),
           read_only_since = v_read_only_since
     where id = v_owner.user_id;
  end if;

  return jsonb_build_object('ok', true, 'subscription_id', p_subscription_id, 'status', p_status);
end;
$$;
-- Grant intentionally NOT made — only callable by service role from Edge Functions.
