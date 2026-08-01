create or replace function public.before_auth_user_delete_cleanup()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.prepare_account_deletion(old.id);
  return old;
end;
$$;

drop trigger if exists before_auth_user_delete_cleanup on auth.users;
create trigger before_auth_user_delete_cleanup
before delete on auth.users
for each row
execute function public.before_auth_user_delete_cleanup();

revoke all on function public.before_auth_user_delete_cleanup() from public, anon, authenticated;
