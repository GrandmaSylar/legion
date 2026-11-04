-- Two follow-ups to the exam timetable.

-- Tie a part of an assessment scheme to a kind of exam (or untie it). Each kind can be tied to one part of a scheme.
create function public.set_part_exam_kind(p_part uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_capability('grades.manage_assessment_schemes') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind is not null and p_kind not in ('mock', 'mid_term', 'term_exam', 'other') then raise exception 'Choose a kind of exam.' using errcode = 'ASM01'; end if;
  if exists (select 1 from public.assessment_components k join public.assessment_components o on o.scheme_id = k.scheme_id and o.id <> k.id and o.exam_kind = p_kind
              where k.id = p_part and p_kind is not null) then
    raise exception 'Another part of this scheme is already tied to that kind of exam.' using errcode = 'ASM01';
  end if;
  update public.assessment_components set exam_kind = p_kind where id = p_part and school_id = public.current_school_id();
  if not found then raise exception 'That part was not found.' using errcode = 'ASM01'; end if;
end $$;
revoke execute on function public.set_part_exam_kind(uuid, text) from public, anon;
grant execute on function public.set_part_exam_kind(uuid, text) to authenticated;

-- A timetable is published only through set_exam_timetable_published, which tells parents and pupils; switching the
-- timetable off takes it back to a draft.
create function public.exam_periods_guard_publish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.use_timetable then new.timetable_published := false; end if;
  if new.timetable_published is distinct from old.timetable_published and coalesce(current_setting('legion.exam_publish', true), '') <> 'on' then
    raise exception 'Publish the timetable from the exam timetable screen, so parents and pupils are told.' using errcode = 'EXT01';
  end if;
  return new;
end $$;
create trigger exam_periods_guard_publish before update on public.exam_periods for each row execute function public.exam_periods_guard_publish();
revoke execute on function public.exam_periods_guard_publish() from public, anon, authenticated;

create or replace function public.set_exam_timetable_published(p_period uuid, p_published boolean) returns int
language plpgsql security definer set search_path = public as $$
declare p public.exam_periods; ids uuid[]; gids uuid[]; v_n int := 0;
begin
  select * into p from public.exam_periods where id = p_period and school_id = public.current_school_id();
  if not found or not public.has_capability('grades.manage_exam_periods') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_published and not p.use_timetable then raise exception 'Switch on the exam timetable for this period first.' using errcode = 'EXT01'; end if;
  if p_published and not exists (select 1 from public.exam_papers where exam_period_id = p.id) then raise exception 'Add at least one paper before publishing.' using errcode = 'EXT01'; end if;
  if p.timetable_published = p_published then return 0; end if;
  perform set_config('legion.exam_publish', 'on', true);
  update public.exam_periods set timetable_published = p_published where id = p.id;
  perform set_config('legion.exam_publish', 'off', true);
  if p_published then
    begin
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
