-- =============================================================================
-- Klosure.ai — Phase 5 Schema Delta (Daily focus cache)
-- =============================================================================
-- Apply AFTER schema.sql, phase2.sql, phase3.sql, phase4.sql, phase4_5.sql.
-- Idempotent.
--
-- What this adds:
--   - klo_daily_focus              cache of klo-daily-focus output, one row per seller
--   - mark_seller_focus_stale_*    triggers that flip is_stale when the seller's
--                                  pipeline materially changes (confidence ≥10pt
--                                  swing on any deal, or a status change)
--
-- What it deliberately does NOT do:
--   - Does not grant INSERT/UPDATE/DELETE on klo_daily_focus to anyone. Only
--     the service role writes (via the klo-daily-focus Edge Function).
-- =============================================================================

-- ----- klo_daily_focus ------------------------------------------------------
create table if not exists public.klo_daily_focus (
  seller_id uuid primary key references public.users(id) on delete cascade,
  focus_text text not null,
  deals_referenced uuid[] not null default '{}',
  generated_at timestamptz not null default now(),
  is_stale boolean not null default false
);

-- ----- RLS ------------------------------------------------------------------
alter table public.klo_daily_focus enable row level security;

drop policy if exists "klo_daily_focus seller read" on public.klo_daily_focus;
create policy "klo_daily_focus seller read" on public.klo_daily_focus
  for select using (seller_id = auth.uid());

-- No INSERT / UPDATE / DELETE policies on purpose — only the service role
-- writes via the klo-daily-focus Edge Function.

-- ----- Stale triggers -------------------------------------------------------
-- A seller's daily focus paragraph references specific deals, blockers, and
-- confidence trends. Once the underlying pipeline shifts meaningfully, the
-- paragraph is no longer "today's read" — flag the cache so the next call
-- regenerates instead of serving the previous paragraph.

create or replace function public.mark_seller_focus_stale_on_confidence_change()
returns trigger as $$
declare
  old_score int;
  new_score int;
begin
  old_score := nullif(old.klo_state -> 'confidence' ->> 'value', '')::int;
  new_score := nullif(new.klo_state -> 'confidence' ->> 'value', '')::int;
  if old_score is null or new_score is null
     or abs(coalesce(new_score, 0) - coalesce(old_score, 0)) >= 10 then
    update public.klo_daily_focus
       set is_stale = true
     where seller_id = new.seller_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_focus_stale_on_confidence on public.deals;
create trigger trg_focus_stale_on_confidence
  after update of klo_state on public.deals
  for each row
  execute function public.mark_seller_focus_stale_on_confidence_change();

create or replace function public.mark_seller_focus_stale_on_status_change()
returns trigger as $$
begin
  if old.status is distinct from new.status then
    update public.klo_daily_focus
       set is_stale = true
     where seller_id = new.seller_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_focus_stale_on_status on public.deals;
create trigger trg_focus_stale_on_status
  after update of status on public.deals
  for each row
  execute function public.mark_seller_focus_stale_on_status_change();

-- Adding a deal also invalidates the focus — the new deal might be the
-- highest-leverage thing to act on today.
create or replace function public.mark_seller_focus_stale_on_deal_insert()
returns trigger as $$
begin
  update public.klo_daily_focus
     set is_stale = true
   where seller_id = new.seller_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_focus_stale_on_deal_insert on public.deals;
create trigger trg_focus_stale_on_deal_insert
  after insert on public.deals
  for each row
  execute function public.mark_seller_focus_stale_on_deal_insert();
