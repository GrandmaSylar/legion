-- Migration: Student Behavioral Assessments, Term Publications, and Rapid Assessment Analytics
-- Supports continuous assessment recording, affective domain ratings, class teacher remarks,
-- promotional decisions, and report card locking.

-- 1. Affective & behavioral traits assessment
create table if not exists public.student_behavioral_assessments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  punctuality smallint check (punctuality between 1 and 5),
  neatness smallint check (neatness between 1 and 5),
  politeness smallint check (politeness between 1 and 5),
  attitude_to_work smallint check (attitude_to_work between 1 and 5),
  leadership smallint check (leadership between 1 and 5),
  teacher_remarks text,
  headteacher_remarks text,
  promotional_status text check (promotional_status in ('promoted', 'promoted_on_trial', 'repeated', 'withdrawn', 'pending')) default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, term_id)
);

create index if not exists idx_behavioral_enrollment_term
  on public.student_behavioral_assessments (enrollment_id, term_id);

alter table public.student_behavioral_assessments enable row level security;

create policy "Users can view behavioral assessments"
  on public.student_behavioral_assessments for select to authenticated
  using (public.can_view_enrollment(enrollment_id));

create policy "Teachers and admins can insert behavioral assessments"
  on public.student_behavioral_assessments for insert to authenticated
  with check (
    public.can_teach_enrollment(enrollment_id) or public.has_role('school_admin')
  );

create policy "Teachers and admins can update behavioral assessments"
  on public.student_behavioral_assessments for update to authenticated
  using (
    public.can_teach_enrollment(enrollment_id) or public.has_role('school_admin')
  )
  with check (
    public.can_teach_enrollment(enrollment_id) or public.has_role('school_admin')
  );

create policy "Admins can delete behavioral assessments"
  on public.student_behavioral_assessments for delete to authenticated
  using (public.has_role('school_admin'));


-- 2. Term publication & report lock status
create table if not exists public.term_report_publications (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  is_published boolean not null default false,
  published_at timestamptz,
  published_by uuid references public.profiles(id),
  reopening_date date,
  vacation_date date,
  next_term_fees numeric check (next_term_fees >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, term_id)
);

create index if not exists idx_publications_class_term
  on public.term_report_publications (class_id, term_id);

alter table public.term_report_publications enable row level security;

create policy "School members can view report publications"
  on public.term_report_publications for select to authenticated
  using (
    exists (
      select 1 from public.classes c
      where c.id = term_report_publications.class_id
        and c.school_id = public.current_school_id()
    )
  );

create policy "Admins and class teachers can manage report publications"
  on public.term_report_publications for all to authenticated
  using (
    exists (
      select 1 from public.classes c
      where c.id = term_report_publications.class_id
        and c.school_id = public.current_school_id()
    ) and (public.has_role('school_admin') or public.teaches_class(class_id))
  )
  with check (
    exists (
      select 1 from public.classes c
      where c.id = term_report_publications.class_id
        and c.school_id = public.current_school_id()
    ) and (public.has_role('school_admin') or public.teaches_class(class_id))
  );


-- 3. Upsert helper RPC for behavioral assessment
create or replace function public.save_behavioral_assessment(
  p_enrollment uuid,
  p_term uuid,
  p_punctuality smallint default null,
  p_neatness smallint default null,
  p_politeness smallint default null,
  p_attitude smallint default null,
  p_leadership smallint default null,
  p_teacher_remarks text default null,
  p_headteacher_remarks text default null,
  p_promotional_status text default 'pending'
) returns public.student_behavioral_assessments
language plpgsql security definer set search_path = public as $$
declare
  v_res public.student_behavioral_assessments;
begin
  if not (public.can_teach_enrollment(p_enrollment) or public.has_role('school_admin')) then
    raise exception 'Permission denied: cannot record behavioral assessment.';
  end if;

  insert into public.student_behavioral_assessments (
    enrollment_id,
    term_id,
    punctuality,
    neatness,
    politeness,
    attitude_to_work,
    leadership,
    teacher_remarks,
    headteacher_remarks,
    promotional_status,
    updated_at
  ) values (
    p_enrollment,
    p_term,
    p_punctuality,
    p_neatness,
    p_politeness,
    p_attitude,
    p_leadership,
    p_teacher_remarks,
    p_headteacher_remarks,
    coalesce(p_promotional_status, 'pending'),
    now()
  )
  on conflict (enrollment_id, term_id) do update set
    punctuality = excluded.punctuality,
    neatness = excluded.neatness,
    politeness = excluded.politeness,
    attitude_to_work = excluded.attitude_to_work,
    leadership = excluded.leadership,
    teacher_remarks = excluded.teacher_remarks,
    headteacher_remarks = excluded.headteacher_remarks,
    promotional_status = coalesce(excluded.promotional_status, student_behavioral_assessments.promotional_status),
    updated_at = now()
  returning * into v_res;

  return v_res;
end $$;

grant execute on function public.save_behavioral_assessment to authenticated;


-- 4. Publication toggle RPC
create or replace function public.set_term_report_publication(
  p_class uuid,
  p_term uuid,
  p_is_published boolean,
  p_reopening_date date default null,
  p_vacation_date date default null,
  p_next_term_fees numeric default null
) returns public.term_report_publications
language plpgsql security definer set search_path = public as $$
declare
  v_res public.term_report_publications;
begin
  if not (public.has_role('school_admin') or public.teaches_class(p_class)) then
    raise exception 'Permission denied: cannot manage report publication.';
  end if;

  insert into public.term_report_publications (
    class_id,
    term_id,
    is_published,
    published_at,
    published_by,
    reopening_date,
    vacation_date,
    next_term_fees,
    updated_at
  ) values (
    p_class,
    p_term,
    p_is_published,
    case when p_is_published then now() else null end,
    case when p_is_published then auth.uid() else null end,
    p_reopening_date,
    p_vacation_date,
    p_next_term_fees,
    now()
  )
  on conflict (class_id, term_id) do update set
    is_published = excluded.is_published,
    published_at = case when excluded.is_published then now() else null end,
    published_by = case when excluded.is_published then auth.uid() else null end,
    reopening_date = coalesce(excluded.reopening_date, term_report_publications.reopening_date),
    vacation_date = coalesce(excluded.vacation_date, term_report_publications.vacation_date),
    next_term_fees = coalesce(excluded.next_term_fees, term_report_publications.next_term_fees),
    updated_at = now()
  returning * into v_res;

  return v_res;
end $$;

grant execute on function public.set_term_report_publication to authenticated;


-- 5. Progress summary for class assessments: count how many subjects have scores
create or replace function public.get_class_assessment_progress(
  p_class uuid,
  p_term uuid
) returns table (
  class_subject_id uuid,
  subject_id uuid,
  subject_name text,
  teacher_name text,
  assessment_count bigint,
  enrolled_students bigint,
  graded_students bigint,
  completion_pct numeric
)
language plpgsql security invoker set search_path = public as $$
declare
  v_enrolled bigint;
begin
  select count(*) into v_enrolled
  from public.enrollments e
  join public.students s on s.id = e.student_id
  where e.class_id = p_class
    and e.status = 'enrolled'
    and s.status = 'active'
    and s.deleted_at is null;

  return query
  select
    cs.id as class_subject_id,
    sub.id as subject_id,
    sub.name as subject_name,
    p.full_name as teacher_name,
    coalesce(count(distinct a.id), 0) as assessment_count,
    v_enrolled as enrolled_students,
    coalesce(count(distinct tr.enrollment_id), 0) as graded_students,
    case
      when v_enrolled = 0 then 0::numeric
      else round((coalesce(count(distinct tr.enrollment_id), 0)::numeric / v_enrolled::numeric) * 100, 1)
    end as completion_pct
  from public.class_subjects cs
  join public.subjects sub on sub.id = cs.subject_id
  left join public.staff st on st.id = cs.teacher_id
  left join public.profiles p on p.id = st.profile_id
  left join public.assessments a on a.class_subject_id = cs.id and a.term_id = p_term
  left join public.term_results tr on tr.subject_id = sub.id and tr.term_id = p_term
    and tr.enrollment_id in (
      select e.id from public.enrollments e
      where e.class_id = p_class and e.status = 'enrolled'
    )
  where cs.class_id = p_class
  group by cs.id, sub.id, sub.name, p.full_name
  order by sub.name;
end $$;

grant execute on function public.get_class_assessment_progress to authenticated;
