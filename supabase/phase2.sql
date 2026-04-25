-- =============================================================================
-- Klosure.ai — Phase 2 Schema Delta
-- =============================================================================
-- Apply this AFTER `schema.sql` (Phase 1). Idempotent — safe to re-run.
--
-- What Phase 2 adds:
--   - messages.visible_to       — role-aware Klo coaching ('seller' | 'buyer' | null=both)
--   - deals.summary             — Klo's live one-line deal status (KloSummaryBar)
--   - deals.last_klo_at         — last time Klo posted (used for nudge cadence)
--   - RLS policies tightened so each side only reads coaching meant for them
-- =============================================================================

-- ----- Columns --------------------------------------------------------------

alter table public.messages
  add column if not exists visible_to text
  check (visible_to in ('seller', 'buyer'));

alter table public.deals
  add column if not exists summary text;

alter table public.deals
  add column if not exists last_klo_at timestamptz;

create index if not exists messages_visible_to_idx on public.messages(deal_id, visible_to);

-- ----- RLS: tighten message read policies to honour visible_to --------------
-- A null `visible_to` means "everyone in the room". A non-null value scopes
-- the message to that role only. This is what makes seller and buyer see
-- DIFFERENT Klo coaching in a shared deal room (Phase 2 §8 — "Views diverge").

-- SELLER: their own deal messages, minus anything addressed only to the buyer.
drop policy if exists "messages seller read" on public.messages;
create policy "messages seller read" on public.messages
  for select using (
    exists (select 1 from public.deals d where d.id = deal_id and d.seller_id = auth.uid())
    and (visible_to is null or visible_to = 'seller')
  );

-- BUYER (anon): shared-deal messages, minus anything addressed only to the seller.
drop policy if exists "messages buyer read via token" on public.messages;
create policy "messages buyer read via token" on public.messages
  for select using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id
        and d.mode = 'shared'
    )
    and (visible_to is null or visible_to = 'buyer')
  );

-- Klo writes always come from the service role (edge function), which bypasses
-- RLS — so we don't need to grant the anon/authed roles permission to insert
-- with arbitrary `visible_to`. Existing buyer/seller insert policies still work
-- because user-sent messages always leave visible_to = null (everyone sees them).
--
-- Note on the buyer view of the live `deals.summary`: the seller subscribes to
-- `deals` UPDATE and sees Klo's summary refresh in real time. The buyer reads
-- a snapshot of the deal at join time and does NOT receive live `deals.*`
-- updates — granting anon SELECT on `deals` would expose the whole table. The
-- buyer still sees Klo's coaching live (via the messages stream). Phase 4 will
-- add a security-definer RPC that lets the buyer subscribe to their deal
-- alone, validated against the buyer_token.
