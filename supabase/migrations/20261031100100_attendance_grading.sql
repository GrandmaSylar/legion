-- Attendance and grading. GES results are computed by trigger so the client
-- can never write a total or grade directly.

create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  date date not null,
  status public.attendance_status not null,
  marked_by uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, date)
);
create index on public.attendance (school_id, date);

create type public.assessment_type as enum (
  'class_exercise', 'homework', 'project', 'ca_test', 'exam'
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  class_subject_id uuid not null references public.class_subjects (id) on delete cascade,
  term_id uuid not null references public.terms (id),
  type public.assessment_type not null,
  title text,
  max_score numeric not null check (max_score > 0),
  -- Points this assessment contributes to the 100-point total. Across a
  -- class/subject/term, continuous-assessment weights should sum to 30 and
  -- the exam weight is 70.
  weight numeric not null check (weight > 0 and weight <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.assessments (school_id);
create index on public.assessments (class_subject_id, term_id);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  score numeric not null check (score >= 0),
  entered_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, enrollment_id)
);
create index on public.scores (school_id);
create index on public.scores (enrollment_id);

create function public.scores_check_max() returns trigger
language plpgsql as $$
declare v_max numeric;
begin
  select max_score into v_max from public.assessments where id = new.assessment_id;
  if new.score > v_max then
    raise exception 'score % exceeds max score % for this assessment', new.score, v_max;
  end if;
  return new;
end $$;

create trigger scores_check_max
before insert or update of score on public.scores
for each row execute function public.scores_check_max();

-- Numeric levels only. Derived data: written by the trigger below.
create table public.term_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  term_id uuid not null references public.terms (id),
  subject_id uuid not null references public.subjects (id),
  ca_total numeric not null default 0,
  exam_score numeric not null default 0,
  total numeric not null default 0,
  grade text,
  remark text,
  updated_at timestamptz not null default now(),
  unique (enrollment_id, term_id, subject_id)
);
create index on public.term_results (school_id);
create index on public.term_results (term_id);

-- Descriptive levels (creche to KG 2): a remark per learning area, plus an
-- overall remark when learning_area_id is null. Basic levels also use it for
-- class teacher / head teacher comments.
create table public.term_remarks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  term_id uuid not null references public.terms (id),
  learning_area_id uuid references public.learning_areas (id),
  remark text not null,
  written_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index term_remarks_one_per_area
  on public.term_remarks (enrollment_id, term_id, learning_area_id)
  where learning_area_id is not null;
create unique index term_remarks_one_overall
  on public.term_remarks (enrollment_id, term_id)
  where learning_area_id is null;
create index on public.term_remarks (school_id);

-- Recompute one student's result for one subject and term.
-- Total = sum(score / max_score * weight). The exam counts toward exam_score;
-- every other assessment type counts toward ca_total. A grade is assigned only
-- when the level's scale is numeric (ges_numeric or custom_numeric).
create function public.recompute_term_result(
  p_enrollment uuid, p_term uuid, p_class_subject uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_subject uuid;
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

  select
    coalesce(sum(s.score / a.max_score * a.weight) filter (where a.type <> 'exam'), 0),
    coalesce(sum(s.score / a.max_score * a.weight) filter (where a.type = 'exam'), 0)
  into v_ca, v_exam
  from public.scores s
  join public.assessments a on a.id = s.assessment_id
  where s.enrollment_id = p_enrollment
    and a.term_id = p_term
    and a.class_subject_id = p_class_subject;

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

create function public.scores_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.scores;
  a public.assessments;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  select * into a from public.assessments where id = r.assessment_id;
  -- On cascade delete of the assessment the row is gone; nothing to recompute.
  if a.id is null then return null; end if;
  perform public.recompute_term_result(r.enrollment_id, a.term_id, a.class_subject_id);
  return null;
end $$;

create trigger scores_after_change
after insert or update or delete on public.scores
for each row execute function public.scores_after_change();

do $$
declare t text;
begin
  foreach t in array array['attendance','assessments','scores','term_remarks']
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
