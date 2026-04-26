# Step 01 — Schema migration

**Status:** ✅ Already committed in earlier session as `supabase/phase4_5.sql`.

This step is included for reference. Do not redo it. If you need to verify it's present:

```powershell
ls supabase\phase4_5.sql
```

## What it added

- `deals.klo_state` jsonb (nullable — existing rows stay null until first chat turn)
- `klo_state_history` table (append-only audit log)
- RLS on `klo_state_history` mirroring `messages` (seller, buyer-when-shared, manager via `manages_seller`)
- Index on `(deal_id, changed_at desc)`

## What it deliberately did NOT do

- Did not modify or remove existing columns (`deals.stage`, `value`, `deadline`, `summary`, `health`)
- Did not add INSERT/UPDATE/DELETE policies on `klo_state_history` — only the service role writes (via Edge Functions)

## Verification before moving on

Run this once in the Supabase SQL Editor to make sure the migration applied:

```sql
select
  exists(select 1 from information_schema.columns where table_name = 'deals' and column_name = 'klo_state') as has_klo_state,
  exists(select 1 from information_schema.tables where table_name = 'klo_state_history') as has_history_table;
```

Both should return `true`. If either is `false`, run `supabase/phase4_5.sql` before continuing to step 02.

→ Next: `02-klo-state-shape.md`
