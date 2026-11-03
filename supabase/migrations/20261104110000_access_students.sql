-- Step 3 of the move from roles to actions: Students.
--
-- The student, parent, class enrolment and BECE tables, and the bulk import and class promotion
-- functions are now decided by actions instead of roles.
-- Parents and students keep reading their own records through the portal rules (they are
-- not staff and do not hold actions). Every existing role keeps exactly what it had.

-- A receptionist could always delete students; the preset missed that. Fix it, and give it to
-- the receptionists who already exist, so nothing changes for them.
insert into public.access_preset_capabilities (role, capability) values ('receptionist', 'students.delete')
  on conflict do nothing;
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, 'students.delete', ur.school_id from public.user_roles ur where ur.role = 'receptionist'
  on conflict (profile_id, capability) do nothing;

-- ── students ────────────────────────────────────────────────────────────────
drop policy students_read on public.students;
drop policy students_write on public.students;

create policy students_read on public.students for select to authenticated
  using (
    school_id = public.current_school_id() and deleted_at is null and (
      public.has_capability('students.view')
      or (public.has_capability('students.view_own_classes') and exists (
            select 1 from public.enrollments e where e.student_id = students.id and public.teaches_class(e.class_id)))
      or (public.has_role('parent') and public.is_guardian_of(id))
      or (public.has_role('student') and id = public.my_student_id())
    )
  );
create policy students_insert on public.students for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('students.create'));
create policy students_update on public.students for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('students.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('students.edit'));
create policy students_delete on public.students for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('students.delete'));

-- ── parents ─────────────────────────────────────────────────────────────────
drop policy guardians_read on public.guardians;
drop policy guardians_write on public.guardians;

create policy guardians_read on public.guardians for select to authenticated
  using (school_id = public.current_school_id() and deleted_at is null
         and (public.has_capability('students.view') or profile_id = auth.uid()));
create policy guardians_insert on public.guardians for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('students.create'));
create policy guardians_update on public.guardians for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('students.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('students.edit'));
create policy guardians_delete on public.guardians for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('students.delete'));

-- ── who is whose parent ─────────────────────────────────────────────────────
drop policy student_guardians_read on public.student_guardians;
drop policy student_guardians_write on public.student_guardians;

create policy student_guardians_read on public.student_guardians for select to authenticated
  using (school_id = public.current_school_id()
         and (public.has_capability('students.view') or public.is_guardian_of(student_id)));
create policy student_guardians_insert on public.student_guardians for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_any_capability(array['students.create', 'students.edit']));
create policy student_guardians_update on public.student_guardians for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('students.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('students.edit'));
create policy student_guardians_delete on public.student_guardians for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('students.edit'));

-- ── class enrolments (who is in which class) ────────────────────────────────
-- Reading stays with can_view_enrollment, which Attendance and Grades share; it moves with them.
drop policy enrollments_write on public.enrollments;

create policy enrollments_insert on public.enrollments for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_any_capability(array['students.create', 'students.edit']));
create policy enrollments_update on public.enrollments for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('students.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('students.edit'));
create policy enrollments_delete on public.enrollments for delete to authenticated
  using (school_id = public.current_school_id() and public.has_any_capability(array['students.delete', 'students.edit']));

-- ── BECE registrations ──────────────────────────────────────────────────────
drop policy bece_read on public.bece_registrations;
drop policy bece_write on public.bece_registrations;

create policy bece_read on public.bece_registrations for select to authenticated
  using (
    school_id = public.current_school_id() and (
      public.has_capability('students.view')
      or (public.has_capability('students.view_own_classes') and exists (
            select 1 from public.enrollments e where e.student_id = bece_registrations.student_id and public.teaches_class(e.class_id)))
      or (public.has_role('parent') and public.is_guardian_of(student_id))
      or (public.has_role('student') and student_id = public.my_student_id())
    )
  );
create policy bece_insert on public.bece_registrations for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('students.edit'));
create policy bece_update on public.bece_registrations for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('students.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('students.edit'));
create policy bece_delete on public.bece_registrations for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('students.edit'));

-- ── bulk import and class promotion ─────────────────────────────────────────
-- Their bodies are long and only one line changes, so rewrite that line in place.
do $$
declare
  def text;
  role_check constant text := 'public.has_any_role(array[''school_admin'',''receptionist'']::public.app_role[])';
  fn record;
begin
  for fn in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('bulk_admit_students', 'promote_class_students')
  loop
    def := pg_get_functiondef(fn.oid);
    if position(role_check in def) = 0 then
      raise exception 'Expected role check not found in %', fn.proname;
    end if;
    def := replace(def, role_check,
      case fn.proname when 'bulk_admit_students' then 'public.has_capability(''students.create'')'
                      else 'public.has_capability(''students.edit'')' end);
    execute def;
  end loop;
end $$;
