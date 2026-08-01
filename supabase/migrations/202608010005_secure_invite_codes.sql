create table if not exists public.household_member_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.household_member_invites enable row level security;

create policy "admins read household invites" on public.household_member_invites
for select using (public.is_household_admin(household_id));

create or replace function public.add_household_member(p_display_name text, p_email text)
returns uuid language plpgsql security definer set search_path=public as $$
declare h_id uuid; new_id uuid; next_position int;
begin
  select household_id into h_id from household_members where user_id=auth.uid() and is_admin=true limit 1;
  if h_id is null then raise exception 'Admin access required'; end if;
  if trim(p_display_name)='' or trim(p_email)='' then raise exception 'Name and email are required'; end if;
  if exists(select 1 from household_members where household_id=h_id and lower(email)=lower(trim(p_email))) then raise exception 'This email is already in the household'; end if;
  select coalesce(max(rotation_position),-1)+1 into next_position from household_members where household_id=h_id;
  insert into household_members(household_id,display_name,email,rotation_position,is_admin)
  values(h_id,trim(p_display_name),lower(trim(p_email)),next_position,false) returning id into new_id;
  return new_id;
end; $$;
grant execute on function public.add_household_member(text,text) to authenticated;

create or replace function public.create_member_invite(p_member_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare h_id uuid; raw_code text;
begin
  select household_id into h_id from household_members where user_id=auth.uid() and is_admin=true limit 1;
  if h_id is null then raise exception 'Admin access required'; end if;
  if not exists(select 1 from household_members where id=p_member_id and household_id=h_id and user_id is null) then raise exception 'Member is not available for invitation'; end if;
  update household_member_invites set revoked_at=now() where member_id=p_member_id and accepted_at is null and revoked_at is null;
  raw_code := upper(substr(encode(gen_random_bytes(8),'hex'),1,4)||'-'||substr(encode(gen_random_bytes(8),'hex'),1,4)||'-'||substr(encode(gen_random_bytes(8),'hex'),1,4));
  insert into household_member_invites(household_id,member_id,code_hash,created_by)
  values(h_id,p_member_id,encode(digest(raw_code,'sha256'),'hex'),auth.uid());
  return raw_code;
end; $$;
grant execute on function public.create_member_invite(uuid) to authenticated;

create or replace function public.revoke_member_invite(p_member_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare h_id uuid;
begin
  select household_id into h_id from household_members where user_id=auth.uid() and is_admin=true limit 1;
  if h_id is null then raise exception 'Admin access required'; end if;
  update household_member_invites set revoked_at=now()
  where member_id=p_member_id and household_id=h_id and accepted_at is null and revoked_at is null;
end; $$;
grant execute on function public.revoke_member_invite(uuid) to authenticated;

create or replace function public.join_household_with_invite(p_code text)
returns void language plpgsql security definer set search_path=public as $$
declare invite household_member_invites%rowtype; member household_members%rowtype; signed_email text:=lower(coalesce(auth.jwt()->>'email',''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from household_members where user_id=auth.uid()) then raise exception 'You already belong to a household'; end if;
  select * into invite from household_member_invites
  where code_hash=encode(digest(upper(trim(p_code)),'sha256'),'hex')
    and accepted_at is null and revoked_at is null and expires_at>now()
  limit 1;
  if invite.id is null then raise exception 'Invite code is invalid, expired, or revoked'; end if;
  select * into member from household_members where id=invite.member_id;
  if lower(member.email)<>signed_email then raise exception 'This invite was created for a different email address'; end if;
  update household_members set user_id=auth.uid() where id=member.id and user_id is null;
  if not found then raise exception 'This household place has already been claimed'; end if;
  update household_member_invites set accepted_at=now() where id=invite.id;
end; $$;
grant execute on function public.join_household_with_invite(text) to authenticated;

create or replace function public.get_household_members()
returns table(id uuid,user_id uuid,display_name text,email text,rotation_position int,is_admin boolean,is_active boolean)
language plpgsql security definer set search_path=public as $$
declare h_id uuid;
begin
  select household_id into h_id from household_members where user_id=auth.uid() limit 1;
  if h_id is null then raise exception 'NO_HOUSEHOLD'; end if;
  return query select m.id,m.user_id,m.display_name,m.email,m.rotation_position,m.is_admin,true from household_members m where m.household_id=h_id order by m.rotation_position;
end; $$;
grant execute on function public.get_household_members() to authenticated;
