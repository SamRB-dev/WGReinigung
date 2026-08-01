alter table public.household_members add column if not exists is_admin boolean not null default false;
alter table public.households add column if not exists weekly_reminder_hours int[] not null default array[9,18];
alter table public.households add column if not exists bio_reminder_hours int[] not null default array[9,14,19];

update public.household_members m set is_admin = true
from public.households h where m.household_id = h.id and m.user_id = h.created_by;

create table if not exists public.household_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid not null references auth.users(id),
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.household_events enable row level security;
create policy "members read events" on public.household_events for select using (public.is_household_member(household_id));

create or replace function public.is_household_admin(p_household_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from household_members where household_id=p_household_id and user_id=auth.uid() and is_admin=true);
$$;

create or replace function public.get_admin_settings()
returns jsonb language plpgsql security definer set search_path=public as $$
declare h households%rowtype;
begin
  select hh.* into h from households hh join household_members m on m.household_id=hh.id where m.user_id=auth.uid() limit 1;
  if h.id is null or not is_household_admin(h.id) then raise exception 'Admin access required'; end if;
  return jsonb_build_object('household_id',h.id,'name',h.name,'weekly_reminder_hours',h.weekly_reminder_hours,'bio_reminder_hours',h.bio_reminder_hours);
end; $$;
grant execute on function public.get_admin_settings() to authenticated;

create or replace function public.update_household_settings(p_name text,p_weekly_hours int[],p_bio_hours int[])
returns void language plpgsql security definer set search_path=public as $$
declare h_id uuid;
begin
  select household_id into h_id from household_members where user_id=auth.uid() limit 1;
  if h_id is null or not is_household_admin(h_id) then raise exception 'Admin access required'; end if;
  if cardinality(p_weekly_hours)=0 or cardinality(p_bio_hours)=0 then raise exception 'At least one reminder hour is required'; end if;
  if exists(select 1 from unnest(p_weekly_hours||p_bio_hours) x where x<0 or x>23) then raise exception 'Hours must be between 0 and 23'; end if;
  update households set name=coalesce(nullif(trim(p_name),''),name),weekly_reminder_hours=p_weekly_hours,bio_reminder_hours=p_bio_hours where id=h_id;
end; $$;
grant execute on function public.update_household_settings(text,int[],int[]) to authenticated;

create or replace function public.create_household_event(p_title text,p_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare h_id uuid; result uuid;
begin
  select household_id into h_id from household_members where user_id=auth.uid() limit 1;
  if h_id is null or not is_household_admin(h_id) then raise exception 'Admin access required'; end if;
  insert into household_events(household_id,title,body,created_by) values(h_id,trim(p_title),trim(p_body),auth.uid()) returning id into result;
  return result;
end; $$;
grant execute on function public.create_household_event(text,text) to authenticated;

create or replace function public.get_dashboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare h_id uuid; w cleaning_weeks%rowtype; b bio_waste_events%rowtype; current_member household_members%rowtype; next_member household_members%rowtype; total int; completed int; admin_flag boolean;
begin
  select household_id,is_admin into h_id,admin_flag from household_members where user_id=auth.uid() or lower(email)=lower(coalesce(auth.jwt()->>'email','')) limit 1;
  if h_id is null then raise exception 'NO_HOUSEHOLD'; end if;
  perform ensure_week(h_id,current_date); perform ensure_bio_event(h_id,current_date);
  select * into w from cleaning_weeks where household_id=h_id and week_start=current_week_start(current_date);
  select * into b from bio_waste_events where household_id=h_id and scheduled_date >= current_date order by scheduled_date limit 1;
  select * into current_member from household_members where id=w.assigned_member_id;
  select * into next_member from household_members where household_id=h_id and rotation_position=((current_member.rotation_position+1)%4);
  select count(*) into total from cleaning_tasks where household_id=h_id and is_active;
  select count(*) into completed from task_completions where cleaning_week_id=w.id;
  return jsonb_build_object('householdId',h_id,'householdName',(select name from households where id=h_id),'currentCleaner',to_jsonb(current_member),'nextCleaner',to_jsonb(next_member),'weekId',w.id,'weekStart',w.week_start,'deadline',w.deadline,'status',w.status,'completedTasks',completed,'totalTasks',total,'nextBioDate',b.scheduled_date,'bioCompleted',(b.completed_at is not null),'isAdmin',coalesce(admin_flag,false));
end; $$;

-- Ensure the household creator is admin for future households.
create or replace function public.create_household_with_members(p_household_name text, p_members jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare h_id uuid; code text; item jsonb; signed_email text := lower(coalesce(auth.jwt()->>'email','')); found_signed boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_array_length(p_members) <> 4 then raise exception 'Exactly four roommates are required'; end if;
  if exists (select 1 from jsonb_array_elements(p_members) x group by lower(x->>'email') having count(*) > 1) then raise exception 'Emails must be unique'; end if;
  select exists(select 1 from jsonb_array_elements(p_members) x where lower(x->>'email') = signed_email) into found_signed;
  if not found_signed then raise exception 'Your signed-in email must be included'; end if;
  insert into households(name,created_by) values(trim(p_household_name),auth.uid()) returning id,invite_code into h_id,code;
  for item in select * from jsonb_array_elements(p_members) loop
    insert into household_members(household_id,user_id,display_name,email,rotation_position,is_admin)
    values(h_id,case when lower(item->>'email')=signed_email then auth.uid() else null end,trim(item->>'display_name'),lower(trim(item->>'email')),(item->>'rotation_position')::int,lower(item->>'email')=signed_email);
  end loop;
  perform seed_default_tasks(h_id); perform ensure_week(h_id,current_date); perform ensure_bio_event(h_id,current_date); return code;
end; $$;
alter table public.push_log drop constraint if exists push_log_reminder_type_check;
alter table public.push_log add constraint push_log_reminder_type_check check (reminder_type in ('weekly','bio','event'));
