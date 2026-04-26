-- =============================================================================
-- Klosure.ai — Phase 4.5 Schema Delta (The Living Deal Record)
-- =============================================================================
-- Apply AFTER schema.sql, phase2.sql, phase3.sql, phase4.sql. Idempotent.
--
-- Core principle (see docs/phase-4-5/README.md):
--   Klo records what was said. The seller cannot edit the record — they can
--   only continue the conversation.
--
-- What Phase 4.5 adds:
--   - deals.klo_state                jsonb (nullable; populated on first turn)
--   - klo_state_history              append-only audit log of every change
--   - RLS on klo_state_history mirroring messages (seller / buyer-when-shared /
--     manager via manages_seller)
--   - Index on (deal_id, changed_at desc)
--
-- What it deliberately does NOT do:
--   - Does NOT modify or remove existing legacy columns on deals
--     (stage, value, deadline, summary, health). Those remain the rollback
--     target and are still updated in parallel during Phase 4.5.
--   - Does NOT grant INSERT/UPDATE/DELETE on klo_state_history to anyone.
--     Only the service role writes history rows (via Edge Functions).
-- =============================================================================

-- ----- deals.klo_state ------------------------------------------------------
alter table public.deals
  add column if not exists klo_state jsonb;

-- ----- klo_state_history ----------------------------------------------------
-- One row per CHANGED FIELD per turn. Never updated, never deleted.
-- before_value / after_value are the per-field snapshots so the Overview can
-- render "what changed" without recomputing diffs from messages.
create table if not exists public.klo_state_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  changed_at timestamptz not null default now(),
  triggered_by_message_id uuid references public.messages(id) on delete set null,
  triggered_by_role text not null check (triggered_by_role in ('seller', 'buyer', 'system')),
  change_kind text not null check (change_kind in ('extracted', 'removed', 'corrected')),
  field_path text not null,
  before_value jsonb,
  after_value jsonb,
  reason text
);

create index if not exists klo_state_history_deal_idx
  on public.klo_state_history(deal_id, changed_at desc);

-- ----- RLS ------------------------------------------------------------------
alter table public.klo_state_history enable row level security;

-- SELLER: full read on their deal's history.
drop policy if exists "klo_state_history seller read" on public.klo_state_history;
create policy "klo_state_history seller read" on public.klo_state_history
  for select using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and d.seller_id = auth.uid()
    )
  );

-- BUYER (anon, shared mode): read history when the deal is shared. Mirrors
-- the messages buyer-read policy — buyers see what Klo recorded, same as
-- they see what was said.
drop policy if exists "klo_state_history buyer read via shared" on public.klo_state_history;
create policy "klo_state_history buyer read via shared" on public.klo_state_history
  for select using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and d.mode = 'shared'
    )
  );

-- MANAGER: read across team members' deals.
drop policy if exists "klo_state_history manager read" on public.klo_state_history;
create policy "klo_state_history manager read" on public.klo_state_history
  for select using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and public.manages_seller(d.seller_id)
    )
  );

-- No INSERT / UPDATE / DELETE policies on purpose. Only the service role
-- writes history rows (via Edge Functions: klo-respond, klo-removal).

-- ----- Realtime -------------------------------------------------------------
-- Live-update the Overview when Klo records a change. Wrap in a DO block
-- so re-running the migration doesn't fail on duplicate add.
do $$
begin
  alter publication supabase_realtime add table public.klo_state_history;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.deals;
exception when duplicate_object then null;
end $$;
