# Step 01 — Drop the commitments table

**Goal:** Remove the `commitments` table from Postgres entirely, and remove all client/server code that references it. After Phase 9, all task/action-item tracking lives inside `klo_state` (extracted by Klo from chat).

## Why

The table was added in Phase 1 and used in Phase 2-3 for manual seller/buyer "owe" tracking. Since Phase 4-5 introduced Klo's chat extraction, Klo already infers most pending items. The table is now redundant — and worse, the fact that the buyer dashboard reads from an empty table creates the broken empty-state in the screenshots.

## Files to modify

### SQL migration

Create `supabase/phase9_drop_commitments.sql`:

```sql
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
```

### Client code to remove

Search and remove:

```
src/pages/DealRoomPage.jsx           — commitments state, realtime subscription, pass-through props
src/components/CommitmentsCard.jsx   — entire file (delete)
src/components/buyer/BuyerCommitmentsTwoCol.jsx  — replace with BuyerPendingTasksTwoCol (step 04)
src/components/seller/...            — any commitments-driven section in Overview
src/lib/supabase.js                  — any commitment query helpers
```

Specifically in `DealRoomPage.jsx`:
- Remove the `useState` for `commitments`
- Remove the `supabase.from('commitments').select(...)` query
- Remove the realtime channel subscription for commitments table
- Remove `commitments` prop from any child component

### Server code to remove

```
supabase/functions/klo-respond/index.ts — any code that writes to or reads from commitments
supabase/functions/klo-watcher/index.ts — overdue commitment detection (if present)
supabase/functions/_shared/...          — any shared types or helpers
```

In `klo-watcher/index.ts`: if it currently flags overdue commitments, that logic moves to flagging overdue items in `klo_state.pending_on_*` arrays (handled in step 03's extraction, watcher just reads).

### Type definitions

In `supabase/functions/_shared/klo-state-types.ts` and any `src/types/...` file, remove:
- `Commitment` type / interface
- `CommitmentStatus` enum
- Any references in deal types

## What this step does NOT do

- Does NOT yet add the replacement `pending_on_*` arrays — that's step 03
- Does NOT migrate any commitment data forward — by design, Klo will re-extract pending items from chat history on the next material turn

## Claude Code instructions

```
1. Create supabase/phase9_drop_commitments.sql with the migration above.
2. Apply via Supabase SQL Editor (project azpdsgnvqkrfdvqxacqw). Confirm verification query returns false.
3. Search the codebase for "commitment" (case-insensitive) and remove all references in:
   - SQL files (already done by migration)
   - Edge function source files
   - React components and pages
   - Type definitions
   - Any prompt strings (extraction-rules-text.ts may reference commitments — remove)
4. Run typecheck on Edge Functions: `cd supabase/functions && deno check klo-respond/index.ts klo-watcher/index.ts klo-daily-focus/index.ts klo-manager/index.ts`
5. Run frontend build: `npm run build`
6. Commit: "Phase 9 step 01: drop commitments table"
7. Push.
```

## Acceptance

- [ ] `commitments` table no longer exists in Postgres
- [ ] No code in repo references `commitments` (grep finds nothing)
- [ ] Frontend builds without errors
- [ ] Edge functions typecheck without errors
- [ ] Existing deals still render (buyer view shows empty pending columns until step 04 lands — that's expected)

→ Next: `02-extend-seller-profile-with-company.md`
