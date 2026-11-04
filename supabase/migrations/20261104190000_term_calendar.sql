-- The term calendar: events for the school year that staff and parents can see.
--
-- An event is a date (or a run of days) with an optional time, a kind, who it is for, and whether it
-- is published. Drafts are seen only by people who manage the calendar. Once published, staff see
-- every event, parents see events for everyone or for parents, and students see events for everyone.
--
-- Copying a term's events to a new term shifts them by the difference between the two start dates and
-- makes them drafts. Publishing a whole term is one action that tells staff and parents once, not
-- once per event.

-- ── Feature and actions ─────────────────────────────────────────────────────
insert into public.app_features (key, label, description, kind, requires, sort) values
  ('calendar', 'Term calendar', 'Dates for the term: events, holidays, exams and deadlines, shown to staff and parents and downloadable.', 'module', '{}', 95);

insert into public.access_capabilities (key, module, action, label, description, sensitive, sort) values
  ('calendar.view', 'calendar', 'view', 'See the calendar', 'See published events for the term.', false, 1000),
  ('calendar.manage', 'calendar', 'manage', 'Add, change and publish events', 'Add and edit events, copy a term''s events to a new term, and publish them.', false, 1010),
  ('calendar.download', 'calendar', 'download', 'Download the calendar', 'Download the calendar as a list or a picture.', false, 1020)
on conflict (key) do nothing;

insert into public.access_preset_capabilities (role, capability)
  select r, 'calendar.view' from unnest(enum_range(null::public.app_role)) as r
  where r in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
  on conflict do nothing;
insert into public.access_preset_capabilities (role, capability) values
  ('school_admin', 'calendar.manage'), ('principal', 'calendar.manage'),
  ('school_admin', 'calendar.download'), ('principal', 'calendar.download'),
  ('teacher', 'calendar.download'), ('receptionist', 'calendar.download')
  on conflict do nothing;

-- Everyone who already holds one of these jobs keeps working the same way.
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, p.capability, ur.school_id
  from public.user_roles ur
  join public.access_preset_capabilities p on p.role::text = ur.role::text and p.capability like 'calendar.%'
  on conflict (profile_id, capability) do nothing;

-- ── Events ──────────────────────────────────────────────────────────────────
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text check (description is null or length(description) <= 500),
  kind text not null default 'event' check (kind in ('event', 'holiday', 'exam', 'meeting', 'deadline', 'trip')),
  starts_on date not null,
  ends_on date not null,
  starts_at time,
  ends_at time,
  audience text not null default 'all' check (audience in ('all', 'staff', 'parents')),
  published boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on <= starts_on + 120),
  check (ends_at is null or starts_at is not null)
);
create index on public.calendar_events (school_id, starts_on);

create trigger set_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.calendar_events
  for each row execute function public.audit_row();

alter table public.calendar_events enable row level security;

create policy calendar_events_read on public.calendar_events for select to authenticated
  using (
    school_id = public.current_school_id() and public.feature_enabled('calendar') and (
      public.has_capability('calendar.manage')
      or (published and (
            public.has_capability('calendar.view')
            or (audience in ('all', 'parents') and public.has_role('parent'))
            or (audience = 'all' and public.has_role('student'))
      ))
    )
  );
create policy calendar_events_insert on public.calendar_events for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('calendar.manage'));
create policy calendar_events_update on public.calendar_events for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('calendar.manage'))
  with check (school_id = public.current_school_id() and public.has_capability('calendar.manage'));
create policy calendar_events_delete on public.calendar_events for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('calendar.manage'));

-- ── Copy a term's events into a new term, as drafts ─────────────────────────
-- Events that overlap the old window move by the difference between the two start dates. An event
-- that already exists in the new window with the same title and date is not copied twice.
create function public.copy_calendar_events(p_from_start date, p_from_end date, p_to_start date)
returns int
language plpgsql security invoker set search_path = public as $$
declare shift int; n int;
begin
  if not public.has_capability('calendar.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from_end < p_from_start or p_from_end - p_from_start > 400 then
    raise exception 'that date range is not valid' using errcode = '22023';
  end if;
  shift := p_to_start - p_from_start;
  insert into public.calendar_events (title, description, kind, starts_on, ends_on, starts_at, ends_at, audience, published)
  select e.title, e.description, e.kind, e.starts_on + shift, e.ends_on + shift, e.starts_at, e.ends_at, e.audience, false
  from public.calendar_events e
  where e.school_id = public.current_school_id()
    and e.starts_on <= p_from_end and e.ends_on >= p_from_start
    and not exists (
      select 1 from public.calendar_events x
      where x.school_id = e.school_id and x.title = e.title and x.starts_on = e.starts_on + shift
    );
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.copy_calendar_events(date, date, date) from public, anon;
grant execute on function public.copy_calendar_events(date, date, date) to authenticated;

-- ── Publish a whole term and tell people once ───────────────────────────────
insert into public.notification_events (key, label, description, feature, sort) values
  ('calendar_published', 'The calendar is published', 'Tell staff and parents once when new events are published, not once per event.', 'calendar', 50);

create function public.publish_calendar_events(p_from date, p_to date)
returns int
language plpgsql security definer set search_path = public as $$
declare n int; sch uuid := public.current_school_id(); staff_ids uuid[]; parent_ids uuid[];
begin
  if not public.has_capability('calendar.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'that date range is not valid' using errcode = '22023';
  end if;
  update public.calendar_events set published = true
   where school_id = sch and not published and starts_on <= p_to and ends_on >= p_from;
  get diagnostics n = row_count;
  if n = 0 then return 0; end if;

  -- Telling people is best effort: the events are published whether or not this works.
  begin
    select array_agg(distinct ur.profile_id) into staff_ids from public.user_roles ur
     where ur.school_id = sch and ur.role in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist');
    select array_agg(distinct ur.profile_id) into parent_ids from public.user_roles ur
     where ur.school_id = sch and ur.role = 'parent';
    perform public.notify_profiles(
      sch, 'calendar_published', array_remove(coalesce(staff_ids, '{}') || coalesce(parent_ids, '{}'), auth.uid()),
      'The calendar has been updated',
      format('%s new %s published. Open the calendar to see the dates.', n, case when n = 1 then 'event was' else 'events were' end),
      '/calendar');
  exception when others then
    raise warning 'calendar publish notification failed: %', sqlerrm;
  end;
  return n;
end $$;
revoke execute on function public.publish_calendar_events(date, date) from public, anon;
grant execute on function public.publish_calendar_events(date, date) to authenticated;
