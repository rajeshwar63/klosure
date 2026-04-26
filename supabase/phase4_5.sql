-- =============================================================================
-- Klosure.ai — Phase 4.5 Schema Delta — The Living Deal Record
-- =============================================================================
-- Apply this AFTER schema.sql, phase2.sql, phase3.sql, phase4.sql. Idempotent.
--
-- What Phase 4.5 adds:
--   - deals.klo_state              — running JSONB rendering of Klo's understanding
--                                    of the deal. Rewritten by klo-respond every
--                                    turn. The new Overview renders from this.
--   - klo_state_history table      — append-only log of every change Klo (or a
--                                    seller × removal) makes to klo_state. Used
--                                    so Klo can answer "what changed?" in chat
--                                    and so managers can see seller corrections.
--   - RLS: read mirrors messages   — seller of the deal, buyer in shared mode,
--                                    team manager via manages_seller(). Writes
--                                    come from the service role only (Edge
--                                    Functions) — no end-user write policies.
--
-- What Phase 4.5 deliberately does NOT change:
--   - Existing deals columns (stage, value, deadline, summary, health) stay.
--     klo-respond keeps writing them in parallel so the legacy Overview path
--     remains a working rollback target. A follow-up sprint will deprecate them
--     once the new Overview has been stable for a week.
--   - commitments table, klo-watcher, Stripe, archive/lock — untouched.
-- =============================================================================

-- ----- Deals: living state column -------------------------------------------

alter table public.deals
  add column if not exists klo_state jsonb;

-- No default and no NOT NULL: existing deals stay null until the first chat turn
-- after deploy, at which point klo-respond runs the bootstrap prompt and back-
-- fills the column from full chat history. Inactive deals stay null forever
-- (acceptable — they fall back to the legacy Overview).

-- ----- Append-only history of every klo_state change ------------------------

create table if not exists public.klo_state_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete cascade,
  changed_at timestamptz default now(),
  triggered_by_message_id uuid references public.messages(id) on delete set null,
  triggered_by_role text check (triggered_by_role in ('seller', 'buyer', 'system')),
  change_kind text not null check (change_kind in ('extracted', 'removed', 'corrected')),
  field_path text not null,            -- e.g. 'deadline', 'people[name=Ahmed]', 'bootstrap'
  before_value jsonb,
  after_value jsonb,
  reason text                          -- required on user × removals, null otherwise
);

create index if not exists idx_klo_state_history_deal_changed
  on public.klo_state_history (deal_id, changed_at desc);

-- ----- RLS ------------------------------------------------------------------

alter table public.klo_state_history enable row level security;

-- Read model mirrors messages (Phase 2): seller of the deal, buyer in shared
-- mode, and team manager via manages_seller(). The spec sketched an `or
-- deals.buyer_token is not null` clause; we use mode='shared' instead because
-- buyer_token is set on every deal (it's the share link) and that clause would
-- expose every deal's history to anon. The intent in the spec was "same model
-- as messages" — that's the Phase 2 buyer gate.

drop policy if exists "klo_state_history seller read" on public.klo_state_history;
create policy "klo_state_history seller read" on public.klo_state_history
  for select using (
    exists (
      select 1 from public.deals d
      where d.id = klo_state_history.deal_id
        and d.seller_id = auth.uid()
    )
  );

drop policy if exists "klo_state_history buyer read via shared deal" on public.klo_state_history;
create policy "klo_state_history buyer read via shared deal" on public.klo_state_history
  for select using (
    exists (
      select 1 from public.deals d
      where d.id = klo_state_history.deal_id
        and d.mode = 'shared'
    )
  );

drop policy if exists "klo_state_history manager read" on public.klo_state_history;
create policy "klo_state_history manager read" on public.klo_state_history
  for select using (
    exists (
      select 1 from public.deals d
      where d.id = klo_state_history.deal_id
        and public.manages_seller(d.seller_id)
    )
  );

-- No insert/update/delete policies. The service role (Edge Functions) bypasses
-- RLS and is the ONLY writer. End users do not get to forge or rewrite history.

-- ----- Lock guard: history is part of the deal record -----------------------
-- Same pattern as messages/commitments/deal_context: once a deal is archived,
-- nothing else gets written to its history.

drop trigger if exists guard_locked_klo_state_history on public.klo_state_history;
create trigger guard_locked_klo_state_history
  before insert or update or delete on public.klo_state_history
  for each row execute function public.guard_locked_deal();
