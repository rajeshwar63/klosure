-- =============================================================================
-- Klosure.ai — Phase 10: Team-invite acceptance flow
-- =============================================================================
-- Apply AFTER schema.sql, phase2.sql, phase3.sql, phase4.sql, phase4_5.sql,
-- phase5_daily_focus.sql, phase8.sql, phase9_drop_commitments.sql. Idempotent.
--
-- Phase 4 created the `team_invites` table and the `manages_seller` RLS
-- helper, but never wired up acceptance. This delta closes the loop:
--
--   1. accept_team_invite(token) RPC — invitee calls this after sign-in.
--      Validates token + email match, attaches the user to the team, and
--      marks the invite accepted. Idempotent.
--
--   2. auto_claim_team_invite trigger on public.users — if a brand-new user's
--      email matches a pending invite, attach them automatically. Belt and
--      braces for users who lose the link.
-- =============================================================================

create or replace function public.accept_team_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.team_invites%rowtype;
  v_user_email text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_invite
    from public.team_invites
   where token = p_token
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if v_invite.status = 'revoked' then
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;

  -- Token + email must match. Stops one user redeeming another's invite.
  if lower(v_invite.email) <> lower(v_user_email) then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  -- If the trigger already attached this user, treat it as success.
  if v_invite.status = 'accepted' then
    return jsonb_build_object('ok', true, 'team_id', v_invite.team_id, 'already', true);
  end if;

  insert into public.team_members (team_id, user_id, role)
       values (v_invite.team_id, auth.uid(), 'seller')
  on conflict (team_id, user_id) do nothing;

  update public.users
     set team_id = v_invite.team_id
   where id = auth.uid();

  update public.team_invites
     set status = 'accepted',
         accepted_at = now()
   where id = v_invite.id;

  return jsonb_build_object('ok', true, 'team_id', v_invite.team_id);
end;
$$;

grant execute on function public.accept_team_invite(text) to authenticated;

-- ----- Auto-claim trigger on public.users ----------------------------------
-- Fires after handle_new_user inserts the public.users row on signup. If a
-- pending invite exists for the same email, attach the user to the team.
create or replace function public.auto_claim_team_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.team_invites%rowtype;
begin
  if new.email is null then
    return new;
  end if;

  select * into v_invite
    from public.team_invites
   where lower(email) = lower(new.email)
     and status = 'pending'
   order by created_at desc
   limit 1;

  if not found then
    return new;
  end if;

  insert into public.team_members (team_id, user_id, role)
       values (v_invite.team_id, new.id, 'seller')
  on conflict (team_id, user_id) do nothing;

  new.team_id := v_invite.team_id;

  update public.team_invites
     set status = 'accepted',
         accepted_at = now()
   where id = v_invite.id;

  return new;
end;
$$;

drop trigger if exists on_public_user_created_claim on public.users;
create trigger on_public_user_created_claim
  before insert on public.users
  for each row execute function public.auto_claim_team_invite();
