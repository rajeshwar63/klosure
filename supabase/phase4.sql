-- =============================================================================
-- Klosure.ai — Phase 4 Schema Delta
-- =============================================================================
-- Apply this AFTER schema.sql, phase2.sql, phase3.sql. Idempotent.
--
-- What Phase 4 adds:
--   - deals.archived_at / closed_reason          — Won / Lost archive flow
--   - deals.locked                                — read-only flag (auto on archive)
--   - users.stripe_customer_id / current_period_end — billing
--   - teams.stripe_subscription_id / seats        — team billing
--   - team_members table                          — managers see members' deals
--   - team_invites table                          — managers invite sellers
--   - manager_messages table                      — Manager talks to Klo (separate
--                                                   from per-deal messages so
--                                                   the manager can ask about the
--                                                   whole pipeline)
--   - RLS for all the above
--   - Helpers: is_team_manager(uuid), team_deals_view
-- =============================================================================

-- ----- Deals: archive / lock ------------------------------------------------

alter table public.deals
  add column if not exists archived_at timestamptz;

alter table public.deals
  add column if not exists closed_reason text
    check (closed_reason in (
      'won', 'budget', 'timing', 'competitor', 'no_decision', 'other'
    ));

alter table public.deals
  add column if not exists locked boolean default false;

create index if not exists deals_status_idx on public.deals(seller_id, status, archived_at);

-- Auto-flip the lock + timestamp when status moves out of 'active'. We never
-- delete a deal — won and lost rooms become read-only history.
create or replace function public.deals_archive_lock()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('won', 'lost', 'archived') and (old.status is distinct from new.status) then
    new.locked := true;
    new.archived_at := coalesce(new.archived_at, now());
  end if;
  if new.status = 'active' and (old.status is distinct from new.status) then
    -- Reopening a deal clears the lock but keeps the archived_at audit trail.
    new.locked := false;
  end if;
  return new;
end;
$$;

drop trigger if exists deals_archive_lock_trg on public.deals;
create trigger deals_archive_lock_trg
  before update on public.deals
  for each row execute function public.deals_archive_lock();

-- Block writes to messages / commitments / deal_context once the parent deal
-- is locked. RLS already gates reads/writes on ownership; these triggers keep
-- the locked invariant honest even if a client tries to bypass the UI.
create or replace function public.guard_locked_deal()
returns trigger
language plpgsql
as $$
declare
  v_locked boolean;
begin
  select locked into v_locked
  from public.deals
  where id = coalesce(new.deal_id, old.deal_id);

  if v_locked then
    raise exception 'deal is locked (won/lost/archived) — read-only';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_locked_messages on public.messages;
create trigger guard_locked_messages
  before insert or update or delete on public.messages
  for each row execute function public.guard_locked_deal();

drop trigger if exists guard_locked_commitments on public.commitments;
create trigger guard_locked_commitments
  before insert or update or delete on public.commitments
  for each row execute function public.guard_locked_deal();

drop trigger if exists guard_locked_deal_context on public.deal_context;
create trigger guard_locked_deal_context
  before insert or update or delete on public.deal_context
  for each row execute function public.guard_locked_deal();

-- ----- Users: billing fields ------------------------------------------------

alter table public.users
  add column if not exists stripe_customer_id text;

alter table public.users
  add column if not exists stripe_subscription_id text;

alter table public.users
  add column if not exists current_period_end timestamptz;

alter table public.users
  add column if not exists onboarded_at timestamptz;

-- ----- Teams ----------------------------------------------------------------

alter table public.teams
  add column if not exists stripe_subscription_id text;

alter table public.teams
  add column if not exists seats int default 1;

alter table public.teams
  add column if not exists current_period_end timestamptz;

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  role text default 'seller' check (role in ('manager', 'seller')),
  added_at timestamptz default now(),
  unique(team_id, user_id)
);

create index if not exists team_members_user_idx on public.team_members(user_id);
create index if not exists team_members_team_idx on public.team_members(team_id);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  email text not null,
  invited_by uuid references public.users(id),
  token text unique default replace(gen_random_uuid()::text, '-', ''),
  status text default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz default now(),
  accepted_at timestamptz
);

create index if not exists team_invites_team_idx on public.team_invites(team_id);
create index if not exists team_invites_token_idx on public.team_invites(token);

-- Helper: is the current user a manager of this team?
create or replace function public.is_team_manager(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teams t
    where t.id = p_team_id and t.owner_id = auth.uid()
  );
$$;

-- Helper: is the current user a manager of the team that contains seller_id?
create or replace function public.manages_seller(p_seller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = p_seller_id
      and t.owner_id = auth.uid()
  );
$$;

-- Widen the team-manager read policy to use the helper (Phase 1 inlined the
-- subquery; the helper makes Phase 4 manager features cleaner).
drop policy if exists "deals team manager read" on public.deals;
create policy "deals team manager read" on public.deals
  for select using (public.manages_seller(seller_id));

-- ----- Manager <> Klo conversation -----------------------------------------
-- Separate channel from per-deal messages because the manager asks about the
-- whole pipeline ("which deals are at risk?"), not a single room. Each row is
-- one turn (manager or Klo) inside a manager_thread for a given team.
create table if not exists public.manager_threads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  manager_id uuid references public.users(id) on delete cascade,
  title text,
  created_at timestamptz default now(),
  last_message_at timestamptz default now()
);

create index if not exists manager_threads_team_idx
  on public.manager_threads(team_id, last_message_at desc);

create table if not exists public.manager_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.manager_threads(id) on delete cascade,
  sender text check (sender in ('manager', 'klo')),
  content text not null,
  created_at timestamptz default now()
);

create index if not exists manager_messages_thread_idx
  on public.manager_messages(thread_id, created_at);

-- ----- RLS ------------------------------------------------------------------

alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.manager_threads enable row level security;
alter table public.manager_messages enable row level security;

-- TEAM MEMBERS
drop policy if exists "team_members manager all" on public.team_members;
create policy "team_members manager all" on public.team_members
  for all using (public.is_team_manager(team_id))
  with check (public.is_team_manager(team_id));

drop policy if exists "team_members self read" on public.team_members;
create policy "team_members self read" on public.team_members
  for select using (user_id = auth.uid());

-- TEAM INVITES
drop policy if exists "team_invites manager all" on public.team_invites;
create policy "team_invites manager all" on public.team_invites
  for all using (public.is_team_manager(team_id))
  with check (public.is_team_manager(team_id));

-- MANAGER THREADS — only the owning manager can read/write.
drop policy if exists "manager_threads owner all" on public.manager_threads;
create policy "manager_threads owner all" on public.manager_threads
  for all using (manager_id = auth.uid())
  with check (manager_id = auth.uid());

-- MANAGER MESSAGES — gated through the parent thread.
drop policy if exists "manager_messages owner read" on public.manager_messages;
create policy "manager_messages owner read" on public.manager_messages
  for select using (
    exists (
      select 1 from public.manager_threads mt
      where mt.id = thread_id and mt.manager_id = auth.uid()
    )
  );

drop policy if exists "manager_messages owner insert" on public.manager_messages;
create policy "manager_messages owner insert" on public.manager_messages
  for insert with check (
    exists (
      select 1 from public.manager_threads mt
      where mt.id = thread_id and mt.manager_id = auth.uid()
    )
  );

-- ----- Realtime -------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.manager_messages;
exception when duplicate_object then null;
end $$;

-- ----- Plan helper ---------------------------------------------------------
-- Is the current user on a paid plan (pro or team)? Used by the client to gate
-- features without hard-coding plan-string logic across the app.
create or replace function public.user_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select t.plan from public.users u
       join public.teams t on t.id = u.team_id
       where u.id = p_user_id),
    (select plan from public.users where id = p_user_id),
    'free'
  );
$$;
