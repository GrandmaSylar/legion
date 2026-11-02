-- BECE Candidate Registration enhancements: centre numbers, status, official aggregate, and RLS for teachers/parents/students.

alter table public.bece_registrations
  add column if not exists centre_number text,
  add column if not exists registration_status text not null default 'registered'
    check (registration_status in ('pending', 'registered', 'withdrawn')),
  add column if not exists official_aggregate int
    check (official_aggregate is null or (official_aggregate >= 6 and official_aggregate <= 54));

create or replace function public.bece_registrations_stamp_actor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.school_id is null then
    new.school_id := public.current_school_id();
  end if;
  if new.index_number is not null and btrim(new.index_number) = '' then
    new.index_number := null;
  end if;
  if new.index_number is not null and (tg_op = 'INSERT' or old.index_number is distinct from new.index_number) then
    new.entered_by := coalesce(auth.uid(), new.entered_by);
    new.entered_on := now();
  end if;
  return new;
end $$;

drop trigger if exists bece_registrations_stamp_actor on public.bece_registrations;
create trigger bece_registrations_stamp_actor
before insert or update on public.bece_registrations
for each row execute function public.bece_registrations_stamp_actor();

revoke execute on function public.bece_registrations_stamp_actor() from public, anon, authenticated;

-- Allow teachers teaching the student's class, guardians, and the student to read BECE registration details (e.g. on report cards).
drop policy if exists bece_read on public.bece_registrations;
create policy bece_read on public.bece_registrations
  for select to authenticated
  using (
    school_id = public.current_school_id()
    and (
      public.has_any_role(array['school_admin','principal','receptionist','accountant']::public.app_role[])
      or (public.has_role('teacher') and exists (
            select 1 from public.enrollments e
            where e.student_id = bece_registrations.student_id
              and public.teaches_class(e.class_id)))
      or (public.has_role('parent') and public.is_guardian_of(bece_registrations.student_id))
      or (public.has_role('student') and bece_registrations.student_id = public.my_student_id())
    )
  );

