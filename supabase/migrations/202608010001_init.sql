create extension if not exists pgcrypto;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  rotation_start_date date not null default date_trunc('week', now())::date,
  cleaning_deadline_day int not null default 7 check (cleaning_deadline_day between 1 and 7),
  cleaning_deadline_time time not null default '18:00',
  bio_anchor_date date not null default current_date,
  reminder_hour int not null default 9 check (reminder_hour between 0 and 23),
  timezone text not null default 'Europe/Berlin',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  email text not null,
  rotation_position int not null check (rotation_position between 0 and 3),
  email_notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (household_id, email),
  unique (household_id, rotation_position)
);

create table public.cleaning_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null,
  title text not null,
  guideline text,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table public.cleaning_weeks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  assigned_member_id uuid not null references public.household_members(id),
  week_start date not null,
  deadline timestamptz not null,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed','overdue')),
  completed_at timestamptz,
  unique (household_id, week_start)
);

create table public.task_completions (
  cleaning_week_id uuid not null references public.cleaning_weeks(id) on delete cascade,
  task_id uuid not null references public.cleaning_tasks(id) on delete cascade,
  completed_by uuid references auth.users(id),
  completed_at timestamptz not null default now(),
  primary key (cleaning_week_id, task_id)
);

create table public.bio_waste_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  assigned_member_id uuid not null references public.household_members(id),
  scheduled_date date not null,
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  unique (household_id, scheduled_date)
);

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  reminder_type text not null,
  reminder_key text not null,
  recipient_email text not null,
  provider_message_id text,
  status text not null,
  error_message text,
  sent_at timestamptz not null default now(),
  unique (household_id, reminder_type, reminder_key, recipient_email)
);

create or replace function public.is_household_member(p_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_members
    where household_id = p_household_id
      and (user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt()->>'email','')))
  );
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.cleaning_tasks enable row level security;
alter table public.cleaning_weeks enable row level security;
alter table public.task_completions enable row level security;
alter table public.bio_waste_events enable row level security;
alter table public.email_log enable row level security;

create policy "members read households" on public.households for select using (public.is_household_member(id));
create policy "members read members" on public.household_members for select using (public.is_household_member(household_id));
create policy "members read tasks" on public.cleaning_tasks for select using (public.is_household_member(household_id));
create policy "members read weeks" on public.cleaning_weeks for select using (public.is_household_member(household_id));
create policy "members read completions" on public.task_completions for select using (
  exists (select 1 from cleaning_weeks w where w.id = cleaning_week_id and public.is_household_member(w.household_id))
);
create policy "members manage completions" on public.task_completions for all using (
  exists (select 1 from cleaning_weeks w where w.id = cleaning_week_id and public.is_household_member(w.household_id))
) with check (
  exists (select 1 from cleaning_weeks w where w.id = cleaning_week_id and public.is_household_member(w.household_id))
);
create policy "members read bio events" on public.bio_waste_events for select using (public.is_household_member(household_id));
create policy "members update bio events" on public.bio_waste_events for update using (public.is_household_member(household_id));

create or replace function public.claim_member_record()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update household_members set user_id = new.id
  where user_id is null and lower(email) = lower(new.email);
  return new;
end; $$;
create trigger on_auth_user_created_claim_members after insert on auth.users
for each row execute procedure public.claim_member_record();

create or replace function public.current_week_start(p_date date default current_date)
returns date language sql immutable as $$
  select (p_date - ((extract(isodow from p_date)::int - 1) * interval '1 day'))::date;
$$;

create or replace function public.ensure_week(p_household_id uuid, p_date date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  h households%rowtype; ws date; weeks_since int; pos int; member_id uuid; result_id uuid; dl timestamptz;
begin
  select * into h from households where id = p_household_id;
  ws := current_week_start(p_date);
  weeks_since := floor((ws - current_week_start(h.rotation_start_date)) / 7.0);
  pos := ((weeks_since % 4) + 4) % 4;
  select id into member_id from household_members where household_id = p_household_id and rotation_position = pos;
  if member_id is null then raise exception 'Household must have four members'; end if;
  dl := ((ws + (h.cleaning_deadline_day - 1))::text || ' ' || h.cleaning_deadline_time::text)::timestamp at time zone h.timezone;
  insert into cleaning_weeks(household_id, assigned_member_id, week_start, deadline)
  values(p_household_id, member_id, ws, dl)
  on conflict(household_id, week_start) do update set assigned_member_id = excluded.assigned_member_id
  returning id into result_id;
  return result_id;
end; $$;

create or replace function public.ensure_bio_event(p_household_id uuid, p_date date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  h households%rowtype; days_since int; due_date date; week_id uuid; member_id uuid; result_id uuid;
begin
  select * into h from households where id = p_household_id;
  days_since := greatest(0, p_date - h.bio_anchor_date);
  due_date := h.bio_anchor_date + (floor(days_since / 3.0)::int * 3);
  if due_date < p_date then due_date := due_date + 3; end if;
  week_id := ensure_week(p_household_id, due_date);
  select assigned_member_id into member_id from cleaning_weeks where id = week_id;
  insert into bio_waste_events(household_id, assigned_member_id, scheduled_date)
  values(p_household_id, member_id, due_date)
  on conflict(household_id, scheduled_date) do update set assigned_member_id = excluded.assigned_member_id
  returning id into result_id;
  return result_id;
end; $$;

create or replace function public.seed_default_tasks(p_household_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into cleaning_tasks(household_id, category, title, guideline, sort_order) values
  (p_household_id,'Kitchen','Clean the sink','Remove food residue, rinse, and wipe the sink and tap dry.',10),
  (p_household_id,'Kitchen','Clean the stovetop','Allow it to cool. Use a suitable cleaner and a soft cloth; avoid scratching tools.',20),
  (p_household_id,'Kitchen','Wipe surfaces and table','Clear crumbs and grease, then wipe with an appropriate damp cloth.',30),
  (p_household_id,'Kitchen','Sweep and mop the floor','Sweep first, then mop with a small amount of suitable floor cleaner.',40),
  (p_household_id,'Bathroom','Clean toilet','Clean the bowl, seat, lid, rim, and outside surfaces using separate cloths.',50),
  (p_household_id,'Bathroom','Clean sink and mirror','Remove soap and toothpaste marks, then dry the mirror without streaks.',60),
  (p_household_id,'Bathroom','Clean shower or bathtub','Remove hair and soap residue; rinse and dry wet surfaces.',70),
  (p_household_id,'Bathroom','Mop bathroom floor','Remove loose dirt first and mop from the far corner toward the door.',80),
  (p_household_id,'Shared areas','Vacuum or sweep','Clean hallway and shared-room floors, including visible corners.',90),
  (p_household_id,'Shared areas','Wipe frequently touched surfaces','Clean handles, switches, and other shared touch points.',100),
  (p_household_id,'Waste','Take out plastic waste','Empty the plastic/recycling bin and replace or clean the container if needed.',110),
  (p_household_id,'Waste','Take out general waste','Empty the general waste bin and fit a new bag.',120);
end; $$;

create or replace function public.create_household_with_members(p_household_name text, p_members jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare h_id uuid; code text; item jsonb; signed_email text := lower(coalesce(auth.jwt()->>'email','')); found_signed boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_array_length(p_members) <> 4 then raise exception 'Exactly four roommates are required'; end if;
  if exists (select 1 from jsonb_array_elements(p_members) x group by lower(x->>'email') having count(*) > 1) then raise exception 'Emails must be unique'; end if;
  select exists(select 1 from jsonb_array_elements(p_members) x where lower(x->>'email') = signed_email) into found_signed;
  if not found_signed then raise exception 'Your signed-in email must be included'; end if;
  insert into households(name, created_by) values(trim(p_household_name), auth.uid()) returning id, invite_code into h_id, code;
  for item in select * from jsonb_array_elements(p_members) loop
    insert into household_members(household_id,user_id,display_name,email,rotation_position)
    values(h_id, case when lower(item->>'email') = signed_email then auth.uid() else null end,
      trim(item->>'display_name'), lower(trim(item->>'email')), (item->>'rotation_position')::int);
  end loop;
  perform seed_default_tasks(h_id); perform ensure_week(h_id,current_date); perform ensure_bio_event(h_id,current_date);
  return code;
end; $$;

grant execute on function public.create_household_with_members(text,jsonb) to authenticated;

create or replace function public.get_dashboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare h_id uuid; w cleaning_weeks%rowtype; b bio_waste_events%rowtype; current_member household_members%rowtype; next_member household_members%rowtype; total int; completed int;
begin
  select household_id into h_id from household_members where user_id = auth.uid() or lower(email)=lower(coalesce(auth.jwt()->>'email','')) limit 1;
  if h_id is null then raise exception 'NO_HOUSEHOLD'; end if;
  perform ensure_week(h_id,current_date); perform ensure_bio_event(h_id,current_date);
  select * into w from cleaning_weeks where household_id=h_id and week_start=current_week_start(current_date);
  select * into b from bio_waste_events where household_id=h_id and scheduled_date >= current_date order by scheduled_date limit 1;
  select * into current_member from household_members where id=w.assigned_member_id;
  select * into next_member from household_members where household_id=h_id and rotation_position=((current_member.rotation_position+1)%4);
  select count(*) into total from cleaning_tasks where household_id=h_id and is_active;
  select count(*) into completed from task_completions where cleaning_week_id=w.id;
  return jsonb_build_object(
    'householdId',h_id,'householdName',(select name from households where id=h_id),
    'currentCleaner',to_jsonb(current_member),'nextCleaner',to_jsonb(next_member),
    'weekId',w.id,'weekStart',w.week_start,'deadline',w.deadline,'status',w.status,
    'completedTasks',completed,'totalTasks',total,'nextBioDate',b.scheduled_date,
    'bioCompleted',(b.completed_at is not null)
  );
end; $$;

grant execute on function public.get_dashboard() to authenticated;

create or replace function public.get_week_tasks(p_week_id uuid)
returns table(id uuid, category text, title text, guideline text, sort_order int, completed boolean)
language sql security definer set search_path = public as $$
  select t.id,t.category,t.title,t.guideline,t.sort_order,(c.task_id is not null)
  from cleaning_tasks t join cleaning_weeks w on w.household_id=t.household_id
  left join task_completions c on c.cleaning_week_id=w.id and c.task_id=t.id
  where w.id=p_week_id and is_household_member(w.household_id) and t.is_active
  order by t.sort_order;
$$;
grant execute on function public.get_week_tasks(uuid) to authenticated;

create or replace function public.set_task_completion(p_week_id uuid,p_task_id uuid,p_completed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare h_id uuid; done_count int; total_count int;
begin
  select household_id into h_id from cleaning_weeks where id=p_week_id;
  if not is_household_member(h_id) then raise exception 'Not allowed'; end if;
  if p_completed then insert into task_completions(cleaning_week_id,task_id,completed_by) values(p_week_id,p_task_id,auth.uid()) on conflict do nothing;
  else delete from task_completions where cleaning_week_id=p_week_id and task_id=p_task_id; end if;
  select count(*) into done_count from task_completions where cleaning_week_id=p_week_id;
  select count(*) into total_count from cleaning_tasks where household_id=h_id and is_active;
  update cleaning_weeks set status=case when done_count=0 then 'not_started' when done_count>=total_count then 'completed' else 'in_progress' end,
    completed_at=case when done_count>=total_count then now() else null end where id=p_week_id;
end; $$;
grant execute on function public.set_task_completion(uuid,uuid,boolean) to authenticated;

create or replace function public.complete_current_bio_event(p_household_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare event_id uuid;
begin
  if not is_household_member(p_household_id) then raise exception 'Not allowed'; end if;
  perform ensure_bio_event(p_household_id,current_date);
  select id into event_id from bio_waste_events where household_id=p_household_id and scheduled_date>=current_date order by scheduled_date limit 1;
  update bio_waste_events set completed_at=now(),completed_by=auth.uid() where id=event_id;
  perform ensure_bio_event(p_household_id,(select scheduled_date+3 from bio_waste_events where id=event_id));
end; $$;
grant execute on function public.complete_current_bio_event(uuid) to authenticated;
