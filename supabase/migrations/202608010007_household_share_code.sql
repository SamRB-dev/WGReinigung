create or replace function public.get_household_invite_code()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  h public.households%rowtype;
begin
  select hh.* into h
  from public.households hh
  join public.household_members hm on hm.household_id = hh.id
  where hm.user_id = auth.uid()
  limit 1;

  if h.id is null then
    raise exception 'NO_HOUSEHOLD';
  end if;

  return jsonb_build_object(
    'householdName', h.name,
    'inviteCode', h.invite_code
  );
end;
$$;

grant execute on function public.get_household_invite_code() to authenticated;

create or replace function public.join_household_with_invite(p_code text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  secure_invite public.household_member_invites%rowtype;
  target_member public.household_members%rowtype;
  signed_email text := lower(coalesce(auth.jwt()->>'email',''));
  normalized_code text := upper(trim(p_code));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if exists(select 1 from public.household_members hm where hm.user_id = auth.uid()) then
    raise exception 'You already belong to a household';
  end if;

  select i.* into secure_invite
  from public.household_member_invites i
  where i.code_hash = encode(digest(normalized_code,'sha256'),'hex')
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  limit 1;

  if secure_invite.id is not null then
    select hm.* into target_member
    from public.household_members hm
    where hm.id = secure_invite.member_id;

    if lower(target_member.email) <> signed_email then
      raise exception 'This invite was created for a different email address';
    end if;

    update public.household_members hm
    set user_id = auth.uid()
    where hm.id = target_member.id and hm.user_id is null;

    if not found then
      raise exception 'This household place has already been claimed';
    end if;

    update public.household_member_invites i
    set accepted_at = now()
    where i.id = secure_invite.id;
    return;
  end if;

  select hm.* into target_member
  from public.household_members hm
  join public.households hh on hh.id = hm.household_id
  where upper(hh.invite_code) = normalized_code
    and lower(hm.email) = signed_email
    and hm.user_id is null
  limit 1;

  if target_member.id is null then
    raise exception 'Invite code is invalid, expired, or not assigned to your email address';
  end if;

  update public.household_members hm
  set user_id = auth.uid()
  where hm.id = target_member.id and hm.user_id is null;

  if not found then
    raise exception 'This household place has already been claimed';
  end if;
end;
$$;

grant execute on function public.join_household_with_invite(text) to authenticated;
