-- Marks a student may see: only what the teacher has shown, or what has been published.
--
-- Until now a pupil could read every mark and result the moment it was entered, because the database
-- only asked "is this your enrollment?". The "published" flag was obeyed by the screens, not the
-- database. Now, for the pupil themselves:
--   * an assessment's marks are visible only if the teacher has marked that assessment "show to
--     students" (hidden until then), or if the class's report for that term has been published;
--   * the computed term result, the teacher's remarks and the conduct ratings are visible only once
--     the class's report for that term has been published.
-- Parents and staff are not affected. A person who is a pupil but also holds the grades.view action
-- (a member of staff) still sees everything their job allows.

alter table public.assessments add column visible_to_students boolean not null default false;

-- True when the signed-in person is the pupil of this enrollment, is not staff who may view grades,
-- the teacher has not shown the mark, and the class's report for the term is not published.
create function public._hidden_from_pupil(p_enrollment uuid, p_term uuid, p_visible boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce(p_visible, false)
     and exists (select 1 from public.enrollments e join public.students s on s.id = e.student_id
                  where e.id = p_enrollment and s.profile_id = auth.uid())
     and not public.has_capability('grades.view')
     and not exists (select 1 from public.enrollments e
                       join public.term_report_publications tp on tp.class_id = e.class_id
                      where e.id = p_enrollment and tp.term_id = p_term and tp.is_published)
$$;

create function public._score_hidden_from_pupil(p_assessment uuid, p_enrollment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public._hidden_from_pupil(p_enrollment, a.term_id, a.visible_to_students)
                     from public.assessments a where a.id = p_assessment), false)
$$;

drop policy assessments_read on public.assessments;
create policy assessments_read on public.assessments for select to authenticated
  using (
    school_id = public.current_school_id()
    and (
      public.has_capability('grades.view')
      or (public.has_capability('grades.enter_own_classes') and public.teaches_class_subject(class_subject_id))
      or exists (
        select 1 from public.class_subjects cs
        join public.enrollments e on e.class_id = cs.class_id
        where cs.id = assessments.class_subject_id
          and public.can_view_enrollment(e.id)
          and not public._hidden_from_pupil(e.id, assessments.term_id, assessments.visible_to_students)
      )
    )
  );

drop policy scores_read on public.scores;
create policy scores_read on public.scores for select to authenticated
  using (public.can_view_enrollment(enrollment_id) and not public._score_hidden_from_pupil(assessment_id, enrollment_id));

drop policy term_results_read on public.term_results;
create policy term_results_read on public.term_results for select to authenticated
  using (public.can_view_enrollment(enrollment_id) and not public._hidden_from_pupil(enrollment_id, term_id, false));

drop policy term_remarks_read on public.term_remarks;
create policy term_remarks_read on public.term_remarks for select to authenticated
  using (public.can_view_enrollment(enrollment_id) and not public._hidden_from_pupil(enrollment_id, term_id, false));

drop policy "Users can view behavioral assessments" on public.student_behavioral_assessments;
create policy "Users can view behavioral assessments" on public.student_behavioral_assessments for select to authenticated
  using (public.can_view_enrollment(enrollment_id) and not public._hidden_from_pupil(enrollment_id, term_id, false));

-- Show or hide every assessment of a subject for a term at once. It runs with the caller's own rights,
-- so only someone who may edit those assessments changes any.
create function public.set_marks_visibility(p_class_subject uuid, p_term uuid, p_visible boolean) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update public.assessments set visible_to_students = p_visible
   where class_subject_id = p_class_subject and term_id = p_term and visible_to_students is distinct from p_visible;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.set_marks_visibility(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_marks_visibility(uuid, uuid, boolean) to authenticated;

-- The row rules call these as the signed-in person, so signed-in users must be able to run them. They say
-- only whether something is hidden from the caller.
revoke execute on function public._hidden_from_pupil(uuid, uuid, boolean) from public, anon;
revoke execute on function public._score_hidden_from_pupil(uuid, uuid) from public, anon;
grant execute on function public._hidden_from_pupil(uuid, uuid, boolean) to authenticated;
grant execute on function public._score_hidden_from_pupil(uuid, uuid) to authenticated;
