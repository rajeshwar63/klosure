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
