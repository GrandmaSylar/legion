-- Performance optimization: composite/partial B-Tree indexes for RLS helpers & hot queries,
-- plus single-round-trip SECURITY INVOKER RPC for dashboard overview statistics.

-- 1. RLS Identity & Permission Helper Indexes
create index if not exists students_profile_active_idx
  on public.students (profile_id)
  where deleted_at is null and profile_id is not null;

create index if not exists staff_profile_active_idx
  on public.staff (profile_id)
  where deleted_at is null and profile_id is not null;

create index if not exists guardians_profile_active_idx
  on public.guardians (profile_id)
  where deleted_at is null and profile_id is not null;

create index if not exists classes_teacher_idx
  on public.classes (class_teacher_id)
  where class_teacher_id is not null;

create index if not exists class_subjects_class_teacher_idx
  on public.class_subjects (class_id, teacher_id);

-- 2. People & Directory Indexes
create index if not exists students_school_active_name_idx
  on public.students (school_id, status, last_name, first_name)
  where deleted_at is null;

create index if not exists students_school_admitted_on_idx
  on public.students (school_id, admitted_on desc)
  where deleted_at is null;

create index if not exists staff_school_status_type_name_idx
  on public.staff (school_id, status, type, full_name)
  where deleted_at is null;

-- 3. Academic Structure & Enrollment Indexes
create index if not exists academic_years_school_current_idx
  on public.academic_years (school_id, is_current, start_date desc);

create index if not exists terms_school_year_start_idx
  on public.terms (school_id, academic_year_id, start_date);

create index if not exists classes_school_year_level_idx
  on public.classes (school_id, academic_year_id, level_id);

create index if not exists enrollments_class_status_idx
  on public.enrollments (class_id, status);

create index if not exists enrollments_year_status_idx
  on public.enrollments (academic_year_id, status);

create index if not exists enrollments_school_student_idx
  on public.enrollments (school_id, student_id);

-- 4. Attendance & Gradebook Indexes
create index if not exists attendance_school_date_status_idx
  on public.attendance (school_id, date, status);

create index if not exists attendance_enrollment_date_idx
  on public.attendance (enrollment_id, date desc);

create index if not exists assessments_cs_term_idx
  on public.assessments (class_subject_id, term_id);

create index if not exists scores_enrollment_assessment_idx
  on public.scores (enrollment_id, assessment_id);

create index if not exists term_results_term_enrollment_idx
  on public.term_results (term_id, enrollment_id, subject_id);

create index if not exists term_remarks_term_enrollment_idx
  on public.term_remarks (term_id, enrollment_id);

create index if not exists bece_registrations_school_year_idx
  on public.bece_registrations (school_id, exam_year);

-- 5. Finance & Billing Indexes
create index if not exists invoices_school_active_created_idx
  on public.invoices (school_id, created_at desc)
  where deleted_at is null;

create index if not exists invoices_student_term_active_idx
  on public.invoices (student_id, term_id)
  where deleted_at is null;

create index if not exists payments_invoice_valid_idx
  on public.payments (invoice_id, paid_on desc)
  where voided_at is null;

-- 6. Timetable Indexes
create index if not exists timetable_slots_school_day_time_idx
  on public.timetable_slots (school_id, day_of_week, start_time);

-- 7. Single-round-trip Dashboard Overview RPC (SECURITY INVOKER so RLS applies per role)
create or replace function public.get_dashboard_stats_fast(
  p_today date,
  p_first_of_month date
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'activeStudents', (
      select count(*)::int from public.students where status = 'active' and deleted_at is null
    ),
    'admittedThisMonth', (
      select count(*)::int from public.students where admitted_on >= p_first_of_month and deleted_at is null
    ),
    'staff', (
      select count(*)::int from public.staff where status = 'active' and deleted_at is null
    ),
    'teachingStaff', (
      select count(*)::int from public.staff where status = 'active' and type = 'teaching' and deleted_at is null
    ),
    'classes', (
      select count(*)::int from public.classes
    ),
    'yearName', (
      select name from public.academic_years where is_current = true limit 1
    ),
    'markedToday', (
      select count(*)::int from public.attendance where date = p_today
    ),
    'presentToday', (
      select count(*)::int from public.attendance where date = p_today and status in ('present', 'late')
    )
  );
$$;

revoke execute on function public.get_dashboard_stats_fast(date, date) from public, anon;
grant execute on function public.get_dashboard_stats_fast(date, date) to authenticated;

-- Update planner statistics so Postgres immediately uses the new indexes
analyze;
