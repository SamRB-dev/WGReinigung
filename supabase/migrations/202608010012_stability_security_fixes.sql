alter table public.household_members
  add column if not exists is_active boolean not null default true;

alter table public.household_members
  drop constraint if exists household_members_rotation_position_check;
alter table public.household_members
  add constraint household_members_rotation_position_check
  check (rotation_position between 0 and 11);

update public.household_members
set is_active = (user_id is not null)
where email not like 'deleted-%@removed.invalid';

update public.household_members
set is_active = false
where email like 'deleted-%@removed.invalid';

create unique index if not exists household_members_one_household_per_user
on public.household_members(user_id)
where user_id is not null;

create or replace function public.unregister_push_token(p_push_token text)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.push_tokens
  set is_active=false
  where user_id=auth.uid() and push_token=p_push_token;
end;
$$;
grant execute on function public.unregister_push_token(text) to authenticated;

create or replace function public.ensure_week(p_household_id uuid, p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  h public.households%rowtype;
  ws date;
  weeks_since int;
  member_ids uuid[];
  member_count int;
  member_id uuid;
  result_id uuid;
  dl timestamptz;
begin
  select * into h from public.households where id=p_household_id;
  if h.id is null then raise exception 'Household not found'; end if;

  select array_agg(hm.id order by hm.rotation_position, hm.created_at)
  into member_ids
  from public.household_members hm
  where hm.household_id=p_household_id
    and hm.is_active=true
    and hm.user_id is not null;

  member_count := coalesce(array_length(member_ids,1),0);
  if member_count=0 then raise exception 'Household has no active joined members'; end if;

  ws := public.current_week_start(p_date);
  weeks_since := floor((ws-public.current_week_start(h.rotation_start_date))/7.0);
  member_id := member_ids[(((weeks_since % member_count)+member_count)%member_count)+1];
  dl := ((ws+(h.cleaning_deadline_day-1))::text||' '||h.cleaning_deadline_time::text)::timestamp at time zone h.timezone;

  insert into public.cleaning_weeks(household_id,assigned_member_id,week_start,deadline)
  values(p_household_id,member_id,ws,dl)
  on conflict(household_id,week_start) do update
  set assigned_member_id=excluded.assigned_member_id,
      deadline=excluded.deadline
  returning id into result_id;

  return result_id;
end;
$$;

create or replace function public.get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  h_id uuid;
  w public.cleaning_weeks%rowtype;
  b public.bio_waste_events%rowtype;
  current_member public.household_members%rowtype;
  next_member public.household_members%rowtype;
  active_ids uuid[];
  current_index int;
  total int;
  completed int;
  admin_flag boolean;
begin
  select hm.household_id,hm.is_admin into h_id,admin_flag
  from public.household_members hm
  where hm.user_id=auth.uid() and hm.is_active=true
  limit 1;
  if h_id is null then raise exception 'NO_HOUSEHOLD'; end if;

  perform public.ensure_week(h_id,current_date);
  perform public.ensure_bio_event(h_id,current_date);

  select array_agg(hm.id order by hm.rotation_position,hm.created_at)
  into active_ids
  from public.household_members hm
  where hm.household_id=h_id and hm.is_active=true and hm.user_id is not null;

  select * into w from public.cleaning_weeks
  where household_id=h_id and week_start=public.current_week_start(current_date);
  select * into b from public.bio_waste_events
  where household_id=h_id and scheduled_date>=current_date
  order by scheduled_date limit 1;
  select * into current_member from public.household_members where id=w.assigned_member_id;

  select index into current_index
  from generate_subscripts(active_ids,1) index
  where active_ids[index]=current_member.id;
  select * into next_member
  from public.household_members
  where id=active_ids[(current_index % array_length(active_ids,1))+1];

  select count(*) into total from public.cleaning_tasks where household_id=h_id and is_active;
  select count(*) into completed from public.task_completions where cleaning_week_id=w.id;

  return jsonb_build_object(
    'householdId',h_id,
    'householdName',(select name from public.households where id=h_id),
    'currentCleaner',to_jsonb(current_member),
    'nextCleaner',to_jsonb(next_member),
    'weekId',w.id,
    'weekStart',w.week_start,
    'deadline',w.deadline,
    'status',w.status,
    'completedTasks',completed,
    'totalTasks',total,
    'nextBioDate',b.scheduled_date,
    'bioCompleted',(b.completed_at is not null),
    'isAdmin',coalesce(admin_flag,false)
  );
end;
$$;
grant execute on function public.get_dashboard() to authenticated;

create or replace function public.get_household_members()
returns table(id uuid,user_id uuid,display_name text,email text,rotation_position int,is_admin boolean,is_active boolean)
language plpgsql
security definer
set search_path=public
as $$
declare h_id uuid;
begin
  select hm.household_id into h_id
  from public.household_members hm
  where hm.user_id=auth.uid() and hm.is_active=true
  limit 1;
  if h_id is null then raise exception 'NO_HOUSEHOLD'; end if;
  return query
  select m.id,m.user_id,m.display_name,m.email,m.rotation_position,m.is_admin,m.is_active
  from public.household_members m
  where m.household_id=h_id and m.is_active=true
  order by m.rotation_position,m.created_at;
end;
$$;
grant execute on function public.get_household_members() to authenticated;

create or replace function public.add_household_member(p_display_name text,p_email text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare h_id uuid;new_id uuid;next_position int;
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
  select coalesce(max(rotation_position),-1)+1 into next_position
  from public.household_members where household_id=h_id and is_active=true;
  if next_position>11 then raise exception 'A household can contain at most 12 active people'; end if;
  insert into public.household_members(household_id,display_name,email,rotation_position,is_admin,is_active)
  values(h_id,trim(p_display_name),lower(trim(p_email)),next_position,false,false)
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.add_household_member(text,text) to authenticated;

create or replace function public.remove_household_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare h_id uuid;target public.household_members%rowtype;
begin
  select hm.household_id into h_id
  from public.household_members hm
  where hm.user_id=auth.uid() and hm.is_admin=true and hm.is_active=true
  limit 1;
  if h_id is null then raise exception 'Admin access required'; end if;

  select * into target from public.household_members
  where id=p_member_id and household_id=h_id and is_active=true;
  if target.id is null then raise exception 'Member not found'; end if;
  if target.is_admin then raise exception 'The household owner cannot be removed'; end if;

  delete from public.push_tokens where user_id=target.user_id;
  update public.household_members
  set user_id=null,
      is_active=false,
      display_name='Former roommate',
      email='removed-'||id::text||'@removed.invalid'
  where id=target.id;

  perform public.ensure_week(h_id,current_date);
  perform public.ensure_bio_event(h_id,current_date);
end;
$$;
grant execute on function public.remove_household_member(uuid) to authenticated;

create or replace function public.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  member_row public.household_members%rowtype;
  replacement public.household_members%rowtype;
  joined_count int;
  deleted_household boolean:=false;
begin
  if p_user_id is null then raise exception 'User id is required'; end if;

  delete from public.push_tokens where user_id=p_user_id;
  update public.task_completions set completed_by=null where completed_by=p_user_id;
  update public.bio_waste_events set completed_by=null where completed_by=p_user_id;
  update public.household_member_invites set created_by=null where created_by=p_user_id;

  for member_row in
    select * from public.household_members where user_id=p_user_id
  loop
    select count(*) into joined_count
    from public.household_members hm
    where hm.household_id=member_row.household_id
      and hm.user_id is not null
      and hm.user_id<>p_user_id
      and hm.is_active=true;

    if member_row.is_admin and joined_count=0 then
      delete from public.households where id=member_row.household_id;
      deleted_household:=true;
    else
      if member_row.is_admin then
        select * into replacement
        from public.household_members hm
        where hm.household_id=member_row.household_id
          and hm.user_id is not null
          and hm.user_id<>p_user_id
          and hm.is_active=true
        order by hm.rotation_position,hm.created_at
        limit 1;
        if replacement.id is null then raise exception 'No joined roommate is available to become household admin'; end if;
        update public.household_members set is_admin=true where id=replacement.id;
        update public.households set created_by=replacement.user_id where id=member_row.household_id;
      end if;

      update public.household_members
      set user_id=null,
          is_admin=false,
          is_active=false,
          display_name='Former roommate',
          email='deleted-'||member_row.id::text||'@removed.invalid'
      where id=member_row.id;

      perform public.ensure_week(member_row.household_id,current_date);
      perform public.ensure_bio_event(member_row.household_id,current_date);
    end if;
  end loop;

  update public.households set created_by=null where created_by=p_user_id;
  return jsonb_build_object('ok',true,'deletedHousehold',deleted_household);
end;
$$;
revoke all on function public.prepare_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
