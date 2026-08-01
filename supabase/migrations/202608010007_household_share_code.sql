create or replace function public.get_household_share_code()
returns table(household_name text, invite_code text, member_count int, is_admin boolean)
language plpgsql
security definer
set search_path=public
as $$
declare
  h_id uuid;
  admin_flag boolean;
begin
  select hm.household_id, hm.is_admin
  into h_id, admin_flag
  from public.household_members hm
  where hm.user_id = auth.uid()
  limit 1;

  if h_id is null then
    raise exception 'NO_HOUSEHOLD';
  end if;

  return query
  select hh.name, hh.invite_code, count(hm.id)::int, admin_flag
  from public.households hh
  join public.household_members hm on hm.household_id = hh.id
  where hh.id = h_id
  group by hh.id, hh.name, hh.invite_code;
end;
$$;

grant execute on function public.get_household_share_code() to authenticated;

create or replace function public.join_household_with_share_code(p_code text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  h public.households%rowtype;
  signed_email text;
  display_name text;
  next_position int;
  current_count int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if exists(select 1 from public.household_members hm where hm.user_id = auth.uid()) then
    raise exception 'You already belong to a household';
  end if;

  select hh.* into h
  from public.households hh
  where upper(hh.invite_code) = upper(trim(p_code))
  limit 1;

  if h.id is null then
    raise exception 'Household invite code is invalid';
  end if;

  select count(*) into current_count
  from public.household_members hm
  where hm.household_id = h.id;

  if current_count >= 12 then
    raise exception 'This household already has the maximum of 12 members';
  end if;

  signed_email := lower(coalesce(auth.jwt()->>'email',''));
  display_name := trim(coalesce(auth.jwt()->'user_metadata'->>'display_name', split_part(signed_email,'@',1), 'Roommate'));

  select coalesce(max(hm.rotation_position),-1)+1 into next_position
  from public.household_members hm
  where hm.household_id = h.id;

  insert into public.household_members(household_id,user_id,display_name,email,rotation_position,is_admin)
  values(h.id,auth.uid(),display_name,signed_email,next_position,false);
end;
$$;

grant execute on function public.join_household_with_share_code(text) to authenticated;
