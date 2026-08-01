update public.household_members
set is_active=true
where email not like 'deleted-%@removed.invalid'
  and email not like 'removed-%@removed.invalid';

create or replace function public.add_household_member(p_display_name text,p_email text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare h_id uuid;new_id uuid;next_position int;active_count int;
begin
  select hm.household_id into h_id
  from public.household_members hm
  where hm.user_id=auth.uid() and hm.is_admin=true and hm.is_active=true
  limit 1;
  if h_id is null then raise exception 'Admin access required'; end if;
  if trim(p_display_name)='' or trim(p_email)='' then raise exception 'Name and email are required'; end if;
  if p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address'; end if;
  if exists(select 1 from public.household_members where household_id=h_id and lower(email)=lower(trim(p_email)) and is_active=true) then
    raise exception 'This email is already in the household';
  end if;
  select count(*) into active_count from public.household_members where household_id=h_id and is_active=true;
  if active_count>=12 then raise exception 'A household can contain at most 12 active people'; end if;
  select coalesce(max(rotation_position),-1)+1 into next_position
  from public.household_members where household_id=h_id and is_active=true;
  insert into public.household_members(household_id,display_name,email,rotation_position,is_admin,is_active)
  values(h_id,trim(p_display_name),lower(trim(p_email)),next_position,false,true)
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.add_household_member(text,text) to authenticated;
