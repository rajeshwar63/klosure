-- =============================================================================
-- Klosure.ai — Phase 9 Schema Delta (drop commitments)
-- =============================================================================
-- Removes the commitments table and all dependencies. Forward-only — there is
-- no rollback. Apply via SQL Editor on project azpdsgnvqkrfdvqxacqw.
-- =============================================================================

-- Drop the realtime publication entry first (idempotent)
do $$
begin
  alter publication supabase_realtime drop table public.commitments;
exception when undefined_object then null;
end $$;

-- Drop policies (cascade with table drop, but explicit for clarity)
drop policy if exists "commitments seller all" on public.commitments;
drop policy if exists "commitments buyer read via shared" on public.commitments;
drop policy if exists "commitments manager read" on public.commitments;

-- Drop the table itself
drop table if exists public.commitments cascade;

-- Verification: should return false
select exists(
  select 1 from information_schema.tables where table_name = 'commitments'
) as commitments_still_exists;

-- =============================================================================
-- Phase 9 step 02: add seller_company to seller_profiles
-- =============================================================================

alter table public.seller_profiles
  add column if not exists seller_company text;

-- Backfill from existing deals — use the most recent deal's seller_company
-- value as the default. Sellers who already filled out a deal won't be
-- re-asked.
update public.seller_profiles sp
set seller_company = sub.seller_company
from (
  select distinct on (seller_id)
    seller_id,
    seller_company
  from public.deals
  where seller_company is not null
  order by seller_id, created_at desc
) sub
where sp.user_id = sub.seller_id
  and sp.seller_company is null;

-- Verification
select
  count(*) as profiles,
  count(seller_company) as with_company,
  count(*) filter (where seller_company is null) as without_company
from public.seller_profiles;
