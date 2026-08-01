create or replace function public.get_household_members()
returns table(id uuid,user_id uuid,display_name text,email text,rotation_position int,is_admin boolean,is_active boolean)
language plpgsql security definer set search_path=public as $$
declare h_id uuid;
begin
  select hm.household_id
  into h_id
  from public.household_members as hm
  where hm.user_id = auth.uid()
  limit 1;

  if h_id is null then
    raise exception 'NO_HOUSEHOLD';
  end if;

  return query
  select
    hm.id,
    hm.user_id,
    hm.display_name,
    hm.email,
    hm.rotation_position,
    hm.is_admin,
    true as is_active
  from public.household_members as hm
  where hm.household_id = h_id
  order by hm.rotation_position;
end;
$$;

grant execute on function public.get_household_members() to authenticated;
