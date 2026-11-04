-- The exam timetable, and report weighting by kind of exam.
--
-- EXAM TIMETABLE. An exam period can have a timetable: a list of papers, each for one class and subject on one
-- day with a start and end time and a room. The database refuses a paper outside the period's dates, for a class
-- not in the period, for a subject the class does not take, or at a time that clashes with another paper for the
-- same class that day. People who set up exam periods build it; invigilators can be given to a paper as ordinary
-- tasks (so they show in Tasks and are ticked off there). A timetable is a DRAFT until it is published; staff see
-- published timetables, and parents and pupils see only the papers for their own class, only once published, and
-- are told. The tables are read only through the functions below, which decide who sees what.
--
-- REPORT WEIGHTING. A mark's weight in the term result is already set by the parts of the school's assessment
-- scheme. A part can now be tied to a KIND of exam (mock, mid-term, term exam): an assessment linked to an exam
-- period of that kind is then put in that part by itself, so the weight lives in one place, the scheme.

-- ── Switches on a period ────────────────────────────────────────────────────
alter table public.exam_periods
  add column use_timetable boolean not null default false,
  add column timetable_published boolean not null default false,
  add check (not timetable_published or use_timetable);

insert into public.notification_events (key, label, description, feature, sort, can_message) values
  ('exam_timetable_published', 'An exam timetable is published', 'Tell the parents and pupils of the classes in it that the timetable is ready.', 'grades', 45, true);

-- ── Papers ──────────────────────────────────────────────────────────────────
create table public.exam_papers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  exam_period_id uuid not null references public.exam_periods (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  exam_date date not null,
  starts_at time not null,
  ends_at time not null,
  room text check (room is null or length(room) <= 60),
  notes text check (notes is null or length(notes) <= 200),
  invigilation_task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_period_id, class_id, subject_id),
  check (ends_at > starts_at)
);
create index on public.exam_papers (school_id, exam_date);
create trigger set_updated_at before update on public.exam_papers for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.exam_papers for each row execute function public.audit_row();
alter table public.exam_papers enable row level security;
revoke all on public.exam_papers from anon, authenticated;

create function public._class_label(p_class uuid) returns text
language sql stable security definer set search_path = public as $$
  select l.name || ' ' || c.section from public.classes c join public.levels l on l.id = c.level_id where c.id = p_class $$;

-- May the signed-in person see this class's papers as a pupil or a pupil's parent?
create function public._exam_class_member(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (public.has_role('parent') or public.has_role('student')) and exists (
    select 1 from public.enrollments e where e.class_id = p_class and public.can_view_enrollment(e.id)) $$;

-- ── Building the timetable ──────────────────────────────────────────────────
create function public.save_exam_paper(
  p_id uuid, p_period uuid, p_class uuid, p_subject uuid, p_date date, p_start time, p_end time, p_room text, p_notes text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_school uuid := public.current_school_id(); p public.exam_periods; v_id uuid; v_clash record; v_old public.exam_papers;
begin
  if v_school is null or not public.has_capability('grades.manage_exam_periods') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into p from public.exam_periods where id = p_period and school_id = v_school;
  if not found then raise exception 'That exam period was not found.' using errcode = 'EXT01'; end if;
  if not p.use_timetable then raise exception 'Switch on the exam timetable for this period first.' using errcode = 'EXT01'; end if;
  if p_date is null or p_date < p.starts_on or p_date > p.ends_on then raise exception 'The paper must be on a day inside the exam period.' using errcode = 'EXT01'; end if;
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'The paper must end after it starts.' using errcode = 'EXT01'; end if;
  if not exists (select 1 from public.classes where id = p_class and school_id = v_school) then raise exception 'Choose a class.' using errcode = 'EXT01'; end if;
  if not p.all_classes and not exists (select 1 from public.exam_period_classes where exam_period_id = p.id and class_id = p_class) then
    raise exception 'That class is not in this exam period.' using errcode = 'EXT01'; end if;
  if not exists (select 1 from public.class_subjects where class_id = p_class and subject_id = p_subject) then
    raise exception 'That class does not take that subject.' using errcode = 'EXT01'; end if;
  if p_id is null and exists (select 1 from public.exam_papers where exam_period_id = p.id and class_id = p_class and subject_id = p_subject) then
    raise exception 'That class already has a paper for that subject in this period. Change it instead.' using errcode = 'EXT01'; end if;
  select ep.*, s.name as sname into v_clash from public.exam_papers ep join public.subjects s on s.id = ep.subject_id
   where ep.class_id = p_class and ep.exam_date = p_date and ep.id is distinct from p_id and ep.starts_at < p_end and ep.ends_at > p_start limit 1;
  if found then
    raise exception '% already has % from % to % that day.', public._class_label(p_class), v_clash.sname, to_char(v_clash.starts_at, 'HH24:MI'), to_char(v_clash.ends_at, 'HH24:MI') using errcode = 'EXT01';
  end if;
  if p_id is null then
    insert into public.exam_papers (exam_period_id, class_id, subject_id, exam_date, starts_at, ends_at, room, notes)
    values (p.id, p_class, p_subject, p_date, p_start, p_end, nullif(btrim(p_room), ''), nullif(btrim(p_notes), '')) returning id into v_id;
  else
    select * into v_old from public.exam_papers where id = p_id and school_id = v_school;
    if not found then raise exception 'That paper was not found.' using errcode = 'EXT01'; end if;
    update public.exam_papers set exam_period_id = p.id, class_id = p_class, subject_id = p_subject, exam_date = p_date, starts_at = p_start, ends_at = p_end,
      room = nullif(btrim(p_room), ''), notes = nullif(btrim(p_notes), '') where id = p_id returning id into v_id;
    -- Keep the invigilators' duty in step with the paper.
    if v_old.invigilation_task_id is not null then
      update public.tasks set starts_on = p_date, ends_on = p_date, starts_at = p_start, ends_at = p_end, location = nullif(btrim(p_room), ''),
        title = 'Invigilate ' || (select name from public.subjects where id = p_subject) || ', ' || public._class_label(p_class)
       where id = v_old.invigilation_task_id;
    end if;
  end if;
  return v_id;
end $$;

create function public.delete_exam_paper(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.exam_papers;
begin
  select * into v from public.exam_papers where id = p_id and school_id = public.current_school_id();
  if not found or not public.has_capability('grades.manage_exam_periods') then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.exam_papers where id = p_id;
  if v.invigilation_task_id is not null then delete from public.tasks where id = v.invigilation_task_id; end if;
end $$;

-- Give a paper its invigilators (replacing any), as an ordinary invigilation task. Needs both the exam set-up
-- action and the right to assign tasks. An empty list removes the duty.
create function public.assign_invigilators(p_paper uuid, p_people uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v public.exam_papers; v_task uuid; v_title text;
begin
  select * into v from public.exam_papers where id = p_paper and school_id = public.current_school_id();
  if not found or not public.has_capability('grades.manage_exam_periods') or not public.has_capability('tasks.assign') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_people is null or cardinality(p_people) = 0 then
    if v.invigilation_task_id is not null then delete from public.tasks where id = v.invigilation_task_id; end if;
    update public.exam_papers set invigilation_task_id = null where id = p_paper;
    return;
  end if;
  v_title := 'Invigilate ' || (select name from public.subjects where id = v.subject_id) || ', ' || public._class_label(v.class_id);
  v_task := public.save_task(v.invigilation_task_id, v_title, null, 'invigilation', v.exam_date, v.exam_date, v.starts_at, v.ends_at, v.room, v.exam_period_id, p_people);
  update public.exam_papers set invigilation_task_id = v_task where id = p_paper;
end $$;

-- ── Publishing ──────────────────────────────────────────────────────────────
create function public.set_exam_timetable_published(p_period uuid, p_published boolean) returns int
language plpgsql security definer set search_path = public as $$
declare p public.exam_periods; ids uuid[]; gids uuid[]; v_n int := 0;
begin
  select * into p from public.exam_periods where id = p_period and school_id = public.current_school_id();
  if not found or not public.has_capability('grades.manage_exam_periods') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_published and not p.use_timetable then raise exception 'Switch on the exam timetable for this period first.' using errcode = 'EXT01'; end if;
  if p_published and not exists (select 1 from public.exam_papers where exam_period_id = p.id) then raise exception 'Add at least one paper before publishing.' using errcode = 'EXT01'; end if;
  if p.timetable_published = p_published then return 0; end if;
  update public.exam_periods set timetable_published = p_published where id = p.id;
  if p_published then
    begin
      -- The pupils and the parents of the classes that have a paper.
      select coalesce(array_agg(distinct x), '{}') into ids from (
        select s.profile_id x from public.exam_papers ep join public.enrollments e on e.class_id = ep.class_id join public.students s on s.id = e.student_id and s.status = 'active'
         where ep.exam_period_id = p.id and s.profile_id is not null
        union all
        select g.profile_id from public.exam_papers ep join public.enrollments e on e.class_id = ep.class_id join public.students s on s.id = e.student_id and s.status = 'active'
          join public.student_guardians sg on sg.student_id = s.id join public.guardians g on g.id = sg.guardian_id and g.deleted_at is null where ep.exam_period_id = p.id and g.profile_id is not null) t where x is not null;
      v_n := public.notify_profiles(p.school_id, 'exam_timetable_published', ids, 'Exam timetable: ' || p.name, 'The timetable is ready to view.', '/grades');
      select coalesce(array_agg(distinct sg.guardian_id), '{}') into gids from public.exam_papers ep join public.enrollments e on e.class_id = ep.class_id
        join public.students s on s.id = e.student_id and s.status = 'active' join public.student_guardians sg on sg.student_id = s.id where ep.exam_period_id = p.id;
      perform public._queue_auto_messages(p.school_id, 'exam_timetable_published', gids, null, 'Exam timetable: ' || p.name, 'The timetable is ready. Open the app to see the dates and times.', p.id::text);
    exception when others then raise warning 'exam timetable notification failed: %', sqlerrm; end;
  end if;
  return v_n;
end $$;

-- ── Reading ─────────────────────────────────────────────────────────────────
-- The periods whose timetable the signed-in person may see.
create function public.exam_timetable_periods()
returns table (period_id uuid, name text, kind text, starts_on date, ends_on date, use_timetable boolean, published boolean, papers bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_manage boolean; v_staff boolean;
begin
  if public.current_school_id() is null or not public.feature_enabled('grades') then return; end if;
  v_manage := public.has_capability('grades.manage_exam_periods');
  v_staff := public.has_capability('calendar.view');
  return query
  select p.id, p.name, p.kind, p.starts_on, p.ends_on, p.use_timetable, p.timetable_published,
         (select count(*) from public.exam_papers ep where ep.exam_period_id = p.id
            and (v_manage or v_staff or public._exam_class_member(ep.class_id)))
    from public.exam_periods p
   where p.school_id = public.current_school_id() and p.use_timetable
     and (v_manage or (p.timetable_published and (v_staff or exists (select 1 from public.exam_papers ep where ep.exam_period_id = p.id and public._exam_class_member(ep.class_id)))))
   order by p.starts_on desc;
end $$;

-- The papers the person may see. Invigilators are shown only to those who set the timetable up.
create function public.exam_timetable(p_period uuid)
returns table (paper_id uuid, class_id uuid, class_label text, subject_id uuid, subject_name text, exam_date date, starts_at time, ends_at time, room text, notes text,
               invigilator_ids uuid[], invigilator_names text)
language plpgsql stable security definer set search_path = public as $$
declare v_manage boolean; v_staff boolean;
begin
  if public.current_school_id() is null or not public.feature_enabled('grades') then return; end if;
  v_manage := public.has_capability('grades.manage_exam_periods');
  v_staff := public.has_capability('calendar.view');
  return query
  select ep.id, ep.class_id, public._class_label(ep.class_id), ep.subject_id, s.name, ep.exam_date, ep.starts_at, ep.ends_at, ep.room, ep.notes,
         case when v_manage then (select coalesce(array_agg(a.profile_id), '{}') from public.task_assignees a where a.task_id = ep.invigilation_task_id) end,
         case when v_manage then (select string_agg(pr.full_name, ', ' order by pr.full_name) from public.task_assignees a join public.profiles pr on pr.id = a.profile_id where a.task_id = ep.invigilation_task_id) end
    from public.exam_papers ep join public.exam_periods p on p.id = ep.exam_period_id join public.subjects s on s.id = ep.subject_id
   where ep.exam_period_id = p_period and ep.school_id = public.current_school_id()
     and (v_manage or (p.timetable_published and (v_staff or public._exam_class_member(ep.class_id))))
   order by ep.exam_date, ep.starts_at, public._class_label(ep.class_id);
end $$;

-- ── Report weighting: a part of a scheme can be tied to a kind of exam ──────
alter table public.assessment_components
  add column exam_kind text check (exam_kind is null or exam_kind in ('mock', 'mid_term', 'term_exam', 'other'));
create unique index assessment_components_one_per_kind on public.assessment_components (scheme_id, exam_kind) where exam_kind is not null;

-- An assessment linked to an exam period of a kind that a part of the class's scheme is tied to goes in that part by itself.
-- (It runs before the check that every assessment in a scheme sits in a part.)
create function public.assessments_a_period_part() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_class uuid; v_scheme uuid; v_kind text; v_part uuid;
begin
  if new.component_id is not null or new.exam_period_id is null then return new; end if;
  select cs.class_id into v_class from public.class_subjects cs where cs.id = new.class_subject_id;
  v_scheme := public._scheme_of_class(v_class);
  if v_scheme is null then return new; end if;
  select kind into v_kind from public.exam_periods where id = new.exam_period_id;
  select id into v_part from public.assessment_components where scheme_id = v_scheme and exam_kind = v_kind;
  if v_part is not null then new.component_id := v_part; end if;
  return new;
end $$;
create trigger assessments_a_period_part before insert on public.assessments for each row execute function public.assessments_a_period_part();

-- What an exam period counts for: the parts of schemes tied to its kind, with their share of the result.
create function public.exam_period_weights(p_period uuid) returns table (scheme_name text, part_name text, weight numeric)
language sql stable security definer set search_path = public as $$
  select s.name, k.name, k.weight from public.exam_periods p join public.assessment_components k on k.exam_kind = p.kind and k.school_id = p.school_id
    join public.assessment_schemes s on s.id = k.scheme_id
   where p.id = p_period and p.school_id = public.current_school_id()
     and public.has_any_capability(array['grades.view', 'grades.manage_exam_periods', 'grades.manage_assessment_schemes'])
   order by s.name $$;

-- ── Lock the functions down ─────────────────────────────────────────────────
revoke execute on function public._class_label(uuid) from public, anon, authenticated;
revoke execute on function public._exam_class_member(uuid) from public, anon, authenticated;
revoke execute on function public.assessments_a_period_part() from public, anon, authenticated;
revoke execute on function public.save_exam_paper(uuid, uuid, uuid, uuid, date, time, time, text, text) from public, anon;
revoke execute on function public.delete_exam_paper(uuid) from public, anon;
revoke execute on function public.assign_invigilators(uuid, uuid[]) from public, anon;
revoke execute on function public.set_exam_timetable_published(uuid, boolean) from public, anon;
revoke execute on function public.exam_timetable_periods() from public, anon;
revoke execute on function public.exam_timetable(uuid) from public, anon;
revoke execute on function public.exam_period_weights(uuid) from public, anon;
grant execute on function public.save_exam_paper(uuid, uuid, uuid, uuid, date, time, time, text, text) to authenticated;
grant execute on function public.delete_exam_paper(uuid) to authenticated;
grant execute on function public.assign_invigilators(uuid, uuid[]) to authenticated;
grant execute on function public.set_exam_timetable_published(uuid, boolean) to authenticated;
grant execute on function public.exam_timetable_periods() to authenticated;
grant execute on function public.exam_timetable(uuid) to authenticated;
grant execute on function public.exam_period_weights(uuid) to authenticated;
