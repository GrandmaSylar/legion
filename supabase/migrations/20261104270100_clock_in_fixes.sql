-- Two fixes to staff clock-in, found by its tests.
--
-- Adding a flag to the list with || was read as an array literal and failed, so no flagged clock-in
-- (a new phone, late, offline, a repeat) could be saved; array_append is used instead.
-- The set-up (times and mode) was readable by any signed-in person, parents included; it now needs a
-- clock-in action or the job of taking attendance.

create or replace function public.clock_in(p_code text, p_kind text, p_device text, p_label text, p_captured_at timestamptz default null)
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
  if not dev.approved then flags := array_append(flags, 'new_device'); end if;
  if now() - cap > interval '90 seconds' then flags := array_append(flags, 'offline'); end if;

  v_day := (cap at time zone 'Africa/Accra')::date;
  v_local := (cap at time zone 'Africa/Accra')::time;
  select * into last_e from public.clockin_events where profile_id = me and day = v_day order by captured_at desc limit 1;
  if v_kind is null then
    if last_e.id is null or last_e.kind = 'out' then v_kind := 'in';
    elsif cap - last_e.captured_at < interval '2 minutes' then
      return jsonb_build_object('ok', true, 'kind', 'in', 'duplicate', true, 'flags', to_jsonb(flags));
    else v_kind := 'out'; end if;
  end if;
  if last_e.id is not null and last_e.kind = v_kind then flags := array_append(flags, 'repeat'); end if;
  if v_kind = 'out' and last_e.id is null then flags := array_append(flags, 'out_without_in'); end if;
  select not exists (select 1 from public.clockin_events where profile_id = me and day = v_day and kind = 'in') into first_in;
  if v_kind = 'in' and first_in and v_local > s.work_start + make_interval(mins => s.grace_minutes) then flags := array_append(flags, 'late'); end if;

  insert into public.clockin_events (profile_id, kind, day, captured_at, device_id, flags) values (me, v_kind, v_day, cap, dev.id, flags);
  return jsonb_build_object('ok', true, 'kind', v_kind, 'flags', to_jsonb(flags), 'at', cap);
end $$;

create or replace function public.mark_staff_clock(p_profile uuid, p_day date, p_kind text, p_time time, p_note text) returns void
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
  if p_kind = 'in' and first_in and p_time > s.work_start + make_interval(mins => s.grace_minutes) then flags := array_append(flags, 'late'); end if;
  insert into public.clockin_events (profile_id, kind, day, captured_at, source, marked_by, flags, note)
  values (p_profile, p_kind, p_day, v_cap, 'marked', auth.uid(), flags, nullif(btrim(p_note), ''));
end $$;

create or replace function public.clockin_config() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.clockin_settings;
begin
  if auth.uid() is null or not (public.has_capability('clockin.use') or public.has_capability('clockin.view_all') or public.has_capability('clockin.manage')
                                 or public.has_capability('clockin.display') or public.is_clockin_taker()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  s := public._clockin_settings();
  return jsonb_build_object('mode', s.mode, 'workStart', to_char(s.work_start, 'HH24:MI'), 'graceMinutes', s.grace_minutes,
    'workEnd', to_char(s.work_end, 'HH24:MI'), 'isTaker', public.is_clockin_taker(), 'today', public._clockin_today());
end $$;
