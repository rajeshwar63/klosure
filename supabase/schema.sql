-- =============================================================================
-- Klosure.ai — Phase 1 Supabase Schema
-- =============================================================================
-- Run this in the Supabase SQL editor against a fresh project.
-- This file is idempotent-ish: drops/creates policies cleanly so it can be re-run
-- during development. Do NOT run against production once data exists.
-- =============================================================================

-- ----- Extensions -----------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----- Tables ---------------------------------------------------------------

-- Users (mirrors auth.users for app-level profile data)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text,
  plan text default 'free' check (plan in ('free', 'pro', 'team')),
  team_id uuid,
  created_at timestamptz default now()
);

-- Teams
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text,
  owner_id uuid references public.users(id),
  plan text default 'team',
  created_at timestamptz default now()
);

-- Deals
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.users(id) on delete cascade,
  title text not null,
  buyer_company text,
  seller_company text,
  value numeric,
  deadline date,
  stage text default 'discovery' check (stage in ('discovery', 'proposal', 'negotiation', 'legal', 'closed')),
  health text default 'green' check (health in ('green', 'amber', 'red')),
  status text default 'active' check (status in ('active', 'won', 'lost', 'archived')),
  buyer_token text unique default replace(gen_random_uuid()::text, '-', ''),
  mode text default 'solo' check (mode in ('solo', 'shared')),
  created_at timestamptz default now()
);

create index if not exists deals_seller_id_idx on public.deals(seller_id);
create index if not exists deals_buyer_token_idx on public.deals(buyer_token);

-- Deal context
create table if not exists public.deal_context (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid unique references public.deals(id) on delete cascade,
  stakeholders jsonb default '[]'::jsonb,
  what_needs_to_happen text,
  budget_notes text,
  notes text
);

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete cascade,
  sender_type text check (sender_type in ('seller', 'buyer', 'klo')),
  sender_name text,
  content text not null,
  created_at timestamptz default now()
);

create index if not exists messages_deal_id_idx on public.messages(deal_id, created_at);

-- Commitments (Phase 3 will use these — table created now for stability)
create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete cascade,
  owner text check (owner in ('seller', 'buyer')),
  task text not null,
  due_date date,
  status text default 'pending' check (status in ('pending', 'done', 'overdue')),
  created_at timestamptz default now()
);

-- Deal access (controls buyer link access)
create table if not exists public.deal_access (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete cascade,
  user_id uuid,
  buyer_name text,
  role text check (role in ('seller', 'buyer')),
  joined_at timestamptz default now()
);

create index if not exists deal_access_deal_id_idx on public.deal_access(deal_id);

-- ----- Row Level Security ---------------------------------------------------

alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.deals enable row level security;
alter table public.deal_context enable row level security;
alter table public.messages enable row level security;
alter table public.commitments enable row level security;
alter table public.deal_access enable row level security;

-- USERS: a user reads/updates only their own row.
drop policy if exists "users self read" on public.users;
create policy "users self read" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users self upsert" on public.users;
create policy "users self upsert" on public.users
  for insert with check (auth.uid() = id);

drop policy if exists "users self update" on public.users;
create policy "users self update" on public.users
  for update using (auth.uid() = id);

-- DEALS: seller owns; team manager can read team member deals.
drop policy if exists "deals seller all" on public.deals;
create policy "deals seller all" on public.deals
  for all using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

drop policy if exists "deals team manager read" on public.deals;
create policy "deals team manager read" on public.deals
  for select using (
    exists (
      select 1 from public.users u
      join public.teams t on t.id = u.team_id
      where u.id = public.deals.seller_id
        and t.owner_id = auth.uid()
    )
  );

-- DEAL CONTEXT: same access as parent deal (seller only for write).
drop policy if exists "deal_context seller all" on public.deal_context;
create policy "deal_context seller all" on public.deal_context
  for all using (
    exists (select 1 from public.deals d where d.id = deal_id and d.seller_id = auth.uid())
  ) with check (
    exists (select 1 from public.deals d where d.id = deal_id and d.seller_id = auth.uid())
  );

-- MESSAGES: seller can read/write their own deal messages.
-- Buyer access is granted through service-role token verification (anon buyer
-- flow uses a server-side function or a permissive policy gated by buyer_token).
-- For Phase 1, anonymous buyers post via the anon key with the buyer_token
-- attached on the message; we allow inserts when a matching deal exists.
drop policy if exists "messages seller read" on public.messages;
create policy "messages seller read" on public.messages
  for select using (
    exists (select 1 from public.deals d where d.id = deal_id and d.seller_id = auth.uid())
  );

drop policy if exists "messages seller insert" on public.messages;
create policy "messages seller insert" on public.messages
  for insert with check (
    exists (select 1 from public.deals d where d.id = deal_id and d.seller_id = auth.uid())
  );

-- Buyer (anonymous) read/insert: scoped via deal_access row that the buyer
-- created when they entered the share link. Buyers do not authenticate, so we
-- expose a permissive policy here AND rely on the app to only ever query with
-- a valid buyer_token. Phase 4 should harden this with a Postgres function.
drop policy if exists "messages buyer read via token" on public.messages;
create policy "messages buyer read via token" on public.messages
  for select using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id
        and d.mode = 'shared'
    )
  );

drop policy if exists "messages buyer insert via token" on public.messages;
create policy "messages buyer insert via token" on public.messages
  for insert with check (
    sender_type in ('buyer', 'klo')
    and exists (
      select 1 from public.deals d
      where d.id = deal_id
        and d.mode in ('solo', 'shared')
    )
  );

-- COMMITMENTS: seller full access, buyer read-only via shared mode.
drop policy if exists "commitments seller all" on public.commitments;
create policy "commitments seller all" on public.commitments
  for all using (
    exists (select 1 from public.deals d where d.id = deal_id and d.seller_id = auth.uid())
  ) with check (
    exists (select 1 from public.deals d where d.id = deal_id and d.seller_id = auth.uid())
  );

drop policy if exists "commitments buyer read" on public.commitments;
create policy "commitments buyer read" on public.commitments
  for select using (
    exists (select 1 from public.deals d where d.id = deal_id and d.mode = 'shared')
  );

-- DEAL ACCESS: seller reads, buyer inserts their own join row.
drop policy if exists "deal_access seller read" on public.deal_access;
create policy "deal_access seller read" on public.deal_access
  for select using (
    exists (select 1 from public.deals d where d.id = deal_id and d.seller_id = auth.uid())
  );

drop policy if exists "deal_access buyer insert" on public.deal_access;
create policy "deal_access buyer insert" on public.deal_access
  for insert with check (role = 'buyer');

drop policy if exists "deal_access seller insert" on public.deal_access;
create policy "deal_access seller insert" on public.deal_access
  for insert with check (
    role = 'seller' and exists (
      select 1 from public.deals d where d.id = deal_id and d.seller_id = auth.uid()
    )
  );

-- ----- Realtime -------------------------------------------------------------
-- Enable realtime broadcasts on the messages table so the chat updates live.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.deals;

-- ----- Helper trigger: auto-create public.users row on signup ---------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
