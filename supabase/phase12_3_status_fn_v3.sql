-- =============================================================================
-- Klosure.ai — Phase 12.3 Schema Delta (status fn v3)
-- =============================================================================
-- Two fixes for `get_account_status`:
--
-- 1. Solo upgrade while on a team. Previously, if v_user.team_id was set, the
--    team's plan was treated as authoritative. When a user upgraded to a solo
--    plan (e.g. Pro) while still a member of a team that was on 'trial', the
--    function returned plan='trial' even though users.plan='pro'. Now: if the
--    team plan is 'trial' (or null) and the user's individual plan is non-trial,
--    the user's plan wins.
--
-- 2. Status calculation depended entirely on current_period_end. If a paid
--    user had a non-null users.plan but a null current_period_end (Razorpay
--    can return that briefly between authorise and first charge), the user
--    was reported as trial_active because the function fell through to the
--    trial branch. Now: any non-trial paid plan with no read-only is treated
--    as paid_active even when period_end is null — the trial countdown never
--    re-appears once the user has paid.
-- =============================================================================

create or replace function public.get_account_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_team public.teams%rowtype;
  v_plan text;
  v_seat_cap int;
  v_seats_used int;
  v_status text;
  v_period_end timestamptz;
  v_trial_ends timestamptz;
  v_read_only_since timestamptz;
  v_team_id uuid;
  v_is_team_plan boolean := false;
  v_override jsonb;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    return jsonb_build_object('error', 'user_not_found');
  end if;

  v_override := coalesce(v_user.plan_override, '{}'::jsonb);
  if v_override ? 'plan' then
    declare
      v_override_expires timestamptz := (v_override->>'expires_at')::timestamptz;
    begin
      if v_override_expires is null or v_override_expires > now() then
        v_plan := v_override->>'plan';
        return jsonb_build_object(
          'plan', v_plan,
          'status', 'overridden',
          'currency', v_user.currency,
          'team_id', v_user.team_id,
          'is_team_plan', v_plan in ('team_starter', 'team_growth', 'team_scale', 'enterprise'),
          'override_expires_at', v_override_expires
        );
      end if;
    end;
  end if;

  if v_user.team_id is not null then
    select * into v_team from public.teams where id = v_user.team_id;
    if found then
      v_team_id := v_team.id;
      if v_team.plan_override ? 'plan' then
        declare
          v_team_override_expires timestamptz := (v_team.plan_override->>'expires_at')::timestamptz;
        begin
          if v_team_override_expires is null or v_team_override_expires > now() then
            v_plan := v_team.plan_override->>'plan';
            v_is_team_plan := true;
            return jsonb_build_object(
              'plan', v_plan,
              'status', 'overridden',
              'team_id', v_team_id,
              'is_team_plan', true,
              'currency', v_team.currency,
              'override_expires_at', v_team_override_expires
            );
          end if;
        end;
      end if;

      v_plan := v_team.plan;
      v_period_end := v_team.current_period_end;
      v_read_only_since := least(v_team.read_only_since, v_user.read_only_since);
      v_is_team_plan := v_plan in ('team_starter', 'team_growth', 'team_scale', 'enterprise');
    end if;
  end if;

  -- Solo path OR team-on-trial path. If the team is still on 'trial' but the
  -- user themselves has upgraded to a non-trial plan (solo Pro), the user row
  -- wins. is_team_plan stays false because the user is not on a team-tier sub.
  if v_plan is null or v_plan = 'trial' then
    if (v_plan is null or v_plan = 'trial')
       and v_user.plan is not null
       and v_user.plan <> 'trial'
       and v_user.plan <> 'free' then
      v_plan := v_user.plan;
      v_is_team_plan := v_plan in ('team_starter', 'team_growth', 'team_scale', 'enterprise');
    elsif v_plan is null then
      v_plan := coalesce(v_user.plan, 'trial');
    end if;
    if v_period_end is null then
      v_period_end := v_user.current_period_end;
    end if;
    if v_read_only_since is null then
      v_read_only_since := v_user.read_only_since;
    end if;
    v_trial_ends := v_user.trial_ends_at;
  end if;

  v_seat_cap := case v_plan
    when 'trial' then 1
    when 'pro' then 1
    when 'team_starter' then 5
    when 'team_growth' then 15
    when 'team_scale' then 30
    when 'enterprise' then 100
    else 1
  end;

  if v_team_id is not null then
    select count(*) into v_seats_used
      from public.team_members where team_id = v_team_id;
  else
    v_seats_used := 1;
  end if;

  -- Status: paid plans (non-trial, non-free) anchor on the plan column. If
  -- period_end is null at verify time (Razorpay hasn't filled current_end
  -- yet), still treat as paid_active so the trial countdown does not re-show.
  if v_read_only_since is not null then
    if v_user.deletion_warning_sent_at is not null then
      v_status := 'pending_deletion';
    else
      v_status := 'trial_expired_readonly';
    end if;
  elsif v_plan in ('pro', 'team_starter', 'team_growth', 'team_scale', 'enterprise') then
    if v_period_end is null then
      v_status := 'paid_active';
    elsif v_period_end > now() then
      v_status := 'paid_active';
    else
      v_status := 'paid_grace';
    end if;
  elsif v_period_end is not null and v_period_end > now() then
    v_status := 'paid_active';
  elsif v_period_end is not null and v_period_end <= now() then
    v_status := 'paid_grace';
  elsif v_trial_ends is not null and v_trial_ends > now() then
    v_status := 'trial_active';
  elsif v_trial_ends is not null and v_trial_ends <= now() then
    v_status := 'trial_expired_readonly';
  else
    v_status := 'trial_active';
  end if;

  return jsonb_build_object(
    'plan', v_plan,
    'status', v_status,
    'seat_cap', v_seat_cap,
    'seats_used', v_seats_used,
    'currency', coalesce(v_team.currency, v_user.currency, 'INR'),
    'trial_started_at', v_user.trial_started_at,
    'trial_ends_at', v_trial_ends,
    'current_period_end', v_period_end,
    'read_only_since', v_read_only_since,
    'team_id', v_team_id,
    'is_team_plan', v_is_team_plan,
    'days_until_trial_end',
      case when v_trial_ends is null then null
           else extract(epoch from (v_trial_ends - now())) / 86400
      end
  );
end;
$$;
