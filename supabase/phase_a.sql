-- =============================================================================
-- Klosure.ai — Phase A schema delta
-- =============================================================================
-- Apply AFTER all prior phase_*.sql files. Idempotent.
--
-- What Phase A adds:
--   - nylas_grants    : per-user mapping of Nylas grants (one user can have
--                       multiple grants — Gmail + Outlook for example)
--   - email_events    : audit log of email messages Nylas told us about
--   - meeting_events  : audit log of meeting events + transcript locations
--   - meeting_usage   : meeting-minute consumption per team for metering
--   - team_pool       : per-team monthly quotas + current consumption
--
--   - RLS for all five
--   - Helpers: get_team_pool(team_id), increment_meeting_usage(...),
--              reset_team_pools(), get_team_usage_by_rep(...),
--              ensure_team_for_user(user_id)
--   - pg_cron monthly reset job
-- =============================================================================

-- ----- messages.metadata (Phase A adds JSONB metadata for system messages) --
-- email/meeting system messages need a place to stash the source event id.
-- The messages table doesn't have a metadata column yet; add it idempotently.
alter table public.messages
  add column if not exists metadata jsonb default '{}'::jsonb;

-- Phase A introduces a new sender_type 'system' for email + meeting deltas.
-- The original CHECK constraint only allowed seller/buyer/klo. Drop and
-- recreate with the broader set.
alter table public.messages
  drop constraint if exists messages_sender_type_check;
alter table public.messages
  add constraint messages_sender_type_check
  check (sender_type in ('seller', 'buyer', 'klo', 'system'));

-- ----- nylas_grants ---------------------------------------------------------
-- One row per Nylas grant. A user can have N grants (Gmail account +
-- Outlook account etc.). Provider is denormalised from the grant for fast
-- filtering. We store sync_state so the watcher knows when a grant has gone
-- stale (Nylas sends grant.expired webhooks, but we also poll defensively).

create table if not exists public.nylas_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  nylas_grant_id text not null unique,        -- Nylas's grant ID (UUID-like)
  provider text not null check (provider in ('google', 'microsoft')),
  email_address text not null,                -- the connected mailbox
  scopes text[] not null default '{}',
  granted_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  sync_state text not null default 'active'
    check (sync_state in ('active', 'expired', 'revoked', 'error')),
  last_error text,
  -- Denormalised for cheap manager-dashboard joins:
  user_email text not null,                   -- the Klosure user's email at grant time
  created_at timestamptz not null default now()
);

create index if not exists nylas_grants_user_idx
  on public.nylas_grants(user_id);
create index if not exists nylas_grants_team_idx
  on public.nylas_grants(team_id, sync_state);
create index if not exists nylas_grants_email_idx
  on public.nylas_grants(email_address);  -- for inbound webhook routing

-- ----- email_events ---------------------------------------------------------
-- Every message.created/updated webhook lands here. We dedupe on
-- (nylas_grant_id, nylas_message_id). The deal_id and matched_stakeholder_id
-- are filled by the extraction pipeline — null means "not yet matched to a
-- deal" (most personal email).

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  nylas_grant_id text not null,
  nylas_message_id text not null,
  thread_id text,
  -- Sender / recipients normalised from Nylas envelope. We store as JSONB so
  -- queries like "any participant matches X" stay flexible.
  from_addr text,
  to_addrs jsonb default '[]'::jsonb,        -- [{name, email}]
  cc_addrs jsonb default '[]'::jsonb,
  subject text,
  snippet text,                               -- first ~200 chars from Nylas
  -- Routing:
  deal_id uuid references public.deals(id) on delete set null,
  matched_stakeholder text,                   -- normalised email that matched
  posted_to_chat_message_id uuid references public.messages(id) on delete set null,
  -- Lifecycle:
  received_at timestamptz not null,           -- timestamp from Nylas
  processed_at timestamptz,                   -- when extraction finished
  processing_error text,
  raw_event jsonb,                            -- the full Nylas payload (for debugging)
  created_at timestamptz not null default now(),
  unique (nylas_grant_id, nylas_message_id)
);

create index if not exists email_events_deal_idx
  on public.email_events(deal_id, received_at desc);
create index if not exists email_events_grant_idx
  on public.email_events(nylas_grant_id, received_at desc);
create index if not exists email_events_unprocessed_idx
  on public.email_events(processed_at) where processed_at is null;

-- ----- meeting_events -------------------------------------------------------
-- One row per calendar event Nylas tells us about. The notetaker_state column
-- tracks the bot lifecycle separately because a single event can have many
-- notetaker.media.updated webhooks before media is ready.

create table if not exists public.meeting_events (
  id uuid primary key default gen_random_uuid(),
  nylas_grant_id text not null,
  nylas_event_id text not null,
  nylas_notetaker_id text,                    -- set when bot is dispatched
  title text,
  participants jsonb default '[]'::jsonb,     -- [{name, email}]
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  meeting_url text,                           -- zoom/meet/teams URL
  meeting_provider text
    check (meeting_provider is null or meeting_provider in ('zoom', 'meet', 'teams', 'other')),
  -- Routing:
  deal_id uuid references public.deals(id) on delete set null,
  matched_stakeholder text,
  -- Notetaker lifecycle:
  notetaker_state text default 'not_dispatched'
    check (notetaker_state in (
      'not_dispatched',     -- we decided not to send a bot
      'scheduled',          -- bot dispatched, will join at start
      'joined',             -- bot is in the call
      'recording',
      'media_processing',   -- call ended, transcript pending
      'ready',              -- transcript available
      'failed',
      'skipped_quota'       -- pool throttle blocked dispatch
    )),
  transcript_url text,                        -- Nylas-hosted, time-limited
  transcript_text text,                       -- we copy it locally on first read
  duration_minutes integer,                   -- billed against pool
  posted_to_chat_message_id uuid references public.messages(id) on delete set null,
  -- Lifecycle:
  processed_at timestamptz,
  processing_error text,
  raw_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nylas_grant_id, nylas_event_id)
);

create index if not exists meeting_events_deal_idx
  on public.meeting_events(deal_id, starts_at desc);
create index if not exists meeting_events_grant_idx
  on public.meeting_events(nylas_grant_id, starts_at desc);
create index if not exists meeting_events_state_idx
  on public.meeting_events(notetaker_state, ends_at)
  where notetaker_state in ('media_processing', 'recording', 'joined');

-- ----- meeting_usage --------------------------------------------------------
-- Append-only ledger. Each completed meeting writes one row. team_pool is the
-- aggregate; this is the breakdown for the manager's per-rep view.

create table if not exists public.meeting_usage (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  meeting_event_id uuid references public.meeting_events(id) on delete set null,
  duration_minutes integer not null check (duration_minutes >= 0),
  -- Denormalised for cheap month-bucketing without a join. Cast through UTC
  -- to keep the generated expression IMMUTABLE — `to_char(timestamptz, …)`
  -- alone is STABLE (depends on session TZ) and Postgres rejects it here.
  consumed_at timestamptz not null default now(),
  consumed_year_month text not null
    generated always as (to_char((consumed_at at time zone 'UTC'), 'YYYY-MM')) stored
);

create index if not exists meeting_usage_team_month_idx
  on public.meeting_usage(team_id, consumed_year_month);
create index if not exists meeting_usage_user_month_idx
  on public.meeting_usage(user_id, consumed_year_month);

-- ----- team_pool ------------------------------------------------------------
-- One row per team. Quotas reset on the 1st of each month via a cron we add
-- in sprint 07. This table is the *source of truth* for "is the team at
-- quota?" — meeting_usage is the supporting ledger.

create table if not exists public.team_pool (
  team_id uuid primary key references public.teams(id) on delete cascade,
  -- Per-seat quotas (multiplied by seat count to get team total):
  meeting_minutes_per_seat integer not null default 900,   -- 15h/seat
  voice_minutes_per_seat integer not null default 100,     -- 100min/seat (Phase F)
  chat_messages_per_seat integer not null default 1500,    -- 1500/seat
  -- Current month consumption (refreshed by triggers on the ledgers):
  current_meeting_minutes integer not null default 0,
  current_voice_minutes integer not null default 0,
  current_chat_messages integer not null default 0,
  -- Notification gates:
  notified_80_at timestamptz,
  notified_100_at timestamptz,
  -- Reset cycle:
  current_period_start date not null default date_trunc('month', now())::date,
  current_period_end date not null default (date_trunc('month', now()) + interval '1 month - 1 day')::date,
  updated_at timestamptz not null default now()
);

-- Auto-create team_pool row whenever a team is created.
create or replace function public.create_team_pool()
returns trigger
language plpgsql
as $$
begin
  insert into public.team_pool (team_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists teams_create_pool_trg on public.teams;
create trigger teams_create_pool_trg
  after insert on public.teams
  for each row execute function public.create_team_pool();

-- Backfill team_pool rows for existing teams (idempotent).
insert into public.team_pool (team_id)
  select id from public.teams
  on conflict do nothing;

-- ----- Helper: get effective team pool with seat-count math -----------------
-- Returns the pool row joined with the seat count and computed totals. Used
-- by the manager dashboard and the throttle check in sprint 07.

create or replace function public.get_team_pool(p_team_id uuid)
returns table (
  team_id uuid,
  seat_count integer,
  meeting_minutes_total integer,
  meeting_minutes_used integer,
  meeting_minutes_pct numeric,
  voice_minutes_total integer,
  voice_minutes_used integer,
  chat_messages_total integer,
  chat_messages_used integer,
  notified_80_at timestamptz,
  notified_100_at timestamptz,
  current_period_end date
)
language sql
stable
as $$
  with pool as (
    select * from public.team_pool where team_id = p_team_id
  ),
  seats as (
    select count(*)::int as seat_count
      from public.team_members
     where team_id = p_team_id
  )
  select
    pool.team_id,
    seats.seat_count,
    pool.meeting_minutes_per_seat * seats.seat_count as meeting_minutes_total,
    pool.current_meeting_minutes,
    case when seats.seat_count = 0 then 0
         else round(100.0 * pool.current_meeting_minutes /
                    (pool.meeting_minutes_per_seat * seats.seat_count), 1)
    end as meeting_minutes_pct,
    pool.voice_minutes_per_seat * seats.seat_count,
    pool.current_voice_minutes,
    pool.chat_messages_per_seat * seats.seat_count,
    pool.current_chat_messages,
    pool.notified_80_at,
    pool.notified_100_at,
    pool.current_period_end
  from pool, seats;
$$;

-- ----- Helper: increment meeting usage atomically ---------------------------
-- Called by sprint 06 when a meeting completes. Updates both the ledger and
-- the team_pool aggregate in one transaction. Returns the new pct so the
-- caller can decide whether to fire 80% / 100% notifications.

create or replace function public.increment_meeting_usage(
  p_team_id uuid,
  p_user_id uuid,
  p_meeting_event_id uuid,
  p_duration_minutes integer
)
returns table (
  new_used integer,
  new_total integer,
  new_pct numeric,
  crossed_80 boolean,
  crossed_100 boolean
)
language plpgsql
as $$
declare
  v_seats integer;
  v_per_seat integer;
  v_total integer;
  v_used_before integer;
  v_used_after integer;
  v_pct_before numeric;
  v_pct_after numeric;
begin
  -- Insert ledger row.
  insert into public.meeting_usage (team_id, user_id, meeting_event_id, duration_minutes)
    values (p_team_id, p_user_id, p_meeting_event_id, p_duration_minutes);

  -- Lock the pool row, compute new totals.
  select meeting_minutes_per_seat, current_meeting_minutes
    into v_per_seat, v_used_before
    from public.team_pool
   where team_id = p_team_id
     for update;

  select count(*)::int into v_seats
    from public.team_members
   where team_id = p_team_id;

  v_total := v_per_seat * greatest(v_seats, 1);
  v_used_after := v_used_before + p_duration_minutes;
  v_pct_before := case when v_total = 0 then 0 else 100.0 * v_used_before / v_total end;
  v_pct_after  := case when v_total = 0 then 0 else 100.0 * v_used_after  / v_total end;

  update public.team_pool
     set current_meeting_minutes = v_used_after,
         updated_at = now()
   where team_id = p_team_id;

  return query select
    v_used_after,
    v_total,
    round(v_pct_after, 1),
    (v_pct_before < 80 and v_pct_after >= 80),
    (v_pct_before < 100 and v_pct_after >= 100);
end;
$$;

-- ----- Helper: reset all team pools (called by pg_cron monthly) -------------

create or replace function public.reset_team_pools()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.team_pool
     set current_meeting_minutes = 0,
         current_voice_minutes = 0,
         current_chat_messages = 0,
         notified_80_at = null,
         notified_100_at = null,
         current_period_start = date_trunc('month', now())::date,
         current_period_end   = (date_trunc('month', now()) + interval '1 month - 1 day')::date,
         updated_at = now();
end;
$$;

-- Schedule the reset on the 1st of every month at 00:01 UTC. pg_cron must be
-- enabled in the dashboard (Database -> Extensions -> pg_cron) for this to
-- succeed; if the extension is missing, the schedule call is a no-op via
-- exception swallow so the migration still applies cleanly.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('reset-team-pools-monthly')
      from cron.job where jobname = 'reset-team-pools-monthly';
    perform cron.schedule(
      'reset-team-pools-monthly',
      '1 0 1 * *',
      'select public.reset_team_pools();'
    );
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;

-- ----- Helper: per-rep usage breakdown for manager dashboard ----------------

create or replace function public.get_team_usage_by_rep(
  p_team_id uuid,
  p_year_month text default to_char(now(), 'YYYY-MM')
)
returns table (
  user_id uuid,
  user_name text,
  user_email text,
  meeting_minutes integer,
  meeting_count integer
)
language sql
stable
as $$
  select
    u.id as user_id,
    u.name as user_name,
    u.email as user_email,
    coalesce(sum(mu.duration_minutes), 0)::int as meeting_minutes,
    count(mu.id)::int as meeting_count
  from public.team_members tm
  join public.users u on u.id = tm.user_id
  left join public.meeting_usage mu
    on mu.user_id = tm.user_id
   and mu.team_id = tm.team_id
   and mu.consumed_year_month = p_year_month
  where tm.team_id = p_team_id
  group by u.id, u.name, u.email
  order by meeting_minutes desc;
$$;

-- ----- Helper: ensure a team exists for a user (Phase A sprint 08) ----------
-- Every paid plan is now a team plan. On first paid checkout, auto-create a
-- single-seat team if the user doesn't own one yet. Idempotent.

create or replace function public.ensure_team_for_user(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_user_email text;
  v_user_name text;
begin
  -- If the user already owns a team, return it.
  select id into v_team_id from public.teams where owner_id = p_user_id limit 1;
  if v_team_id is not null then return v_team_id; end if;

  -- If the user is on someone else's team as a seller/rep, refuse — the team
  -- owner pays, not the rep.
  if exists (
    select 1 from public.team_members
     where user_id = p_user_id and role = 'seller'
  ) then
    raise exception 'user_is_member_of_other_team';
  end if;

  -- Otherwise create a single-seat team and add the user as manager.
  select email, name into v_user_email, v_user_name from public.users where id = p_user_id;

  insert into public.teams (name, owner_id, plan)
    values (coalesce(v_user_name, v_user_email, 'Klosure team'), p_user_id, 'klosure')
    returning id into v_team_id;

  insert into public.team_members (team_id, user_id, role, added_at)
    values (v_team_id, p_user_id, 'manager', now())
    on conflict do nothing;

  -- The team_pool row is auto-created by the trigger above.

  -- Update the user row with the team reference if the column exists.
  update public.users set team_id = v_team_id where id = p_user_id;

  return v_team_id;
end;
$$;

grant execute on function public.ensure_team_for_user(uuid) to authenticated;

-- ----- Plan check constraint widening (Phase A sprint 08) -------------------
-- Before Phase A: trial / pro / team_starter / team_growth / team_scale / enterprise.
-- After Phase A: trial / klosure / enterprise. Old slugs stay valid for one
-- migration cycle so existing rows don't break the constraint mid-deploy.
alter table public.users
  drop constraint if exists users_plan_check;
alter table public.users
  add constraint users_plan_check
  check (plan in (
    'trial', 'klosure', 'enterprise',
    'pro', 'team_starter', 'team_growth', 'team_scale'  -- legacy, will be migrated
  ));

alter table public.teams
  drop constraint if exists teams_plan_check;
alter table public.teams
  add constraint teams_plan_check
  check (plan in (
    'trial', 'klosure', 'enterprise',
    'pro', 'team_starter', 'team_growth', 'team_scale'  -- legacy, will be migrated
  ));

-- ----- One-shot pricing migration -------------------------------------------
-- Move any test users still on legacy plan slugs onto 'klosure'. Since we have
-- zero paying customers, this is internal-only data. Wrapped in DO block so
-- repeated runs are no-ops.
do $$
begin
  update public.users  set plan = 'klosure' where plan in ('pro');
  update public.teams  set plan = 'klosure' where plan in ('team_starter', 'team_growth', 'team_scale');
exception when others then
  raise notice 'plan migration skipped: %', sqlerrm;
end $$;

-- ----- RLS ------------------------------------------------------------------

alter table public.nylas_grants enable row level security;
alter table public.email_events enable row level security;
alter table public.meeting_events enable row level security;
alter table public.meeting_usage enable row level security;
alter table public.team_pool enable row level security;

-- nylas_grants: user sees own; team manager sees team members'.
drop policy if exists "nylas_grants self all" on public.nylas_grants;
create policy "nylas_grants self all" on public.nylas_grants
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "nylas_grants manager read" on public.nylas_grants;
create policy "nylas_grants manager read" on public.nylas_grants
  for select using (public.manages_seller(user_id));

-- email_events: scoped to the grant's owner.
drop policy if exists "email_events grant owner read" on public.email_events;
create policy "email_events grant owner read" on public.email_events
  for select using (
    exists (
      select 1 from public.nylas_grants g
       where g.nylas_grant_id = email_events.nylas_grant_id
         and (g.user_id = auth.uid() or public.manages_seller(g.user_id))
    )
  );
-- INSERT/UPDATE: only service role (the webhook handler).

-- meeting_events: same scoping as email_events.
drop policy if exists "meeting_events grant owner read" on public.meeting_events;
create policy "meeting_events grant owner read" on public.meeting_events
  for select using (
    exists (
      select 1 from public.nylas_grants g
       where g.nylas_grant_id = meeting_events.nylas_grant_id
         and (g.user_id = auth.uid() or public.manages_seller(g.user_id))
    )
  );

-- meeting_usage: user sees own; manager sees team's.
drop policy if exists "meeting_usage self read" on public.meeting_usage;
create policy "meeting_usage self read" on public.meeting_usage
  for select using (user_id = auth.uid() or public.manages_seller(user_id));

-- team_pool: every team member can read; service role writes.
drop policy if exists "team_pool member read" on public.team_pool;
create policy "team_pool member read" on public.team_pool
  for select using (
    exists (
      select 1 from public.team_members tm
       where tm.team_id = team_pool.team_id
         and tm.user_id = auth.uid()
    )
  );
