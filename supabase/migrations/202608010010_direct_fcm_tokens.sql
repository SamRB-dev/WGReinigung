alter table public.push_tokens rename column expo_push_token to push_token;
alter table public.push_log rename column expo_push_token to push_token;

alter table public.push_tokens
  add column if not exists provider text not null default 'fcm'
  check (provider in ('fcm'));

-- Existing Expo push tokens cannot be sent through FCM directly. Devices will
-- register a fresh native token the next time the updated app opens.
update public.push_tokens
set is_active = false
where push_token like 'ExponentPushToken[%'
   or push_token like 'ExpoPushToken[%';

drop function if exists public.register_push_token(uuid,text,text,text);
create function public.register_push_token(
  p_household_id uuid,
  p_push_token text,
  p_platform text,
  p_device_name text default null,
  p_provider text default 'fcm'
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_household_member(p_household_id) then raise exception 'Not allowed'; end if;
  if p_platform <> 'android' then raise exception 'Direct FCM registration currently supports Android only'; end if;
  if p_provider <> 'fcm' then raise exception 'Unsupported push provider'; end if;
  if length(trim(p_push_token)) < 20 then raise exception 'Invalid FCM registration token'; end if;

  insert into public.push_tokens(
    household_id,user_id,push_token,platform,device_name,provider,is_active,last_registered_at
  ) values(
    p_household_id,auth.uid(),trim(p_push_token),p_platform,p_device_name,p_provider,true,now()
  )
  on conflict(push_token) do update set
    household_id=excluded.household_id,
    user_id=excluded.user_id,
    platform=excluded.platform,
    device_name=excluded.device_name,
    provider=excluded.provider,
    is_active=true,
    last_registered_at=now();
end;
$$;

grant execute on function public.register_push_token(uuid,text,text,text,text) to authenticated;
