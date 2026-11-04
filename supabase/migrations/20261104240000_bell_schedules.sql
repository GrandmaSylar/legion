-- The school day: a school defines its periods and breaks once, and its timetables follow.
--
-- Schools do not all run the same number of periods in a day, or periods of the same length. A bell
-- schedule is a named list of periods and breaks with real start and end times (for example "Standard
-- day": eight 40-minute lessons with a break after the second and the fifth). A schedule is given to
-- each weekday, and a level may have different days from the rest of the school (nursery finishes
-- early; Friday is shorter). Applying the schedule to a class lays out its timetable slots. A subject
-- already placed in a slot stays where it is, so reapplying after a change never wipes out work.
--
-- Nothing changes for an existing timetable until a school applies a schedule.

-- ── The action ──────────────────────────────────────────────────────────────
insert into public.access_capabilities (key, module, action, label, description, sensitive, sort) values
  ('timetable.manage_schedule', 'timetable', 'manage_schedule', 'Set up the school day',
   'Define the periods and breaks of the school day and which levels and days use which.', false, 520)
on conflict (key) do nothing;
insert into public.access_preset_capabilities (role, capability) values
  ('school_admin', 'timetable.manage_schedule'), ('principal', 'timetable.manage_schedule')
on conflict do nothing;
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, 'timetable.manage_schedule', ur.school_id from public.user_roles ur
  where ur.role in ('school_admin', 'principal')
on conflict (profile_id, capability) do nothing;

-- ── Schedules, their periods, and who uses which ────────────────────────────
create table public.bell_schedules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  name text not null check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table public.bell_periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  schedule_id uuid not null references public.bell_schedules (id) on delete cascade,
  position int not null,
  label text not null check (length(btrim(label)) between 1 and 40),
  kind text not null check (kind in ('lesson', 'break')),
  starts_at time not null,
  ends_at time not null,
  check (starts_at < ends_at),
  unique (schedule_id, position) deferrable initially deferred
);
create index on public.bell_periods (schedule_id);

-- Which schedule a weekday uses: for the whole school (level is null) or for one level.
create table public.bell_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  level_id uuid references public.levels (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 5),
  schedule_id uuid not null references public.bell_schedules (id) on delete restrict
);
create unique index bell_assignments_school_day on public.bell_assignments (school_id, day_of_week) where level_id is null;
create unique index bell_assignments_level_day on public.bell_assignments (school_id, level_id, day_of_week) where level_id is not null;

create trigger set_updated_at before update on public.bell_schedules
  for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.bell_schedules
  for each row execute function public.audit_row();
create trigger audit_row after insert or update or delete on public.bell_assignments
  for each row execute function public.audit_row();

alter table public.bell_schedules enable row level security;
alter table public.bell_periods enable row level security;
alter table public.bell_assignments enable row level security;
-- Everyone who works with timetables can read them. Nobody writes them directly: see save_bell_schedule.
create policy bell_schedules_read on public.bell_schedules for select to authenticated
  using (school_id = public.current_school_id() and public.has_any_capability(
    array['timetable.view', 'timetable.edit', 'timetable.edit_own_classes', 'timetable.manage_schedule']));
create policy bell_periods_read on public.bell_periods for select to authenticated
  using (school_id = public.current_school_id() and public.has_any_capability(
    array['timetable.view', 'timetable.edit', 'timetable.edit_own_classes', 'timetable.manage_schedule']));
create policy bell_assignments_read on public.bell_assignments for select to authenticated
  using (school_id = public.current_school_id() and public.has_any_capability(
    array['timetable.view', 'timetable.edit', 'timetable.edit_own_classes', 'timetable.manage_schedule']));

-- ── A slot is a lesson (with or without a subject yet) or a break ───────────
alter table public.timetable_slots add column kind text not null default 'lesson' check (kind in ('lesson', 'break'));
update public.timetable_slots set kind = 'break' where class_subject_id is null;
alter table public.timetable_slots add constraint timetable_slots_break_has_no_subject check (kind = 'lesson' or class_subject_id is null);

-- A slot that holds a subject is a lesson, whatever the caller said.
create function public.timetable_slots_kind() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.class_subject_id is not null then new.kind := 'lesson'; end if;
  return new;
end $$;
create trigger timetable_slots_kind before insert or update on public.timetable_slots
  for each row execute function public.timetable_slots_kind();

-- ── Saving a schedule with its periods ──────────────────────────────────────
-- p_periods: [{label, kind, start, end}] with times as HH:MM. Periods may not overlap, there must be at
-- least one lesson, and there can be at most 20 periods and breaks in a day.
create function public.save_bell_schedule(p_id uuid, p_name text, p_periods jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid := public.current_school_id();
  v_id uuid;
  r record;
  v_n int;
begin
  if not public.has_capability('timetable.manage_schedule') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'Give the schedule a name.' using errcode = 'TTB01';
  end if;
  if jsonb_typeof(p_periods) is distinct from 'array' or jsonb_array_length(p_periods) not between 1 and 20 then
    raise exception 'A school day needs between 1 and 20 periods and breaks.' using errcode = 'TTB01';
  end if;

  for r in
    select x.label, x.kind, x.st, x.en, lag(x.en) over (order by x.st, x.en) as prev_en
    from (
      select btrim(coalesce(e->>'label', '')) as label, coalesce(e->>'kind', 'lesson') as kind,
             (e->>'start')::time as st, (e->>'end')::time as en
      from jsonb_array_elements(p_periods) e
    ) x
    order by x.st, x.en
  loop
    if length(r.label) not between 1 and 40 then raise exception 'Every period needs a name.' using errcode = 'TTB01'; end if;
    if r.kind not in ('lesson', 'break') then raise exception 'Each period is a lesson or a break.' using errcode = 'TTB01'; end if;
    if r.st is null or r.en is null or r.st >= r.en then
      raise exception '"%" must end after it starts.', r.label using errcode = 'TTB01';
    end if;
    if r.prev_en is not null and r.st < r.prev_en then
      raise exception '"%" starts before the one before it has finished.', r.label using errcode = 'TTB01';
    end if;
  end loop;
  select count(*) into v_n from jsonb_array_elements(p_periods) e where coalesce(e->>'kind', 'lesson') = 'lesson';
  if v_n = 0 then raise exception 'A school day needs at least one lesson.' using errcode = 'TTB01'; end if;

  if p_id is null then
    insert into public.bell_schedules (school_id, name) values (v_school, btrim(p_name)) returning id into v_id;
  else
    update public.bell_schedules set name = btrim(p_name) where id = p_id and school_id = v_school returning id into v_id;
    if v_id is null then raise exception 'That schedule was not found.' using errcode = 'TTB01'; end if;
    delete from public.bell_periods where schedule_id = v_id;
  end if;

  insert into public.bell_periods (school_id, schedule_id, position, label, kind, starts_at, ends_at)
  select v_school, v_id, row_number() over (order by st, en), label, kind, st, en
  from (
    select btrim(e->>'label') as label, coalesce(e->>'kind', 'lesson') as kind, (e->>'start')::time as st, (e->>'end')::time as en
    from jsonb_array_elements(p_periods) e
  ) y;
  return v_id;
end $$;

create function public.delete_bell_schedule(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_capability('timetable.manage_schedule') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.bell_assignments where schedule_id = p_id) then
    raise exception 'Some days still use this schedule. Choose another for them first.' using errcode = 'TTB01';
  end if;
  delete from public.bell_schedules where id = p_id and school_id = public.current_school_id();
  if not found then raise exception 'That schedule was not found.' using errcode = 'TTB01'; end if;
end $$;

-- Choose the schedule a weekday uses, for the whole school (no level) or for one level. No schedule removes the choice.
create function public.set_bell_assignment(p_level uuid, p_day int, p_schedule uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_school uuid := public.current_school_id();
begin
  if not public.has_capability('timetable.manage_schedule') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_day not between 1 and 5 then raise exception 'Choose a day from Monday to Friday.' using errcode = 'TTB01'; end if;
  if p_level is not null and not exists (select 1 from public.levels where id = p_level and school_id = v_school) then
    raise exception 'That level was not found.' using errcode = 'TTB01';
  end if;
  if p_schedule is not null and not exists (select 1 from public.bell_schedules where id = p_schedule and school_id = v_school) then
    raise exception 'That schedule was not found.' using errcode = 'TTB01';
  end if;

  delete from public.bell_assignments
   where school_id = v_school and day_of_week = p_day and level_id is not distinct from p_level;
  if p_schedule is not null then
    insert into public.bell_assignments (school_id, level_id, day_of_week, schedule_id) values (v_school, p_level, p_day, p_schedule);
  end if;
end $$;

-- ── Laying a class's timetable out from the school day ──────────────────────
-- For each weekday that has a schedule (the level's own, else the school's): periods the class does not have
-- are added empty; a slot at the same start time takes the period's end time and name but keeps its
-- subject; an empty slot that matches no period is removed. A slot that holds a subject but matches no
-- period is kept and counted, so the person can decide. Days with no schedule are left alone.
create function public.apply_bell_schedule(p_class uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_school uuid := public.current_school_id();
  v_level uuid;
  d int;
  sch uuid;
  v_created int := 0;
  v_removed int := 0;
  v_off int := 0;
  n int;
begin
  select c.level_id into v_level from public.classes c where c.id = p_class and c.school_id = v_school;
  if v_level is null then raise exception 'That class was not found.' using errcode = 'TTB01'; end if;
  if not (public.has_capability('timetable.edit')
          or (public.has_capability('timetable.edit_own_classes') and public.teaches_class(p_class))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  for d in 1..5 loop
    sch := coalesce(
      (select a.schedule_id from public.bell_assignments a where a.school_id = v_school and a.level_id = v_level and a.day_of_week = d),
      (select a.schedule_id from public.bell_assignments a where a.school_id = v_school and a.level_id is null and a.day_of_week = d));
    continue when sch is null;

    with gone as (
      delete from public.timetable_slots s
       where s.class_id = p_class and s.day_of_week = d and s.class_subject_id is null
         and not exists (select 1 from public.bell_periods bp
                          where bp.schedule_id = sch and bp.starts_at = s.start_time and bp.ends_at = s.end_time and bp.kind = s.kind)
      returning 1)
    select count(*) into n from gone;
    v_removed := v_removed + n;

    with up as (
      insert into public.timetable_slots (school_id, class_id, day_of_week, start_time, end_time, label, kind)
      select v_school, p_class, d, bp.starts_at, bp.ends_at, bp.label, bp.kind
        from public.bell_periods bp where bp.schedule_id = sch
      on conflict (class_id, day_of_week, start_time) do update
        set end_time = excluded.end_time, kind = excluded.kind,
            label = case when public.timetable_slots.class_subject_id is null then excluded.label else public.timetable_slots.label end
        where public.timetable_slots.class_subject_id is null or excluded.kind = 'lesson'
      returning (xmax = 0) as fresh)
    select count(*) filter (where fresh) into n from up;
    v_created := v_created + n;

    select count(*) into n from public.timetable_slots s
     where s.class_id = p_class and s.day_of_week = d and s.class_subject_id is not null
       and not exists (select 1 from public.bell_periods bp
                        where bp.schedule_id = sch and bp.starts_at = s.start_time and bp.ends_at = s.end_time and bp.kind = 'lesson');
    v_off := v_off + n;
  end loop;
  return jsonb_build_object('created', v_created, 'removed', v_removed, 'offSchedule', v_off);
end $$;

-- Apply the school day to every class of the current academic year.
create function public.apply_bell_schedule_to_all() returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  c uuid;
  r jsonb;
  v_classes int := 0; v_created int := 0; v_removed int := 0; v_off int := 0;
begin
  if not public.has_capability('timetable.manage_schedule') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for c in
    select cl.id from public.classes cl join public.academic_years y on y.id = cl.academic_year_id
     where cl.school_id = public.current_school_id() and y.is_current
  loop
    r := public.apply_bell_schedule(c);
    v_classes := v_classes + 1;
    v_created := v_created + (r->>'created')::int;
    v_removed := v_removed + (r->>'removed')::int;
    v_off := v_off + (r->>'offSchedule')::int;
  end loop;
  return jsonb_build_object('classes', v_classes, 'created', v_created, 'removed', v_removed, 'offSchedule', v_off);
end $$;

-- Give the empty lessons of a class their subjects, in turn (alphabetically by subject). Slots that already
-- hold a subject, and breaks, are not touched. Returns how many lessons were filled.
create function public.fill_class_subjects(p_class uuid) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if not (public.has_capability('timetable.edit')
          or (public.has_capability('timetable.edit_own_classes') and public.teaches_class(p_class))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  with subs as (
    select cs.id, row_number() over (order by sub.name, cs.id) - 1 as rn
    from public.class_subjects cs join public.subjects sub on sub.id = cs.subject_id where cs.class_id = p_class
  ),
  total as (select count(*) as c from subs),
  empties as (
    select s.id, row_number() over (order by s.day_of_week, s.start_time) - 1 as rn
    from public.timetable_slots s where s.class_id = p_class and s.kind = 'lesson' and s.class_subject_id is null
  ),
  filled as (
    update public.timetable_slots t
       set class_subject_id = (select id from subs where rn = e.rn % (select c from total))
      from empties e
     where t.id = e.id and (select c from total) > 0
    returning 1)
  select count(*) into n from filled;
  return n;
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function public.save_bell_schedule(uuid, text, jsonb) from public, anon;
revoke execute on function public.delete_bell_schedule(uuid) from public, anon;
revoke execute on function public.set_bell_assignment(uuid, int, uuid) from public, anon;
revoke execute on function public.apply_bell_schedule(uuid) from public, anon;
revoke execute on function public.apply_bell_schedule_to_all() from public, anon;
revoke execute on function public.fill_class_subjects(uuid) from public, anon;
revoke execute on function public.timetable_slots_kind() from public, anon, authenticated;
grant execute on function public.save_bell_schedule(uuid, text, jsonb) to authenticated;
grant execute on function public.delete_bell_schedule(uuid) to authenticated;
grant execute on function public.set_bell_assignment(uuid, int, uuid) to authenticated;
grant execute on function public.apply_bell_schedule(uuid) to authenticated;
grant execute on function public.apply_bell_schedule_to_all() to authenticated;
grant execute on function public.fill_class_subjects(uuid) to authenticated;
