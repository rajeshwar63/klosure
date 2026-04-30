-- =============================================================================
-- Klosure.ai — Phase 13: Team-member management (remove + invite preview)
-- =============================================================================
-- Apply AFTER phase10_team_invites.sql. Idempotent.
--
-- Closes two gaps in the team flow:
--
--   1. get_invite_preview(token) RPC — granted to anon + authenticated so a
--      logged-out visitor on /join-team/:token can see the team name and the
--      inviter's name before being pushed into signup. The frontend has been
--      calling this RPC (services/team.js#getInvitePreview) but the function
--      never existed, so the unauthenticated preview path was silently broken.
--
--   2. remove_team_member(member_id) RPC — lets the team owner kick a seller
--      out, freeing the seat so a replacement can be invited. We use a
--      security-definer function (rather than a direct DELETE under RLS)
--      because the same call also has to null out the removed user's
--      users.team_id row, which RLS would otherwise block.
-- =============================================================================

-- ----- get_invite_preview ---------------------------------------------------
create or replace function public.get_invite_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.team_invites%rowtype;
  v_team_name text;
  v_inviter_name text;
  v_inviter_email text;
begin
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

  -- Already-redeemed tokens look the same to the visitor as bad ones.
  -- The page has no copy for 'accepted', so fold into 'invalid'.
  if v_invite.status = 'accepted' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select name into v_team_name from public.teams where id = v_invite.team_id;
  select name, email into v_inviter_name, v_inviter_email
    from public.users where id = v_invite.invited_by;

  return jsonb_build_object(
    'ok', true,
    'team_name', coalesce(v_team_name, 'A team'),
    'inviter_name', coalesce(v_inviter_name, v_inviter_email, 'Your manager'),
    'invitee_email', v_invite.email
  );
end;
$$;

grant execute on function public.get_invite_preview(text) to anon, authenticated;


-- ----- remove_team_member ---------------------------------------------------
create or replace function public.remove_team_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.team_members%rowtype;
  v_team public.teams%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_member from public.team_members where id = p_member_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_team from public.teams where id = v_member.team_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_team.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'not_manager');
  end if;

  if v_member.user_id = v_team.owner_id then
    return jsonb_build_object('ok', false, 'error', 'cannot_remove_owner');
  end if;

  delete from public.team_members where id = p_member_id;

  -- Detach the removed user from the team. We scope the update to the
  -- specific team_id so a user already moved to another team isn't disturbed.
  update public.users
     set team_id = null
   where id = v_member.user_id
     and team_id = v_team.id;

  return jsonb_build_object(
    'ok', true,
    'team_id', v_team.id,
    'user_id', v_member.user_id
  );
end;
$$;

grant execute on function public.remove_team_member(uuid) to authenticated;
