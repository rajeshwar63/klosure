-- =============================================================================
-- Klosure.ai — Phase 3 Schema Delta
-- =============================================================================
-- Apply this AFTER `schema.sql` (Phase 1) and `phase2.sql` (Phase 2).
-- Idempotent — safe to re-run during development.
--
-- What Phase 3 adds:
--   - commitments.proposed_by / proposer_name           — who put it on the table
--   - commitments.owner_name                            — display label for owner
--   - commitments.confirmed_by / confirmed_by_name / confirmed_at  — confirmation
--   - commitments.declined_at                           — declined state
--   - commitments.nudge_sent_at                         — Resend email idempotency
--   - status enum widened: proposed | confirmed | done | overdue | declined
--   - default status -> 'proposed' (was 'pending', which we no longer use)
--   - commitments stream added to realtime publication
--   - RLS: buyers in shared mode can read, propose, confirm, decline, mark done
--   - public.recalculate_deal_health(deal_id) — Postgres function for the
--     Green / Amber / Red pill (Phase 3, Week 6 deliverable)
--   - public.mark_overdue_commitments() — flips confirmed→overdue for any past
--     due date; called by the klo-watcher edge function on a schedule
--   - trigger so any commitments change recomputes deal health automatically
-- =============================================================================

-- ----- Commitments columns --------------------------------------------------

alter table public.commitments
  add column if not exists proposed_by text check (proposed_by in ('seller', 'buyer'));

alter table public.commitments
  add column if not exists proposer_name text;

alter table public.commitments
  add column if not exists owner_name text;

alter table public.commitments
  add column if not exists confirmed_by text check (confirmed_by in ('seller', 'buyer'));

alter table public.commitments
  add column if not exists confirmed_by_name text;

alter table public.commitments
  add column if not exists confirmed_at timestamptz;

alter table public.commitments
  add column if not exists declined_at timestamptz;

alter table public.commitments
  add column if not exists nudge_sent_at timestamptz;

-- Widen status. The Phase 1 check was (pending|done|overdue) — we replace with
-- (proposed|confirmed|done|overdue|declined). Default flips to 'proposed' so
-- naïve inserts land in the correct state. Existing 'pending' rows (none in a
-- fresh project) are migrated to 'proposed' for forward compatibility.
update public.commitments set status = 'proposed' where status = 'pending';

alter table public.commitments drop constraint if exists commitments_status_check;
alter table public.commitments
  add constraint commitments_status_check
  check (status in ('proposed', 'confirmed', 'done', 'overdue', 'declined'));
alter table public.commitments alter column status set default 'proposed';

create index if not exists commitments_deal_status_idx
  on public.commitments(deal_id, status);

create index if not exists commitments_overdue_scan_idx
  on public.commitments(due_date)
  where status = 'confirmed';

-- ----- Realtime -------------------------------------------------------------
-- Both sides need commitments to appear live in the chat timeline. Wrapping in
-- a DO block because `alter publication ... add table` errors if it's already
-- a member, and we want this file to be re-runnable.
do $$
begin
  alter publication supabase_realtime add table public.commitments;
exception when duplicate_object then null;
end $$;

-- ----- RLS ------------------------------------------------------------------
-- Seller already has full access via "commitments seller all" (Phase 1).
-- Phase 3 widens the buyer policies so buyers in a shared room can:
--   - read all commitments
--   - propose new commitments (proposed_by must be 'buyer')
--   - update commitments to confirm, decline, mark done
-- Phase 4 will harden buyer auth via a buyer_token-validating RPC.

drop policy if exists "commitments buyer read" on public.commitments;
create policy "commitments buyer read" on public.commitments
  for select using (
    exists (select 1 from public.deals d where d.id = deal_id and d.mode = 'shared')
  );

drop policy if exists "commitments buyer insert" on public.commitments;
create policy "commitments buyer insert" on public.commitments
  for insert with check (
    proposed_by = 'buyer'
    and exists (select 1 from public.deals d where d.id = deal_id and d.mode = 'shared')
  );

drop policy if exists "commitments buyer update" on public.commitments;
create policy "commitments buyer update" on public.commitments
  for update using (
    exists (select 1 from public.deals d where d.id = deal_id and d.mode = 'shared')
  ) with check (
    exists (select 1 from public.deals d where d.id = deal_id and d.mode = 'shared')
  );

-- ----- Deal health calculation ---------------------------------------------
-- Maps commitment + activity state to Green / Amber / Red. Called from a
-- trigger on commitments AND from the klo-watcher edge function after it
-- marks overdues. Pure SQL so it stays consistent with whatever writes the row.
--
-- Rules (Section 10.1 of the project doc):
--   red   - 2+ overdue commitments
--   red   - any overdue AND deadline < 14 days
--   amber - 1 overdue
--   amber - silent for 5+ days (no buyer/seller message)
--   green - otherwise
create or replace function public.recalculate_deal_health(p_deal_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_overdue_count int;
  v_days_to_deadline int;
  v_hours_silent int;
  v_health text;
begin
  select count(*) into v_overdue_count
  from public.commitments
  where deal_id = p_deal_id and status = 'overdue';

  select case
    when d.deadline is null then null
    else (d.deadline - current_date)::int
  end
  into v_days_to_deadline
  from public.deals d
  where d.id = p_deal_id;

  select coalesce(
    extract(epoch from (now() - max(created_at))) / 3600,
    99999
  )::int
  into v_hours_silent
  from public.messages
  where deal_id = p_deal_id and sender_type in ('seller', 'buyer');

  v_health := case
    when v_overdue_count >= 2 then 'red'
    when v_overdue_count >= 1 and v_days_to_deadline is not null and v_days_to_deadline < 14 then 'red'
    when v_overdue_count >= 1 then 'amber'
    when v_hours_silent > 24 * 5 then 'amber'
    else 'green'
  end;

  update public.deals set health = v_health where id = p_deal_id;
  return v_health;
end;
$$;

-- Trigger: any change to a deal's commitments recomputes its health.
create or replace function public.commitments_recalc_health()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculate_deal_health(coalesce(new.deal_id, old.deal_id));
  return null;
end;
$$;

drop trigger if exists commitments_recalc_health_trg on public.commitments;
create trigger commitments_recalc_health_trg
  after insert or update or delete on public.commitments
  for each row execute function public.commitments_recalc_health();

-- ----- Overdue marking ------------------------------------------------------
-- Flips confirmed commitments past their due date to 'overdue'. Returns the
-- newly-overdue rows so the klo-watcher edge function can emit a nudge + email
-- for each one (and only for newly-overdue — already-overdue rows are
-- skipped, which is what nudge_sent_at idempotency below also enforces).
create or replace function public.mark_overdue_commitments()
returns table(commitment_id uuid, deal_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.commitments c
  set status = 'overdue'
  where c.status = 'confirmed'
    and c.due_date is not null
    and c.due_date < current_date
  returning c.id, c.deal_id;
end;
$$;

-- ----- Notes ----------------------------------------------------------------
-- The klo-watcher edge function calls mark_overdue_commitments() on a schedule
-- (set up via Supabase Cron, hourly). For each newly-overdue row it:
--   1. Generates a role-scoped Klo nudge via Claude (visible_to = 'seller'
--      and, in shared mode, a separate one for visible_to = 'buyer').
--   2. Marks nudge_sent_at and sends the seller a Resend email (one-shot).
--   3. recalculate_deal_health() runs automatically via the trigger above.
