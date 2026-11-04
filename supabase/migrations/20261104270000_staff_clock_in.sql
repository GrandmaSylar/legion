-- Staff clock-in.
--
-- A fixed screen at the school shows a code that changes every 30 seconds (as numbers and as a QR code that
-- opens the app). A member of staff types it, or scans it, on their own phone to clock in or out. The first
-- phone a person uses is registered as theirs; a different phone, a late arrival, a scan sent in from a phone
-- that was offline and a repeated scan are all recorded and FLAGGED, never refused, so a real arrival is never
-- lost. A school can instead (or as well) name a person, for any dates, to take staff attendance by hand.
-- The secret the codes come from lives in a table nobody can read; every read and write goes through a function.
-- Times are the school's (Africa/Accra).

-- ── Feature and actions ─────────────────────────────────────────────────────
insert into public.app_features (key, label, description, kind, requires, sort) values
  ('clockin', 'Staff clock-in', 'Staff clock in and out with a code that changes every 30 seconds, or an assigned person takes staff attendance by hand.', 'module', '{}', 98);

insert into public.access_capabilities (key, module, action, label, description, sensitive, sort) values
  ('clockin.use', 'clockin', 'use', 'Clock in and out', 'Clock themselves in and out, and see their own record.', false, 1200),
  ('clockin.display', 'clockin', 'display', 'Show the clock-in code', 'Open the screen that shows the changing code.', false, 1210),
  ('clockin.view_all', 'clockin', 'view_all', 'See everyone''s clock-in record', 'See who is in, late or absent, and each person''s times.', false, 1220),
  ('clockin.manage', 'clockin', 'manage', 'Set up clock-in', 'Choose how clock-in works, who takes attendance by hand, and approve staff phones.', false, 1230),
  ('clockin.download', 'clockin', 'download', 'Download the clock-in record', 'Download who was in, late or absent.', false, 1240)
on conflict (key) do nothing;

insert into public.access_preset_capabilities (role, capability)
  select r, 'clockin.use' from unnest(enum_range(null::public.app_role)) as r
  where r in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
  on conflict do nothing;
insert into public.access_preset_capabilities (role, capability) values
  ('school_admin', 'clockin.display'), ('principal', 'clockin.display'), ('receptionist', 'clockin.display'),
  ('school_admin', 'clockin.view_all'), ('principal', 'clockin.view_all'), ('hr_officer', 'clockin.view_all'),
  ('school_admin', 'clockin.manage'), ('principal', 'clockin.manage'),
  ('school_admin', 'clockin.download'), ('principal', 'clockin.download'), ('hr_officer', 'clockin.download')
  on conflict do nothing;
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, p.capability, ur.school_id
  from public.user_roles ur
  join public.access_preset_capabilities p on p.role::text = ur.role::text and p.capability like 'clockin.%'
  on conflict (profile_id, capability) do nothing;

-- ── Tables ──────────────────────────────────────────────────────────────────
-- How the school does it. Holds the secret the codes come from, so it has no read policy at all.
create table public.clockin_settings (
  school_id uuid primary key default public.current_school_id() references public.schools (id),
  mode text not null default 'self' check (mode in ('self', 'taker', 'both')),
  work_start time not null default '07:30',
  grace_minutes int not null default 15 check (grace_minutes between 0 and 120),
  work_end time not null default '15:30',
  secret text not null default (gen_random_uuid()::text || gen_random_uuid()::text),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- The phones a person has used. The first is registered at once; any other waits to be approved and until
-- then its clock-ins are flagged.
create table public.clockin_devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  device_hash text not null,
  label text check (label is null or length(label) <= 80),
  approved boolean not null default false,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (profile_id, device_hash)
);

-- A person chosen to take staff attendance by hand, optionally only between two dates.
create table public.clockin_takers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  from_date date,
  until_date date,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (school_id, profile_id),
  check (until_date is null or from_date is null or until_date >= from_date)
);

create table public.clockin_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  day date not null,
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  source text not null default 'code' check (source in ('code', 'marked')),
  marked_by uuid references public.profiles (id) on delete set null,
  device_id uuid references public.clockin_devices (id) on delete set null,
  flags text[] not null default '{}',
  note text check (note is null or length(note) <= 200)
);
create index on public.clockin_events (school_id, day);
create index on public.clockin_events (profile_id, day);

-- Wrong codes, kept so guessing can be slowed. Nobody reads this table.
create table public.clockin_failures (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now()
);
create index on public.clockin_failures (profile_id, at);

create trigger audit_row after insert or update or delete on public.clockin_settings for each row execute function public.audit_row();
create trigger audit_row after insert or update or delete on public.clockin_takers for each row execute function public.audit_row();
create trigger audit_row after update or delete on public.clockin_devices for each row execute function public.audit_row();

-- ── Who can see what ────────────────────────────────────────────────────────
alter table public.clockin_settings enable row level security;
alter table public.clockin_devices enable row level security;
alter table public.clockin_takers enable row level security;
alter table public.clockin_events enable row level security;
alter table public.clockin_failures enable row level security;

create policy clockin_events_read on public.clockin_events for select to authenticated
  using (school_id = public.current_school_id() and public.feature_enabled('clockin')
         and (profile_id = auth.uid() or public.has_capability('clockin.view_all') or public.has_capability('clockin.manage')));
create policy clockin_devices_read on public.clockin_devices for select to authenticated
  using (school_id = public.current_school_id() and public.feature_enabled('clockin')
         and (profile_id = auth.uid() or public.has_capability('clockin.view_all') or public.has_capability('clockin.manage')));
create policy clockin_devices_delete on public.clockin_devices for delete to authenticated
  using (school_id = public.current_school_id() and (profile_id = auth.uid() or public.has_capability('clockin.manage')));
create policy clockin_takers_read on public.clockin_takers for select to authenticated
  using (school_id = public.current_school_id() and public.feature_enabled('clockin')
         and (profile_id = auth.uid() or public.has_capability('clockin.manage')));

-- ── Helpers ─────────────────────────────────────────────────────────────────
create function public._clockin_today() returns date language sql stable as $$
  select (now() at time zone 'Africa/Accra')::date $$;

create function public._clockin_settings() returns public.clockin_settings
language plpgsql security definer set search_path = public as $$
declare s public.clockin_settings;
begin
  select * into s from public.clockin_settings where school_id = public.current_school_id();
  if not found then
    insert into public.clockin_settings (school_id) values (public.current_school_id()) on conflict do nothing;
    select * into s from public.clockin_settings where school_id = public.current_school_id();
  end if;
  return s;
end $$;

-- The code for one 30-second window: six digits taken from an HMAC of the window number under the school's secret.
create function public._clockin_code(p_secret text, p_window bigint) returns text
language sql immutable set search_path = public, extensions as $$
  select lpad((('x' || encode(substr(hmac(p_window::text, p_secret, 'sha256'), 1, 4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0') $$;

-- Is the signed-in person the one chosen to take staff attendance today? Used by screens and by the
-- policies and functions below, so it stays executable by signed-in users.
create function public.is_clockin_taker() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clockin_takers t
    where t.profile_id = auth.uid() and t.school_id = public.current_school_id()
      and (t.from_date is null or t.from_date <= public._clockin_today())
      and (t.until_date is null or t.until_date >= public._clockin_today())) $$;

create function public._clockin_staff_ok(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p join public.user_roles ur on ur.profile_id = p.id
    where p.id = p_profile and p.school_id = public.current_school_id() and p.is_active
      and ur.role in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')) $$;

-- ── How it is set up ────────────────────────────────────────────────────────
create function public.clockin_config() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.clockin_settings;
begin
  if auth.uid() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  s := public._clockin_settings();
  return jsonb_build_object('mode', s.mode, 'workStart', to_char(s.work_start, 'HH24:MI'), 'graceMinutes', s.grace_minutes,
    'workEnd', to_char(s.work_end, 'HH24:MI'), 'isTaker', public.is_clockin_taker(), 'today', public._clockin_today());
end $$;

create function public.save_clockin_settings(p_mode text, p_work_start time, p_grace int, p_work_end time) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_capability('clockin.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_mode not in ('self', 'taker', 'both') then raise exception 'Choose how staff clock in.' using errcode = 'CLK01'; end if;
  if p_grace not between 0 and 120 then raise exception 'The grace period is 0 to 120 minutes.' using errcode = 'CLK01'; end if;
  if p_work_end <= p_work_start then raise exception 'The day must end after it starts.' using errcode = 'CLK01'; end if;
  perform public._clockin_settings();
  update public.clockin_settings set mode = p_mode, work_start = p_work_start, grace_minutes = p_grace, work_end = p_work_end,
    updated_by = auth.uid(), updated_at = now() where school_id = public.current_school_id();
end $$;

-- A new secret makes every code shown so far useless. For when a photo of the screen has gone astray.
create function public.rotate_clockin_secret() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_capability('clockin.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  perform public._clockin_settings();
  update public.clockin_settings set secret = gen_random_uuid()::text || gen_random_uuid()::text, updated_by = auth.uid(), updated_at = now()
   where school_id = public.current_school_id();
end $$;

-- ── The code on the screen ──────────────────────────────────────────────────
create function public.clockin_current_code() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.clockin_settings; w bigint; e numeric := extract(epoch from now());
begin
  if not public.has_capability('clockin.display') or not public.feature_enabled('clockin') then raise exception 'not allowed' using errcode = '42501'; end if;
  s := public._clockin_settings();
  if s.mode = 'taker' then raise exception 'Clock-in by code is switched off. Staff are marked by hand.' using errcode = 'CLK01'; end if;
  w := floor(e / 30);
  return jsonb_build_object('code', public._clockin_code(s.secret, w), 'expiresIn', ceil((w + 1) * 30 - e)::int, 'windowSeconds', 30);
end $$;

-- ── Clocking in and out ─────────────────────────────────────────────────────
-- Returns {ok, kind, flags} or {ok:false, error}. A wrong code is an answer, not an exception, so that the
-- attempt is kept. Everything odd is a flag, never a refusal.
create function public.clock_in(p_code text, p_kind text, p_device text, p_label text, p_captured_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  me uuid := auth.uid(); s public.clockin_settings; cap timestamptz; w bigint; ok boolean;
  dev public.clockin_devices; hsh text; flags text[] := '{}'; v_kind text := p_kind; last_e public.clockin_events;
  v_day date; v_local time; first_in boolean; had_devices boolean;
begin
  if me is null or not public.has_capability('clockin.use') or not public.feature_enabled('clockin') then raise exception 'not allowed' using errcode = '42501'; end if;
  s := public._clockin_settings();
  if s.mode = 'taker' then raise exception 'Staff do not clock in by code here. Ask the person taking attendance.' using errcode = 'CLK01'; end if;
  if v_kind is not null and v_kind not in ('in', 'out') then raise exception 'Choose in or out.' using errcode = 'CLK01'; end if;
  if length(coalesce(p_device, '')) < 8 then raise exception 'This phone could not be identified.' using errcode = 'CLK01'; end if;
  cap := coalesce(p_captured_at, now());
  if cap > now() + interval '2 minutes' or cap < now() - interval '2 days' then
    return jsonb_build_object('ok', false, 'error', 'That scan is too old to count. Ask the office to mark you in.');
  end if;

  delete from public.clockin_failures where at < now() - interval '1 day';
  if (select count(*) from public.clockin_failures where profile_id = me and at > now() - interval '10 minutes') >= 8 then
    return jsonb_build_object('ok', false, 'error', 'Too many wrong codes. Wait a few minutes and try again.');
  end if;
  w := floor(extract(epoch from cap) / 30);
  ok := p_code = any (array[public._clockin_code(s.secret, w - 1), public._clockin_code(s.secret, w), public._clockin_code(s.secret, w + 1)]);
  if not ok then
    insert into public.clockin_failures (profile_id) values (me);
    return jsonb_build_object('ok', false, 'error', 'That code is wrong or has run out. Look at the screen again.');
  end if;

  -- The phone
  hsh := encode(digest(p_device, 'sha256'), 'hex');
  select * into dev from public.clockin_devices where profile_id = me and device_hash = hsh;
  if not found then
    select exists (select 1 from public.clockin_devices where profile_id = me) into had_devices;
    insert into public.clockin_devices (profile_id, device_hash, label, approved) values (me, hsh, left(p_label, 80), not had_devices) returning * into dev;
  else
    update public.clockin_devices set last_seen = now() where id = dev.id;
  end if;
  if not dev.approved then flags := flags || 'new_device'; end if;
  if now() - cap > interval '90 seconds' then flags := flags || 'offline'; end if;

  v_day := (cap at time zone 'Africa/Accra')::date;
  v_local := (cap at time zone 'Africa/Accra')::time;
  select * into last_e from public.clockin_events where profile_id = me and day = v_day order by captured_at desc limit 1;
  if v_kind is null then
    if last_e.id is null or last_e.kind = 'out' then v_kind := 'in';
    elsif cap - last_e.captured_at < interval '2 minutes' then
      return jsonb_build_object('ok', true, 'kind', 'in', 'duplicate', true, 'flags', to_jsonb(flags));
    else v_kind := 'out'; end if;
  end if;
  if last_e.id is not null and last_e.kind = v_kind then flags := flags || 'repeat'; end if;
  if v_kind = 'out' and last_e.id is null then flags := flags || 'out_without_in'; end if;
  select not exists (select 1 from public.clockin_events where profile_id = me and day = v_day and kind = 'in') into first_in;
  if v_kind = 'in' and first_in and v_local > s.work_start + make_interval(mins => s.grace_minutes) then flags := flags || 'late'; end if;

  insert into public.clockin_events (profile_id, kind, day, captured_at, device_id, flags) values (me, v_kind, v_day, cap, dev.id, flags);
  return jsonb_build_object('ok', true, 'kind', v_kind, 'flags', to_jsonb(flags), 'at', cap);
end $$;

-- ── Taking attendance by hand ───────────────────────────────────────────────
create function public.mark_staff_clock(p_profile uuid, p_day date, p_kind text, p_time time, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.clockin_settings; v_cap timestamptz; flags text[] := '{}'; taker boolean; first_in boolean;
begin
  if not public.feature_enabled('clockin') then raise exception 'not allowed' using errcode = '42501'; end if;
  s := public._clockin_settings();
  taker := s.mode in ('taker', 'both') and public.is_clockin_taker();
  if not (taker or public.has_capability('clockin.manage')) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind not in ('in', 'out') then raise exception 'Choose in or out.' using errcode = 'CLK01'; end if;
  if not public._clockin_staff_ok(p_profile) then raise exception 'Choose a member of staff.' using errcode = 'CLK01'; end if;
  if p_day > public._clockin_today() then raise exception 'You cannot mark a day that has not come.' using errcode = 'CLK01'; end if;
  if not public.has_capability('clockin.manage') and p_day < public._clockin_today() - 14 then
    raise exception 'You can mark up to 14 days back. Ask the head for older days.' using errcode = 'CLK01';
  end if;
  v_cap := (p_day::timestamp + p_time) at time zone 'Africa/Accra';
  select not exists (select 1 from public.clockin_events where profile_id = p_profile and day = p_day and kind = 'in') into first_in;
  if p_kind = 'in' and first_in and p_time > s.work_start + make_interval(mins => s.grace_minutes) then flags := flags || 'late'; end if;
  insert into public.clockin_events (profile_id, kind, day, captured_at, source, marked_by, flags, note)
  values (p_profile, p_kind, p_day, v_cap, 'marked', auth.uid(), flags, nullif(btrim(p_note), ''));
end $$;

-- Remove a hand-marked entry that was a mistake (code scans are never removed).
create function public.remove_marked_clock(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.clockin_events; s public.clockin_settings;
begin
  select * into e from public.clockin_events where id = p_id and school_id = public.current_school_id();
  if not found or e.source <> 'marked' then raise exception 'Only an entry marked by hand can be removed.' using errcode = 'CLK01'; end if;
  s := public._clockin_settings();
  if not (public.has_capability('clockin.manage') or (e.marked_by = auth.uid() and s.mode in ('taker', 'both') and public.is_clockin_taker())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.clockin_events where id = p_id;
end $$;

-- ── The register ────────────────────────────────────────────────────────────
-- One row per weekday and member of staff: first in, last out, the flags, and present, late or absent.
create function public.clockin_roster(p_from date, p_to date)
returns table (day date, profile_id uuid, full_name text, first_in timestamptz, last_out timestamptz, flags text[], events int, status text, marked boolean)
language plpgsql stable security definer set search_path = public as $$
declare s public.clockin_settings;
begin
  if not public.feature_enabled('clockin') then raise exception 'not allowed' using errcode = '42501'; end if;
  s := public._clockin_settings();
  if not (public.has_capability('clockin.view_all') or public.has_capability('clockin.manage')
          or (s.mode in ('taker', 'both') and public.is_clockin_taker())) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_to < p_from or p_to - p_from > 92 then raise exception 'Choose up to 92 days.' using errcode = 'CLK01'; end if;
  if not (public.has_capability('clockin.view_all') or public.has_capability('clockin.manage')) and p_from < public._clockin_today() - 14 then
    raise exception 'You can see up to 14 days back.' using errcode = 'CLK01';
  end if;
  return query
  with staff as (
    select p.id, p.full_name from public.profiles p join public.user_roles ur on ur.profile_id = p.id
     where p.school_id = public.current_school_id() and p.is_active
       and ur.role in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
     group by p.id, p.full_name),
  days as (select d::date as d from generate_series(p_from, least(p_to, public._clockin_today()), interval '1 day') g(d) where extract(isodow from d) <= 5),
  ev as (
    select e.day, e.profile_id, min(e.captured_at) filter (where e.kind = 'in') as fi, max(e.captured_at) filter (where e.kind = 'out') as lo,
           count(*)::int as n, bool_or(e.source = 'marked') as mk,
           coalesce(array_agg(distinct f) filter (where f is not null), '{}') as fl
      from public.clockin_events e left join lateral unnest(e.flags) f on true
     where e.school_id = public.current_school_id() and e.day between p_from and p_to
     group by e.day, e.profile_id)
  select days.d, staff.id, staff.full_name, ev.fi, ev.lo, coalesce(ev.fl, '{}'::text[]), coalesce(ev.n, 0),
         case when ev.n is null then 'absent' when 'late' = any (ev.fl) then 'late' else 'present' end,
         coalesce(ev.mk, false)
    from days cross join staff left join ev on ev.day = days.d and ev.profile_id = staff.id
   order by days.d desc, staff.full_name;
end $$;

-- A person's own events, for their own screen (newest first).
create function public.my_clockin_events(p_days int default 14)
returns table (id uuid, day date, kind text, captured_at timestamptz, flags text[], source text)
language sql stable security definer set search_path = public as $$
  select e.id, e.day, e.kind, e.captured_at, e.flags, e.source from public.clockin_events e
   where e.profile_id = auth.uid() and e.school_id = public.current_school_id() and public.feature_enabled('clockin')
     and e.day >= public._clockin_today() - greatest(1, least(p_days, 92))
   order by e.captured_at desc $$;

-- ── Phones and people who take attendance ───────────────────────────────────
create function public.clockin_devices_list()
returns table (id uuid, profile_id uuid, full_name text, label text, approved boolean, first_seen timestamptz, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.profile_id, p.full_name, d.label, d.approved, d.first_seen, d.last_seen
    from public.clockin_devices d join public.profiles p on p.id = d.profile_id
   where d.school_id = public.current_school_id() and public.feature_enabled('clockin')
     and (d.profile_id = auth.uid() or public.has_capability('clockin.manage') or public.has_capability('clockin.view_all'))
   order by p.full_name, d.first_seen $$;

create function public.set_clockin_device_approved(p_id uuid, p_approved boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_capability('clockin.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.clockin_devices set approved = p_approved where id = p_id and school_id = public.current_school_id();
end $$;

create function public.list_clockin_takers()
returns table (id uuid, profile_id uuid, full_name text, from_date date, until_date date, active boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.profile_id, p.full_name, t.from_date, t.until_date,
         (t.from_date is null or t.from_date <= public._clockin_today()) and (t.until_date is null or t.until_date >= public._clockin_today())
    from public.clockin_takers t join public.profiles p on p.id = t.profile_id
   where t.school_id = public.current_school_id() and public.feature_enabled('clockin')
     and (public.has_capability('clockin.manage') or t.profile_id = auth.uid())
   order by p.full_name $$;

create function public.save_clockin_taker(p_profile uuid, p_from date, p_until date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_capability('clockin.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not public._clockin_staff_ok(p_profile) then raise exception 'Choose a member of staff.' using errcode = 'CLK01'; end if;
  if p_from is not null and p_until is not null and p_until < p_from then raise exception 'The last day cannot be before the first.' using errcode = 'CLK01'; end if;
  insert into public.clockin_takers (profile_id, from_date, until_date) values (p_profile, p_from, p_until)
  on conflict (school_id, profile_id) do update set from_date = excluded.from_date, until_date = excluded.until_date;
end $$;

create function public.remove_clockin_taker(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_capability('clockin.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.clockin_takers where id = p_id and school_id = public.current_school_id();
end $$;

-- ── Lock the functions down ─────────────────────────────────────────────────
revoke execute on function public._clockin_today() from public, anon;
revoke execute on function public._clockin_settings() from public, anon, authenticated;
revoke execute on function public._clockin_code(text, bigint) from public, anon, authenticated;
revoke execute on function public._clockin_staff_ok(uuid) from public, anon, authenticated;
revoke execute on function public.is_clockin_taker() from public, anon;
revoke execute on function public.clockin_config() from public, anon;
revoke execute on function public.save_clockin_settings(text, time, int, time) from public, anon;
revoke execute on function public.rotate_clockin_secret() from public, anon;
revoke execute on function public.clockin_current_code() from public, anon;
revoke execute on function public.clock_in(text, text, text, text, timestamptz) from public, anon;
revoke execute on function public.mark_staff_clock(uuid, date, text, time, text) from public, anon;
revoke execute on function public.remove_marked_clock(uuid) from public, anon;
revoke execute on function public.clockin_roster(date, date) from public, anon;
revoke execute on function public.my_clockin_events(int) from public, anon;
revoke execute on function public.clockin_devices_list() from public, anon;
revoke execute on function public.set_clockin_device_approved(uuid, boolean) from public, anon;
revoke execute on function public.list_clockin_takers() from public, anon;
revoke execute on function public.save_clockin_taker(uuid, date, date) from public, anon;
revoke execute on function public.remove_clockin_taker(uuid) from public, anon;
grant execute on function public._clockin_today() to authenticated;
grant execute on function public.is_clockin_taker() to authenticated;
grant execute on function public.clockin_config() to authenticated;
grant execute on function public.save_clockin_settings(text, time, int, time) to authenticated;
grant execute on function public.rotate_clockin_secret() to authenticated;
grant execute on function public.clockin_current_code() to authenticated;
grant execute on function public.clock_in(text, text, text, text, timestamptz) to authenticated;
grant execute on function public.mark_staff_clock(uuid, date, text, time, text) to authenticated;
grant execute on function public.remove_marked_clock(uuid) to authenticated;
grant execute on function public.clockin_roster(date, date) to authenticated;
grant execute on function public.my_clockin_events(int) to authenticated;
grant execute on function public.clockin_devices_list() to authenticated;
grant execute on function public.set_clockin_device_approved(uuid, boolean) to authenticated;
grant execute on function public.list_clockin_takers() to authenticated;
grant execute on function public.save_clockin_taker(uuid, date, date) to authenticated;
grant execute on function public.remove_clockin_taker(uuid) to authenticated;
