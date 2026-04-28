-- =============================================================================
-- Klosure.ai — Phase 8 Schema Delta
-- =============================================================================
-- Apply this AFTER schema.sql, phase2.sql, phase3.sql, phase4.sql, phase4_5.sql,
-- phase5_daily_focus.sql, and any phase 6+ migrations. Idempotent.
--
-- What Phase 8 adds:
--   - seller_profiles table — 5-field "train Klo" config per seller
--   - klo_state.buyer_view (added via JSONB shape only, no schema change to deals;
--     buyer_view lives inside the existing klo_state JSONB blob — see step 04)
-- =============================================================================

-- ----- Seller profiles ------------------------------------------------------

create table if not exists public.seller_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,

  -- The 5 locked fields. All free text, no enums (sellers know their world
  -- better than we do; enums would just frustrate them).
  role text,                       -- "Account Executive", "Founder & CEO", "VP Sales"
  what_you_sell text,              -- one sentence — what the product/service is
  icp text,                        -- one sentence — who you sell to
  region text,                     -- "Gulf (UAE/KSA/Qatar)", "India SMB", "US mid-market"
  top_personas text[],             -- array of 2-5 short strings — "CRO", "Head of RevOps", "CFO"
  common_deal_killer text,         -- one sentence — what most often kills your deals

  -- Bookkeeping
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- updated_at trigger — same pattern as other tables that need it
create or replace function public.seller_profiles_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists seller_profiles_touch on public.seller_profiles;
create trigger seller_profiles_touch
  before update on public.seller_profiles
  for each row execute function public.seller_profiles_touch_updated_at();

-- ----- RLS ------------------------------------------------------------------

alter table public.seller_profiles enable row level security;

-- A seller reads/writes only their own profile row.
drop policy if exists "seller_profiles self read" on public.seller_profiles;
create policy "seller_profiles self read" on public.seller_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "seller_profiles self insert" on public.seller_profiles;
create policy "seller_profiles self insert" on public.seller_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "seller_profiles self update" on public.seller_profiles;
create policy "seller_profiles self update" on public.seller_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A team manager can read their team members' profiles (for the manager view —
-- helps Klo understand each rep's context when answering manager questions).
drop policy if exists "seller_profiles manager read" on public.seller_profiles;
create policy "seller_profiles manager read" on public.seller_profiles
  for select using (
    exists (
      select 1 from public.users u
      join public.teams t on t.id = u.team_id
      where u.id = public.seller_profiles.user_id
        and t.owner_id = auth.uid()
    )
  );

-- No DELETE policy — profiles are removed via cascade when the user is deleted.

-- ----- Index (optional but cheap) -------------------------------------------
-- The primary key on user_id already covers lookups. No additional indexes
-- needed for Phase 8.
