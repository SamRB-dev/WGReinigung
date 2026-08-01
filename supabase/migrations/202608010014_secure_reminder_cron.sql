do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='wg-clean-reminder-cron-secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'wg-clean-reminder-cron-secret',
      'Authenticates pg_cron calls to the WG Clean reminder Edge Function'
    );
  end if;
end;
$$;

create or replace function public.verify_reminder_cron_secret(p_secret text)
returns boolean
language sql
security definer
set search_path=public,vault
as $$
  select exists(
    select 1 from vault.decrypted_secrets
    where name='wg-clean-reminder-cron-secret'
      and decrypted_secret=p_secret
  );
$$;
revoke all on function public.verify_reminder_cron_secret(text) from public,anon,authenticated;
grant execute on function public.verify_reminder_cron_secret(text) to service_role;

create or replace function public.invoke_wg_clean_reminders()
returns void
language plpgsql
security definer
set search_path=public,vault,extensions
as $$
declare secret_value text;
begin
  select decrypted_secret into secret_value
  from vault.decrypted_secrets
  where name='wg-clean-reminder-cron-secret'
  limit 1;

  if secret_value is null then
    raise exception 'WG Clean reminder cron secret is missing';
  end if;

  perform net.http_post(
    url := 'https://xjpworpvuwlibrtbqioe.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret',secret_value
    ),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function public.invoke_wg_clean_reminders() from public,anon,authenticated;


do $$
begin
  if exists(select 1 from cron.job where jobname='wg-clean-push-reminders') then
    perform cron.unschedule('wg-clean-push-reminders');
  end if;
end;
$$;

select cron.schedule(
  'wg-clean-push-reminders',
  '0 * * * *',
  $$select public.invoke_wg_clean_reminders();$$
);
