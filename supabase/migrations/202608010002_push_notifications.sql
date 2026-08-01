create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('android','ios')),
  device_name text,
  is_active boolean not null default true,
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.push_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('weekly','bio')),
  reminder_key text not null,
  expo_push_token text not null,
  status text not null check (status in ('sending','sent','failed')),
  ticket_id text,
  error_message text,
  sent_at timestamptz not null default now(),
  unique (household_id, reminder_type, reminder_key, expo_push_token)
);

alter table public.push_tokens enable row level security;
alter table public.push_log enable row level security;

create policy "users read own push tokens" on public.push_tokens
for select using (user_id = auth.uid());
create policy "users delete own push tokens" on public.push_tokens
for delete using (user_id = auth.uid());

create or replace function public.register_push_token(
  p_household_id uuid,
  p_expo_push_token text,
  p_platform text,
  p_device_name text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_household_member(p_household_id) then raise exception 'Not allowed'; end if;
  if p_expo_push_token !~ '^ExponentPushToken\\[' and p_expo_push_token !~ '^ExpoPushToken\\[' then
    raise exception 'Invalid Expo push token';
  end if;

  insert into public.push_tokens(household_id,user_id,expo_push_token,platform,device_name,is_active,last_registered_at)
  values(p_household_id,auth.uid(),p_expo_push_token,p_platform,p_device_name,true,now())
  on conflict(expo_push_token) do update set
    household_id=excluded.household_id,
    user_id=excluded.user_id,
    platform=excluded.platform,
    device_name=excluded.device_name,
    is_active=true,
    last_registered_at=now();
end; $$;

grant execute on function public.register_push_token(uuid,text,text,text) to authenticated;

-- The Edge Function has JWT verification disabled and performs its own service-role work.
-- Run it hourly; it sends only when the household's local reminder hour matches.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'wg-clean-push-reminders') then
    perform cron.unschedule('wg-clean-push-reminders');
  end if;
end $$;

select cron.schedule(
  'wg-clean-push-reminders',
  '0 * * * *',
  $$
    select net.http_post(
      url := 'https://xjpworpvuwlibrtbqioe.supabase.co/functions/v1/send-reminders',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
