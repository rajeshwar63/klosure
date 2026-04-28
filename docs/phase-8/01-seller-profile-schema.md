# Step 01 — Seller profile schema

**Sprint:** A
**Goal:** Create the `seller_profiles` table that stores 5 fields per seller. These get injected into every seller-facing LLM call to make Klo's coaching specific to the seller's role/market/ICP instead of generic.

## Files

- `supabase/phase8.sql` — new migration file

## Why a separate table (not `users` columns)

We could add columns to `public.users`, but a separate table is cleaner because:
- Profile is optional (sellers can use the app before filling it out)
- Profile may grow over time (we may eventually add free-text "context" fields)
- Keeps `users` table about identity, not coaching configuration
- Easier to wipe/reset for testing

## Migration

Create `supabase/phase8.sql`:

```sql
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
```

## Verification

After applying, run in Supabase SQL Editor:

```sql
select
  exists(select 1 from information_schema.tables where table_name = 'seller_profiles') as has_table,
  exists(select 1 from pg_policies where tablename = 'seller_profiles' and policyname = 'seller_profiles self read') as has_self_read,
  exists(select 1 from pg_policies where tablename = 'seller_profiles' and policyname = 'seller_profiles manager read') as has_manager_read;
```

All three should return `true`.

## What this step does NOT do

- Does NOT add columns to `deals` or `klo_state` — buyer view extension lives inside the existing JSONB and is added in step 04.
- Does NOT migrate any data — Rajeshwar's profile gets created when he saves it via the UI in step 02.

## Claude Code instructions

```
1. Create file `supabase/phase8.sql` with the SQL above.
2. Apply the migration manually via Supabase SQL Editor (project ref: azpdsgnvqkrfdvqxacqw).
3. Run the verification query and paste the result back.
4. Commit: `git add supabase/phase8.sql && git commit -m "Phase 8 step 01: seller_profiles schema"`
5. Push.
```

## Acceptance

- [ ] `supabase/phase8.sql` exists in the repo
- [ ] Verification query returns `true, true, true`
- [ ] No regressions — existing chat, dashboard, manager view all still work
- [ ] Committed and pushed

→ Next: `02-seller-profile-ui.md`
