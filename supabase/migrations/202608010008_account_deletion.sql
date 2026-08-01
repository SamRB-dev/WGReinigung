alter table public.households alter column created_by drop not null;
alter table public.households drop constraint if exists households_created_by_fkey;
alter table public.households add constraint households_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;

alter table public.task_completions drop constraint if exists task_completions_completed_by_fkey;
alter table public.task_completions add constraint task_completions_completed_by_fkey foreign key (completed_by) references auth.users(id) on delete set null;

alter table public.bio_waste_events drop constraint if exists bio_waste_events_completed_by_fkey;
alter table public.bio_waste_events add constraint bio_waste_events_completed_by_fkey foreign key (completed_by) references auth.users(id) on delete set null;

alter table public.household_member_invites alter column created_by drop not null;
alter table public.household_member_invites drop constraint if exists household_member_invites_created_by_fkey;
alter table public.household_member_invites add constraint household_member_invites_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;

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
  deleted_household boolean := false;
begin
  if p_user_id is null then raise exception 'User id is required'; end if;

  select hm.* into member_row
  from public.household_members hm
  where hm.user_id = p_user_id
  limit 1;

  delete from public.push_tokens where user_id = p_user_id;
  update public.task_completions set completed_by = null where completed_by = p_user_id;
  update public.bio_waste_events set completed_by = null where completed_by = p_user_id;
  update public.household_member_invites set created_by = null where created_by = p_user_id;

  if member_row.id is not null then
    select count(*) into joined_count
    from public.household_members hm
    where hm.household_id = member_row.household_id
      and hm.user_id is not null
      and hm.user_id <> p_user_id;

    if member_row.is_admin and joined_count = 0 then
      delete from public.households where id = member_row.household_id;
      deleted_household := true;
    else
      if member_row.is_admin then
        select hm.* into replacement
        from public.household_members hm
        where hm.household_id = member_row.household_id
          and hm.user_id is not null
          and hm.user_id <> p_user_id
        order by hm.rotation_position
        limit 1;

        if replacement.id is null then
          raise exception 'No joined roommate is available to become household admin';
        end if;

        update public.household_members set is_admin = true where id = replacement.id;
        update public.households set created_by = replacement.user_id where id = member_row.household_id;
      end if;

      update public.household_members
      set user_id = null,
          is_admin = false,
          display_name = 'Former roommate',
          email = 'deleted-' || member_row.id::text || '@removed.invalid'
      where id = member_row.id;
    end if;
  else
    update public.households set created_by = null where created_by = p_user_id;
  end if;

  return jsonb_build_object('ok', true, 'deletedHousehold', deleted_household);
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
