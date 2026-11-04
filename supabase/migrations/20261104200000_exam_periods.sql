-- Exam periods: a named stretch of the term for mock exams, mid-term tests or the term exam.
--
-- A period has dates, optionally some classes, and two switches that are enforced here:
--   * a window for entering marks. While it is on, a teacher can add or change the marks of
--     assessments linked to the period only between the two dates. Anyone who may enter marks for
--     any class (the head, the exams officer) can still enter them at any time.
--   * showing the period on the calendar, as a draft until the calendar is published.
-- Exam timetables, invigilation duties and report weighting come later, with the timetable,
-- tasks and flexible-assessment work they depend on.

-- ── The action ──────────────────────────────────────────────────────────────
insert into public.access_capabilities (key, module, action, label, description, sensitive, sort) values
  ('grades.manage_exam_periods', 'grades', 'manage_exam_periods', 'Set up exam periods',
   'Create exam periods, choose their classes, and set the window when marks may be entered.', false, 215)
on conflict (key) do nothing;
insert into public.access_preset_capabilities (role, capability) values
  ('school_admin', 'grades.manage_exam_periods'), ('principal', 'grades.manage_exam_periods')
on conflict do nothing;
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, 'grades.manage_exam_periods', ur.school_id from public.user_roles ur
  where ur.role in ('school_admin', 'principal')
on conflict (profile_id, capability) do nothing;

-- ── Periods and their classes ───────────────────────────────────────────────
create table public.exam_periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  term_id uuid not null references public.terms (id),
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null default 'term_exam' check (kind in ('mock', 'mid_term', 'term_exam', 'other')),
  starts_on date not null,
  ends_on date not null,
  all_classes boolean not null default true,
  restrict_entry boolean not null default false,
  entry_opens_on date,
  entry_closes_on date,
  show_on_calendar boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (term_id, name),
  check (ends_on >= starts_on and ends_on <= starts_on + 60),
  check (not restrict_entry or (entry_opens_on is not null and entry_closes_on is not null
         and entry_closes_on >= entry_opens_on and entry_closes_on <= entry_opens_on + 120))
);
create index on public.exam_periods (school_id, starts_on);

create table public.exam_period_classes (
  exam_period_id uuid not null references public.exam_periods (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  school_id uuid not null default public.current_school_id() references public.schools (id),
  primary key (exam_period_id, class_id)
);

create trigger set_updated_at before update on public.exam_periods
  for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.exam_periods
  for each row execute function public.audit_row();

alter table public.exam_periods enable row level security;
alter table public.exam_period_classes enable row level security;

create policy exam_periods_read on public.exam_periods for select to authenticated
  using (school_id = public.current_school_id() and public.has_any_capability(
    array['grades.view', 'grades.enter_own_classes', 'grades.enter_any', 'grades.manage_exam_periods']));
create policy exam_periods_insert on public.exam_periods for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('grades.manage_exam_periods')
              and exists (select 1 from public.terms t where t.id = term_id));
create policy exam_periods_update on public.exam_periods for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('grades.manage_exam_periods'))
  with check (school_id = public.current_school_id() and public.has_capability('grades.manage_exam_periods')
              and exists (select 1 from public.terms t where t.id = term_id));
create policy exam_periods_delete on public.exam_periods for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('grades.manage_exam_periods'));

create policy exam_period_classes_read on public.exam_period_classes for select to authenticated
  using (school_id = public.current_school_id() and public.has_any_capability(
    array['grades.view', 'grades.enter_own_classes', 'grades.enter_any', 'grades.manage_exam_periods']));
create policy exam_period_classes_write on public.exam_period_classes for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('grades.manage_exam_periods'))
  with check (school_id = public.current_school_id() and public.has_capability('grades.manage_exam_periods')
              and exists (select 1 from public.classes c where c.id = class_id)
              and exists (select 1 from public.exam_periods p where p.id = exam_period_id));

-- ── A period appears on the calendar, as a draft ────────────────────────────
alter table public.calendar_events
  add column exam_period_id uuid unique references public.exam_periods (id) on delete cascade;

create function public.exam_period_sync_calendar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.show_on_calendar then
    insert into public.calendar_events (school_id, title, kind, starts_on, ends_on, audience, published, exam_period_id, created_by)
    values (new.school_id, new.name, 'exam', new.starts_on, new.ends_on, 'all', false, new.id, auth.uid())
    on conflict (exam_period_id) do update
      set title = excluded.title, starts_on = excluded.starts_on, ends_on = excluded.ends_on;
  else
    delete from public.calendar_events where exam_period_id = new.id;
  end if;
  return new;
end $$;
create trigger exam_periods_calendar after insert or update on public.exam_periods
  for each row execute function public.exam_period_sync_calendar();

-- ── An assessment can belong to a period ────────────────────────────────────
alter table public.assessments
  add column exam_period_id uuid references public.exam_periods (id) on delete set null;
create index on public.assessments (exam_period_id) where exam_period_id is not null;

create function public.assessments_check_exam_period() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.exam_period_id is null then return new; end if;
  select * into p from public.exam_periods where id = new.exam_period_id;
  if not found or p.school_id <> new.school_id then
    raise exception 'That exam period was not found.' using errcode = 'EXW01';
  end if;
  if p.term_id <> new.term_id then
    raise exception '% is for a different term.', p.name using errcode = 'EXW01';
  end if;
  if not p.all_classes and not exists (
    select 1 from public.exam_period_classes c join public.class_subjects cs on cs.class_id = c.class_id
    where c.exam_period_id = p.id and cs.id = new.class_subject_id
  ) then
    raise exception '% does not include that class.', p.name using errcode = 'EXW01';
  end if;
  return new;
end $$;
create trigger assessments_exam_period before insert or update of exam_period_id, term_id, class_subject_id on public.assessments
  for each row execute function public.assessments_check_exam_period();

-- ── The window for entering marks ───────────────────────────────────────────
-- Applies to adding, changing and removing a mark. People who may enter marks for any class are not held to it.
create function public.exam_window_message(p_assessment uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare p record;
begin
  select ep.name, ep.restrict_entry, ep.entry_opens_on, ep.entry_closes_on into p
    from public.assessments a join public.exam_periods ep on ep.id = a.exam_period_id where a.id = p_assessment;
  if not found or not p.restrict_entry or public.has_capability('grades.enter_any') then return null; end if;
  if current_date < p.entry_opens_on then
    return format('Marks for %s can be entered from %s.', p.name, to_char(p.entry_opens_on, 'FMDD Mon YYYY'));
  end if;
  if current_date > p.entry_closes_on then
    return format('Mark entry for %s closed on %s. Ask the school office to reopen it.', p.name, to_char(p.entry_closes_on, 'FMDD Mon YYYY'));
  end if;
  return null;
end $$;

create function public.scores_exam_window() returns trigger
language plpgsql security definer set search_path = public as $$
declare msg text;
begin
  msg := public.exam_window_message(coalesce(new.assessment_id, old.assessment_id));
  if msg is not null then raise exception '%', msg using errcode = 'EXW01'; end if;
  return coalesce(new, old);
end $$;
create trigger scores_exam_window before insert or update or delete on public.scores
  for each row execute function public.scores_exam_window();

-- Removing an assessment that has marks would remove its marks, so the same window applies.
create function public.assessments_exam_window() returns trigger
language plpgsql security definer set search_path = public as $$
declare msg text;
begin
  if exists (select 1 from public.scores s where s.assessment_id = old.id) then
    msg := public.exam_window_message(old.id);
    if msg is not null then raise exception '%', msg using errcode = 'EXW01'; end if;
  end if;
  return old;
end $$;
create trigger assessments_exam_window before delete on public.assessments
  for each row execute function public.assessments_exam_window();

-- Internal only.
revoke execute on function public.exam_period_sync_calendar() from public, anon, authenticated;
revoke execute on function public.assessments_check_exam_period() from public, anon, authenticated;
revoke execute on function public.exam_window_message(uuid) from public, anon, authenticated;
revoke execute on function public.scores_exam_window() from public, anon, authenticated;
revoke execute on function public.assessments_exam_window() from public, anon, authenticated;
