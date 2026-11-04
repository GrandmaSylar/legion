-- Parents follow the same rule as their child for marks.
--
-- A pupil already sees an assessment's marks only when the teacher has shown them or the class's report
-- for the term is published, and the term result, remarks and conduct ratings only once the report is
-- published. A parent of that pupil now follows exactly the same rule, so a mark is not seen at home
-- before the pupil, or before the teacher chooses to show it. Staff are not affected.
create or replace function public._hidden_from_pupil(p_enrollment uuid, p_term uuid, p_visible boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce(p_visible, false)
     and exists (select 1 from public.enrollments e join public.students s on s.id = e.student_id
                  where e.id = p_enrollment
                    and (s.profile_id = auth.uid() or (public.has_role('parent') and public.is_guardian_of(e.student_id))))
     and not public.has_capability('grades.view')
     and not exists (select 1 from public.enrollments e
                       join public.term_report_publications tp on tp.class_id = e.class_id
                      where e.id = p_enrollment and tp.term_id = p_term and tp.is_published)
$$;
