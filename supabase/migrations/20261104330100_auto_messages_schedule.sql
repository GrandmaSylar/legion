-- The scheduler that sends automatic messages.
--
-- About once a minute the database checks whether any automatic message is waiting, and only then asks the
-- messaging function to send them. The call carries a random secret that lives in the database's vault (made
-- here, never shown in the app or in code); the function reads the same secret back from the database and
-- refuses anyone who does not have it. If the scheduler or the vault is not available the migration says so
-- and the rest still works: messages simply stay queued until it is.
--
-- The messaging function must be deployed so that this call, which has no signed-in person, can reach it:
--   supabase functions deploy messaging --use-api --no-verify-jwt
-- (every other path in that function still checks the person's own token).

do $$ begin
  create extension if not exists pg_cron;
exception when others then raise notice 'pg_cron could not be enabled: %', sqlerrm; end $$;
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then raise notice 'pg_net could not be enabled: %', sqlerrm; end $$;

-- A secret only the database and the function know, and the address to call.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    if not exists (select 1 from vault.secrets where name = 'legion_tick_secret') then
      perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'legion_tick_secret', 'Proves a call to the messaging function comes from the database scheduler');
    end if;
    if not exists (select 1 from vault.secrets where name = 'legion_project_url') then
      perform vault.create_secret('https://xipvlmwczocshjhklwvj.supabase.co', 'legion_project_url', 'Where the scheduler sends its calls');
    end if;
  else
    raise notice 'The vault is not available, so the automatic sender has no secret yet.';
  end if;
exception when others then raise notice 'the scheduler secret could not be made: %', sqlerrm; end $$;

-- The function reads the secret back through this (the service role only), to check the caller.
create function public.messaging_tick_secret() returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'legion_tick_secret';
  return v;
exception when others then return null;
end $$;
revoke execute on function public.messaging_tick_secret() from public, anon, authenticated;
grant execute on function public.messaging_tick_secret() to service_role;

-- What the scheduler runs each minute: nothing at all unless something is waiting.
create function public.run_messaging_tick() returns void
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if not exists (select 1 from public.messages where status = 'queued' and kind like 'auto\_%') then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'legion_project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'legion_tick_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url := v_url || '/functions/v1/messaging',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-tick-secret', v_secret), body := '{}'::jsonb, timeout_milliseconds := 110000);
exception when others then
  raise warning 'automatic message tick failed: %', sqlerrm;
end $$;
revoke execute on function public.run_messaging_tick() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'legion-messaging-tick';
    perform cron.schedule('legion-messaging-tick', '* * * * *', 'select public.run_messaging_tick()');
  else
    raise notice 'pg_cron is not available, so nothing is scheduled yet.';
  end if;
exception when others then raise notice 'the schedule could not be made: %', sqlerrm; end $$;

-- For the settings screen: is it wired up, and what has gone out today? (For those who may change settings.)
create function public.auto_message_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ready boolean := false; v_has_secret boolean := false; v_has_job boolean := false;
begin
  if not public.has_capability('settings.edit') then raise exception 'not allowed' using errcode = '42501'; end if;
  begin
    select exists (select 1 from vault.secrets where name = 'legion_tick_secret') into v_has_secret;
    select exists (select 1 from cron.job where jobname = 'legion-messaging-tick' and active) into v_has_job;
  exception when others then null; end;
  v_ready := v_has_secret and v_has_job;
  return jsonb_build_object('scheduled', v_ready,
    'queued', (select count(*) from public.messages where school_id = public.current_school_id() and kind like 'auto\_%' and status = 'queued'),
    'sentToday', (select count(*) from public.messages where school_id = public.current_school_id() and kind like 'auto\_%' and status in ('sent', 'delivered') and created_at::date = current_date),
    'failedToday', (select count(*) from public.messages where school_id = public.current_school_id() and kind like 'auto\_%' and status = 'failed' and created_at::date = current_date),
    'dailyLimit', coalesce((select daily_limit from public.auto_message_settings where school_id = public.current_school_id()), 300));
end $$;
revoke execute on function public.auto_message_status() from public, anon;
grant execute on function public.auto_message_status() to authenticated;
