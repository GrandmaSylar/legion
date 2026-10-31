-- Core: tenancy, access, school structure, people.
-- Every table carries school_id and has RLS enabled (policies in the rls migration).

create extension if not exists pgcrypto;

create type public.app_role as enum (
  'super_admin', 'school_admin', 'principal', 'teacher', 'hr_officer',
  'accountant', 'librarian', 'receptionist', 'parent', 'student'
);

-- Shared trigger: keep updated_at current.
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tenancy and access
-- ---------------------------------------------------------------------------

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  brand_colors jsonb not null default '{}',
  timezone text not null default 'Africa/Accra',
  currency text not null default 'GHS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  full_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.profiles (school_id);

create table public.user_roles (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);
create index on public.user_roles (school_id);

-- Helpers used by every RLS policy. SECURITY DEFINER so they can read the
-- tables they protect without recursing through RLS.
create function public.current_school_id() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.profiles where id = auth.uid()
$$;

create function public.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where profile_id = auth.uid() and role = r
  )
$$;

create function public.has_any_role(roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where profile_id = auth.uid() and role = any (roles)
  )
$$;

-- ---------------------------------------------------------------------------
-- Numbering (admission_no, staff_no, receipt_no, invoice_no)
-- ---------------------------------------------------------------------------

create type public.number_kind as enum ('admission_no', 'staff_no', 'receipt_no', 'invoice_no');

create table public.number_sequences (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  kind public.number_kind not null,
  -- {YYYY} is replaced by the year; a run of N's is the zero-padded counter.
  format text not null,
  year int not null default 0,           -- 0 = counter never restarts
  next_value int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, kind, year)
);

-- Issue the next number atomically. Numbers are never reissued, even if the
-- row that received one is later deleted.
create function public.issue_number(p_school uuid, p_kind public.number_kind)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_format text;
  v_restarts boolean;
  v_year int := extract(year from now())::int;
  v_value int;
  v_pad int;
begin
  select format into v_format from public.number_sequences
  where school_id = p_school and kind = p_kind
  order by year desc limit 1;
  if v_format is null then
    raise exception 'no number sequence configured for % in school %', p_kind, p_school;
  end if;

  v_restarts := v_format like '%{YYYY}%';
  if not v_restarts then v_year := 0; end if;

  insert into public.number_sequences (school_id, kind, format, year, next_value)
  values (p_school, p_kind, v_format, v_year, 2)
  on conflict (school_id, kind, year)
  do update set next_value = public.number_sequences.next_value + 1
  returning next_value - 1 into v_value;

  v_pad := length(substring(v_format from '\{(N+)\}'));
  return replace(
    regexp_replace(v_format, '\{N+\}', lpad(v_value::text, greatest(v_pad, 1), '0')),
    '{YYYY}', v_year::text
  );
end $$;

-- ---------------------------------------------------------------------------
-- Grading scales (referenced by levels, so defined here)
-- ---------------------------------------------------------------------------

create type public.grading_type as enum ('ges_numeric', 'custom_numeric', 'descriptive', 'checklist');

create table public.grading_scales (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null,
  type public.grading_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.grading_scales (school_id);

create table public.grade_bands (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  scale_id uuid not null references public.grading_scales (id) on delete cascade,
  min_score numeric not null,
  max_score numeric not null,
  grade text not null,
  remark text not null,
  check (min_score <= max_score)
);
create index on public.grade_bands (scale_id);

-- ---------------------------------------------------------------------------
-- School structure
-- ---------------------------------------------------------------------------

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date < end_date),
  unique (school_id, name)
);
create unique index one_current_year on public.academic_years (school_id) where is_current;

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date < end_date),
  unique (academic_year_id, name)
);
create unique index one_current_term on public.terms (school_id) where is_current;

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null,
  sort_order int not null,
  grading_scale_id uuid references public.grading_scales (id),
  sits_bece boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (school_id, sort_order)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table public.learning_areas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create type public.staff_type as enum ('teaching', 'non_teaching');
create type public.staff_status as enum ('active', 'on_leave', 'left');

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  profile_id uuid unique references public.profiles (id),
  staff_no text,
  full_name text not null,
  role_title text,
  type public.staff_type not null,
  phone text,
  email text,
  hired_on date,
  status public.staff_status not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, staff_no)
);
create index on public.staff (school_id);

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  profile_id uuid unique references public.profiles (id),
  full_name text not null,
  phone text,
  email text,
  relationship text,
  occupation text,
  address text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.guardians (school_id);

create type public.student_status as enum ('active', 'completed', 'left');
create type public.gender as enum ('female', 'male');

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  profile_id uuid unique references public.profiles (id),
  -- Single school number (admission number and school ID in one). Issued from
  -- number_sequences, never changed on promotion, never reused.
  admission_no text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  date_of_birth date,
  gender public.gender,
  photo_url text,
  status public.student_status not null default 'active',
  admitted_on date not null default current_date,
  left_on date,
  left_reason text,
  medical_notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Not partial on deleted_at: a number is never reissued, even after removal.
  unique (school_id, admission_no)
);
create index on public.students (school_id, status);

create function public.students_assign_admission_no() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.admission_no is null or new.admission_no = '' then
    new.admission_no := public.issue_number(new.school_id, 'admission_no');
  end if;
  return new;
end $$;

-- BEFORE INSERT runs before the NOT NULL check, so omitting admission_no works.
create trigger students_assign_admission_no
before insert on public.students
for each row execute function public.students_assign_admission_no();

create table public.student_guardians (
  school_id uuid not null references public.schools (id),
  student_id uuid not null references public.students (id) on delete cascade,
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  is_primary boolean not null default false,
  can_pickup boolean not null default true,
  primary key (student_id, guardian_id)
);
create index on public.student_guardians (guardian_id);
create index on public.student_guardians (school_id);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  level_id uuid not null references public.levels (id),
  academic_year_id uuid not null references public.academic_years (id),
  section text not null default 'A',
  class_teacher_id uuid references public.staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (level_id, academic_year_id, section)
);
create index on public.classes (school_id);

create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  class_id uuid not null references public.classes (id) on delete cascade,
  subject_id uuid not null references public.subjects (id),
  teacher_id uuid references public.staff (id),
  created_at timestamptz not null default now(),
  unique (class_id, subject_id)
);
create index on public.class_subjects (school_id);
create index on public.class_subjects (teacher_id);

create type public.enrollment_status as enum ('enrolled', 'promoted', 'repeated', 'completed', 'left');

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  student_id uuid not null references public.students (id),
  class_id uuid not null references public.classes (id),
  academic_year_id uuid not null references public.academic_years (id),
  status public.enrollment_status not null default 'enrolled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_year_id)
);
create index on public.enrollments (school_id);
create index on public.enrollments (class_id);

-- Final-year (sits_bece) students. The school fills in index_number when it
-- is issued, so it starts empty.
create table public.bece_registrations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  student_id uuid not null references public.students (id),
  exam_year int not null,
  index_number text,
  entered_by uuid references public.profiles (id),
  entered_on timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, exam_year),
  unique (school_id, exam_year, index_number)
);
create index on public.bece_registrations (school_id);

-- updated_at triggers
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
