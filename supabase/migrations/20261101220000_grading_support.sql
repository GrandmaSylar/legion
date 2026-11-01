-- Support for the Gradebook, configurable grading scales, and report cards.

-- 1. Automatically stamp entered_by on scores and written_by on term_remarks.
create or replace function public.scores_stamp_author() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.entered_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists scores_stamp_author on public.scores;
create trigger scores_stamp_author
before insert or update on public.scores
for each row execute function public.scores_stamp_author();

create or replace function public.term_remarks_stamp_author() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.written_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists term_remarks_stamp_author on public.term_remarks;
create trigger term_remarks_stamp_author
before insert or update on public.term_remarks
for each row execute function public.term_remarks_stamp_author();

-- 2. Enhance recompute_term_result so clearing all scores for a student in a
-- subject/term removes the derived term_results row instead of leaving a 0% grade.
create or replace function public.recompute_term_result(
  p_enrollment uuid, p_term uuid, p_class_subject uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_subject uuid;
  v_count int;
  v_ca numeric;
  v_exam numeric;
  v_total numeric;
  v_scale uuid;
  v_type public.grading_type;
  v_grade text;
  v_remark text;
begin
  select cs.school_id, cs.subject_id into v_school, v_subject
  from public.class_subjects cs where cs.id = p_class_subject;

  if v_subject is null then
    return;
  end if;

  select
    count(*),
    coalesce(sum(s.score / a.max_score * a.weight) filter (where a.type <> 'exam'), 0),
    coalesce(sum(s.score / a.max_score * a.weight) filter (where a.type = 'exam'), 0)
  into v_count, v_ca, v_exam
  from public.scores s
  join public.assessments a on a.id = s.assessment_id
  where s.enrollment_id = p_enrollment
    and a.term_id = p_term
    and a.class_subject_id = p_class_subject;

  if coalesce(v_count, 0) = 0 then
    delete from public.term_results
    where enrollment_id = p_enrollment
      and term_id = p_term
      and subject_id = v_subject;
    return;
  end if;

  v_total := round(v_ca + v_exam, 2);

  select l.grading_scale_id into v_scale
  from public.enrollments e
  join public.classes c on c.id = e.class_id
  join public.levels l on l.id = c.level_id
  where e.id = p_enrollment;

  select gs.type into v_type from public.grading_scales gs where gs.id = v_scale;

  if v_type in ('ges_numeric', 'custom_numeric') then
    select gb.grade, gb.remark into v_grade, v_remark
    from public.grade_bands gb
    where gb.scale_id = v_scale and v_total >= gb.min_score and v_total <= gb.max_score
    order by gb.min_score desc
    limit 1;
  end if;

  insert into public.term_results
    (school_id, enrollment_id, term_id, subject_id, ca_total, exam_score, total, grade, remark)
  values
    (v_school, p_enrollment, p_term, v_subject, round(v_ca, 2), round(v_exam, 2), v_total, v_grade, v_remark)
  on conflict (enrollment_id, term_id, subject_id) do update set
    ca_total = excluded.ca_total,
    exam_score = excluded.exam_score,
    total = excluded.total,
    grade = excluded.grade,
    remark = excluded.remark,
    updated_at = now();
end $$;

-- 3. Recompute term_results when an assessment's weight, max_score, or type is
-- updated, or when an assessment is deleted.
create or replace function public.assessments_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.assessments;
  v_class uuid;
  v_enrol uuid;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  select class_id into v_class from public.class_subjects where id = r.class_subject_id;
  if v_class is null then return null; end if;

  for v_enrol in
    select id from public.enrollments where class_id = v_class
  loop
    perform public.recompute_term_result(v_enrol, r.term_id, r.class_subject_id);
  end loop;
  return null;
end $$;

drop trigger if exists assessments_after_change on public.assessments;
create trigger assessments_after_change
after update of max_score, weight, type or delete on public.assessments
for each row execute function public.assessments_after_change();

-- 4. Allow parents and students to read assessments for classes they can view,
-- so score breakdowns can display assessment titles and max scores.
drop policy if exists assessments_read on public.assessments;
create policy assessments_read on public.assessments for select to authenticated
  using (
    school_id = public.current_school_id()
    and (
      public.has_any_role(array['school_admin','principal']::public.app_role[])
      or (public.has_role('teacher') and public.teaches_class_subject(class_subject_id))
      or exists (
        select 1
        from public.class_subjects cs
        join public.enrollments e on e.class_id = cs.class_id
        where cs.id = assessments.class_subject_id
          and public.can_view_enrollment(e.id)
      )
    )
  );

-- 5. Helper RPC to save or clear a term remark (either per-subject or overall
-- when p_subject is null). SECURITY INVOKER so RLS (term_remarks_write) applies.
create or replace function public.save_term_remark(
  p_enrollment uuid,
  p_term uuid,
  p_subject uuid,
  p_remark text
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_trimmed text := btrim(coalesce(p_remark, ''));
  v_id uuid;
begin
  if p_subject is null then
    select id into v_id
    from public.term_remarks
    where enrollment_id = p_enrollment
      and term_id = p_term
      and subject_id is null;
  else
    select id into v_id
    from public.term_remarks
    where enrollment_id = p_enrollment
      and term_id = p_term
      and subject_id = p_subject;
  end if;

  if v_trimmed = '' then
    if v_id is not null then
      delete from public.term_remarks where id = v_id;
    end if;
    return;
  end if;

  if v_id is not null then
    update public.term_remarks
    set remark = v_trimmed
    where id = v_id;
  else
    insert into public.term_remarks (enrollment_id, term_id, subject_id, remark)
    values (p_enrollment, p_term, p_subject, v_trimmed);
  end if;
end $$;

revoke execute on function public.recompute_term_result(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.assessments_after_change() from public, anon, authenticated;
revoke execute on function public.scores_stamp_author() from public, anon, authenticated;
revoke execute on function public.term_remarks_stamp_author() from public, anon, authenticated;
revoke execute on function public.save_term_remark(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.save_term_remark(uuid, uuid, uuid, text) to authenticated;

