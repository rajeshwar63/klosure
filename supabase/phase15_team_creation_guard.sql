-- =============================================================================
-- Klosure.ai — Phase 15: Block team creation for users already on a team
-- =============================================================================
-- Apply AFTER all earlier phase migrations. Idempotent.
--
-- Closes a hole in the self-service "Create a team" flow on /billing.
-- The frontend hides the section for users with users.team_id set, but a
-- direct supabase-js call could still insert into public.teams and silently
-- detach the rep from their manager. This trigger refuses the insert at the
-- database level so the protection holds regardless of which client made it.
--
-- Skipped when:
--   - auth.uid() is null (service role / cron / edge functions are trusted)
--   - new.owner_id <> auth.uid() (admin-on-behalf inserts; RLS already
--     restricts who can do this)
-- =============================================================================

create or replace function public.guard_team_creation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_team_id uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.owner_id is distinct from auth.uid() then
    return new;
  end if;

  select team_id into v_existing_team_id
    from public.users
   where id = auth.uid();

  if v_existing_team_id is not null then
    raise exception 'already_on_team'
      using errcode = 'P0001',
            hint = 'Leave your current team before starting a new one.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_team_creation_trg on public.teams;
create trigger guard_team_creation_trg
  before insert on public.teams
  for each row execute function public.guard_team_creation();
