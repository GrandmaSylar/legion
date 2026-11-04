-- A live calendar link a phone can subscribe to.
--
-- Each person who may see the calendar can make a secret link. A phone's calendar app that subscribes to it
-- asks for the link again and again, so new and changed events appear without downloading a file each time.
-- The link carries a random token. Only a hash of the token is kept, so the token can be shown once and never
-- read back (if it is lost, make a new one, which cancels the old). Making a new link, or cancelling it, stops
-- the old one at once.
--
-- The feed holds exactly what that person is allowed to see on the calendar screen, published events only
-- (never drafts), decided by the same rules, run as that person. The public function that serves the feed
-- has no login: the token is the only credential, and it only ever reads this one view.

create table public.calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.calendar_feed_tokens enable row level security;
revoke all on public.calendar_feed_tokens from anon, authenticated;

create function public._calendar_feed_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_school_id() is not null and public.feature_enabled('calendar')
    and (public.has_capability('calendar.view') or public.has_role('parent') or public.has_role('student')) $$;

-- Make (or replace) my link. Returns the token once.
create function public.create_calendar_feed() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null or not public._calendar_feed_ok() then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.calendar_feed_tokens (school_id, profile_id, token_hash)
  values (public.current_school_id(), auth.uid(), encode(digest(v_token, 'sha256'), 'hex'))
  on conflict (profile_id) do update set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
  return v_token;
end $$;

create function public.revoke_calendar_feed() returns void
language sql security definer set search_path = public as $$
  delete from public.calendar_feed_tokens where profile_id = auth.uid() $$;

create function public.calendar_feed_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('exists', true, 'createdAt', created_at, 'lastUsedAt', last_used_at)
                     from public.calendar_feed_tokens where profile_id = auth.uid()), jsonb_build_object('exists', false)) $$;

-- Served by the public function, with the service role only. Takes the hash of the token; returns null when the
-- token is not known or its owner can no longer see the calendar. It briefly acts as that person so the
-- calendar's own rules (feature switch, role, audience) decide what is in it, then puts things back as they were.
create function public.calendar_feed_for_token(p_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.calendar_feed_tokens; v_old_claims text := current_setting('request.jwt.claims', true); v_old_sub text := current_setting('request.jwt.claim.sub', true);
  v_school text; v_events jsonb; v_ok boolean;
begin
  select * into t from public.calendar_feed_tokens where token_hash = p_hash;
  if not found then return null; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', t.profile_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', t.profile_id::text, true);
  begin
    v_ok := public._calendar_feed_ok();
    if v_ok then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'title', e.title, 'description', e.description, 'kind', e.kind, 'startsOn', e.starts_on, 'endsOn', e.ends_on,
               'startsAt', e.starts_at, 'endsAt', e.ends_at, 'audience', e.audience, 'published', true) order by e.starts_on, e.starts_at), '[]'::jsonb)
        into v_events
        from public.calendar_events e
       where e.school_id = t.school_id and e.published and e.starts_on >= current_date - 400
         and (public.has_capability('calendar.view')
              or (e.audience in ('all', 'parents') and public.has_role('parent'))
              or (e.audience = 'all' and public.has_role('student')));
      select name into v_school from public.schools where id = t.school_id;
    end if;
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_old_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(v_old_sub, ''), true);
    raise;
  end;
  perform set_config('request.jwt.claims', coalesce(v_old_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_old_sub, ''), true);
  if not v_ok then return null; end if;
  update public.calendar_feed_tokens set last_used_at = now() where id = t.id;
  return jsonb_build_object('school', v_school, 'events', v_events);
end $$;

revoke execute on function public._calendar_feed_ok() from public, anon;
revoke execute on function public.create_calendar_feed() from public, anon;
revoke execute on function public.revoke_calendar_feed() from public, anon;
revoke execute on function public.calendar_feed_status() from public, anon;
revoke execute on function public.calendar_feed_for_token(text) from public, anon, authenticated;
grant execute on function public._calendar_feed_ok() to authenticated;
grant execute on function public.create_calendar_feed() to authenticated;
grant execute on function public.revoke_calendar_feed() to authenticated;
grant execute on function public.calendar_feed_status() to authenticated;
grant execute on function public.calendar_feed_for_token(text) to service_role;
