create or replace function public.get_household_share_code()
returns table(household_name text, invite_code text, member_count int, is_admin boolean)
language plpgsql security definer set search_path=public as $$
declare h_id uuid; admin_flag boolean;
begin
  select m.household_id,m.is_admin into h_id,admin_flag
  from public.household_members m
  where m.user_id=auth.uid()
  limit 1;

  if h_id is null then raise exception 'NO_HOUSEHOLD'; end if;

  return query
  select h.name,h.invite_code,count(m.id)::int,admin_flag
  from public.households h
  join public.household_members m on m.household_id=h.id
  where h.id=h_id
  group by h.id,h.name,h.invite_code;
end; $$;
grant execute on function public.get_household_share_code() to authenticated;

create or replace function public.join_household_with_share_code(p_code text)
returns void language plpgsql security definer set search_path=public as $$
declare h public.households%rowtype; signed_email text; display_name text; next_position int; current_count int;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.household_members m where m.user_id=auth.uid()) then raise exception 'You already belong to a household'; end if;

  select * into h
  from public.households
  where upper(invite_code)=upper(trim(p_code))
  limit 1;

  if h.id is null then raise exception 'Household invite code is invalid'; end if;

  select count(*) into current_count from public.household_members m where m.household_id=h.id;
  if current_count>=12 then raise exception 'This household already has the maximum of 12 members'; end if;

  signed_email:=lower(coalesce(auth.jwt()->>'email',''));
  display_name:=trim(coalesce(auth.jwt()->'user_metadata'->>'display_name',split_part(signed_email,'@',1),'Roommate'));
  select coalesce(max(m.rotation_position),-1)+1 into next_position from public.household_members m where m.household_id=h.id;

  insert into public.household_members(household_id,user_id,display_name,email,rotation_position,is_admin)
  values(h.id,auth.uid(),display_name,signed_email,next_position,false);
end; $$;
grant execute on function public.join_household_with_share_code(text) to authenticated;
