create or replace function public.ensure_week(p_household_id uuid,p_date date default current_date)
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

  select array_agg(hm.id order by hm.rotation_position,hm.created_at)
  into member_ids
  from public.household_members hm
  where hm.household_id=p_household_id
    and hm.is_active=true
    and hm.user_id is not null;

  member_count:=coalesce(array_length(member_ids,1),0);
  if member_count=0 then raise exception 'Household has no active joined members'; end if;

  ws:=public.current_week_start(p_date);
  weeks_since:=floor((ws-public.current_week_start(h.rotation_start_date))/7.0);
  member_id:=member_ids[(((weeks_since%member_count)+member_count)%member_count)+1];
  dl:=((ws+(h.cleaning_deadline_day-1))::text||' '||h.cleaning_deadline_time::text)::timestamp at time zone h.timezone;

  insert into public.cleaning_weeks(household_id,assigned_member_id,week_start,deadline)
  values(p_household_id,member_id,ws,dl)
  on conflict(household_id,week_start) do update
  set assigned_member_id=case
        when exists(
          select 1 from public.household_members current_member
          where current_member.id=cleaning_weeks.assigned_member_id
            and current_member.is_active=true
            and current_member.user_id is not null
        ) then cleaning_weeks.assigned_member_id
        else excluded.assigned_member_id
      end,
      deadline=excluded.deadline
  returning id into result_id;

  return result_id;
end;
$$;

create or replace function public.ensure_bio_event(p_household_id uuid,p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  h public.households%rowtype;
  days_since int;
  due_date date;
  week_id uuid;
  member_id uuid;
  result_id uuid;
begin
  select * into h from public.households where id=p_household_id;
  if h.id is null then raise exception 'Household not found'; end if;

  days_since:=greatest(0,p_date-h.bio_anchor_date);
  due_date:=h.bio_anchor_date+(floor(days_since/3.0)::int*3);
  if due_date<p_date then due_date:=due_date+3; end if;

  week_id:=public.ensure_week(p_household_id,due_date);
  select assigned_member_id into member_id from public.cleaning_weeks where id=week_id;

  insert into public.bio_waste_events(household_id,assigned_member_id,scheduled_date)
  values(p_household_id,member_id,due_date)
  on conflict(household_id,scheduled_date) do update
  set assigned_member_id=case
        when exists(
          select 1 from public.household_members current_member
          where current_member.id=bio_waste_events.assigned_member_id
            and current_member.is_active=true
            and current_member.user_id is not null
        ) then bio_waste_events.assigned_member_id
        else excluded.assigned_member_id
      end
  returning id into result_id;

  return result_id;
end;
$$;
