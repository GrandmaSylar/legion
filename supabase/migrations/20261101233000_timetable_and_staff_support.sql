-- Support for the Basic Timetable (Phase 3 Item 6) and Staff Directory.

-- 1. Timetable slots per class (Monday=1 .. Friday=5).
create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  class_id uuid not null references public.classes (id) on delete cascade,
  class_subject_id uuid references public.class_subjects (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 5),
  start_time time not null,
  end_time time not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time),
  unique (class_id, day_of_week, start_time)
);

create index if not exists timetable_slots_class_day_idx
  on public.timetable_slots (school_id, class_id, day_of_week, start_time);

drop trigger if exists set_updated_at on public.timetable_slots;
create trigger set_updated_at
before update on public.timetable_slots
for each row execute function public.set_updated_at();

alter table public.timetable_slots enable row level security;

drop policy if exists timetable_slots_read on public.timetable_slots;
create policy timetable_slots_read on public.timetable_slots for select to authenticated
  using (school_id = public.current_school_id());

drop policy if exists timetable_slots_write on public.timetable_slots;
create policy timetable_slots_write on public.timetable_slots for all to authenticated
  using (
    school_id = public.current_school_id()
    and (
      public.has_any_role(array['school_admin','principal']::public.app_role[])
      or (public.has_role('teacher') and public.teaches_class(class_id))
    )
  )
  with check (
    school_id = public.current_school_id()
    and (
      public.has_any_role(array['school_admin','principal']::public.app_role[])
      or (public.has_role('teacher') and public.teaches_class(class_id))
    )
  );

-- 2. Automatically issue staff_no from number_sequences on insert if omitted.
create or replace function public.staff_assign_staff_no() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.staff_no is null or new.staff_no = '' then
    new.staff_no := public.issue_number(new.school_id, 'staff_no');
  end if;
  return new;
end $$;

drop trigger if exists staff_assign_staff_no on public.staff;
create trigger staff_assign_staff_no
before insert on public.staff
for each row execute function public.staff_assign_staff_no();

revoke execute on function public.staff_assign_staff_no() from public, anon, authenticated;
