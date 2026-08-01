alter table public.households add column if not exists reminder_hours int[] not null default array[7,9,11,13,15,18,21];

create or replace function public.create_household_with_members(p_household_name text, p_members jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare h_id uuid; code text; item jsonb; signed_email text := lower(coalesce(auth.jwt()->>'email','')); found_signed boolean := false; member_count int;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  member_count := jsonb_array_length(p_members);
  if member_count < 1 or member_count > 12 then raise exception 'A household must contain between 1 and 12 people'; end if;
  if exists (select 1 from jsonb_array_elements(p_members) x group by lower(trim(x->>'email')) having count(*) > 1) then raise exception 'Emails must be unique'; end if;
  select exists(select 1 from jsonb_array_elements(p_members) x where lower(trim(x->>'email')) = signed_email) into found_signed;
  if not found_signed then raise exception 'Your signed-in email must be included'; end if;
  if exists(select 1 from household_members where user_id=auth.uid()) then raise exception 'You already belong to a household'; end if;

  insert into households(name,created_by) values(trim(p_household_name),auth.uid()) returning id,invite_code into h_id,code;
  for item in select * from jsonb_array_elements(p_members) loop
    insert into household_members(household_id,user_id,display_name,email,rotation_position,is_admin)
    values(h_id,case when lower(trim(item->>'email'))=signed_email then auth.uid() else null end,trim(item->>'display_name'),lower(trim(item->>'email')),(item->>'rotation_position')::int,lower(trim(item->>'email'))=signed_email);
  end loop;
  perform seed_default_tasks(h_id); perform ensure_week(h_id,current_date); perform ensure_bio_event(h_id,current_date); return code;
end; $$;

grant execute on function public.create_household_with_members(text,jsonb) to authenticated;

create or replace function public.get_household_members()
returns table(id uuid,display_name text,email text,rotation_position int,is_admin boolean,is_active boolean)
language plpgsql security definer set search_path=public as $$
declare h_id uuid;
begin
  select household_id into h_id from household_members where user_id=auth.uid() limit 1;
  if h_id is null then raise exception 'NO_HOUSEHOLD'; end if;
  return query select m.id,m.display_name,m.email,m.rotation_position,m.is_admin,true from household_members m where m.household_id=h_id order by m.rotation_position;
end; $$;
grant execute on function public.get_household_members() to authenticated;

create or replace function public.remove_household_member(p_member_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare h_id uuid; target_admin boolean;
begin
  select household_id into h_id from household_members where user_id=auth.uid() and is_admin=true limit 1;
  if h_id is null then raise exception 'Admin access required'; end if;
  select is_admin into target_admin from household_members where id=p_member_id and household_id=h_id;
  if target_admin then raise exception 'The household owner cannot be removed'; end if;
  delete from household_members where id=p_member_id and household_id=h_id;
  with ordered as (select id,row_number() over(order by rotation_position)-1 as new_position from household_members where household_id=h_id)
  update household_members m set rotation_position=o.new_position from ordered o where m.id=o.id;
end; $$;
grant execute on function public.remove_household_member(uuid) to authenticated;

create or replace function public.link_invited_member()
returns void language plpgsql security definer set search_path=public as $$
begin
  update household_members set user_id=auth.uid()
  where user_id is null and lower(email)=lower(coalesce(auth.jwt()->>'email',''));
end; $$;
grant execute on function public.link_invited_member() to authenticated;

create or replace function public.get_dashboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare h_id uuid; w cleaning_weeks%rowtype; b bio_waste_events%rowtype; current_member household_members%rowtype; next_member household_members%rowtype; total int; completed int; admin_flag boolean; member_count int;
begin
  perform link_invited_member();
  select household_id,is_admin into h_id,admin_flag from household_members where user_id=auth.uid() limit 1;
  if h_id is null then raise exception 'NO_HOUSEHOLD'; end if;
  perform ensure_week(h_id,current_date); perform ensure_bio_event(h_id,current_date);
  select count(*) into member_count from household_members where household_id=h_id;
  select * into w from cleaning_weeks where household_id=h_id and week_start=current_week_start(current_date);
  select * into b from bio_waste_events where household_id=h_id and scheduled_date >= current_date order by scheduled_date limit 1;
  select * into current_member from household_members where id=w.assigned_member_id;
  select * into next_member from household_members where household_id=h_id and rotation_position=((current_member.rotation_position+1)%greatest(member_count,1));
  select count(*) into total from cleaning_tasks where household_id=h_id and is_active;
  select count(*) into completed from task_completions where cleaning_week_id=w.id;
  return jsonb_build_object('householdId',h_id,'householdName',(select name from households where id=h_id),'currentCleaner',to_jsonb(current_member),'nextCleaner',to_jsonb(next_member),'weekId',w.id,'weekStart',w.week_start,'deadline',w.deadline,'status',w.status,'completedTasks',completed,'totalTasks',total,'nextBioDate',b.scheduled_date,'bioCompleted',(b.completed_at is not null),'isAdmin',coalesce(admin_flag,false));
end; $$;
