-- Step 4 of the move from roles to actions: Attendance and Grades.
--
-- Two shared rules sit under both modules: "may this person see this enrolment" and "may this
-- person teach it". They are rebuilt from actions, and "teach" is split into taking attendance
-- and entering marks, which are different jobs. Assessments, report publication and BECE
-- registration follow. Parents and students still read their own records through the portal
-- rules. Every existing role keeps what it had.

-- ── A new action: registering BECE candidates ───────────────────────────────
-- Receptionists use the Grades screen for this and nothing else there, so it gets its own action
-- instead of hiding behind "see grades".
insert into public.access_capabilities (key, module, action, label, description, sensitive, sort)
values ('grades.manage_bece', 'grades', 'manage_bece', 'Register BECE candidates', 'Enter and change BECE registrations and index numbers.', false, 105)
on conflict (key) do nothing;

-- Presets must match what the database really allows today.
--   - The principal never could publish reports (only an admin or the class teacher could).
--   - The receptionist could register BECE candidates, but never saw grades in the screen.
delete from public.access_preset_capabilities where role = 'principal' and capability = 'grades.publish';
delete from public.access_preset_capabilities where role = 'receptionist' and capability = 'grades.view';
insert into public.access_preset_capabilities (role, capability) values
  ('school_admin', 'grades.manage_bece'), ('receptionist', 'grades.manage_bece')
  on conflict do nothing;

delete from public.user_capabilities uc using public.user_roles ur
  where ur.profile_id = uc.profile_id and uc.capability = 'grades.publish' and ur.role = 'principal'
    and not exists (select 1 from public.user_roles r2 where r2.profile_id = uc.profile_id and r2.role = 'school_admin');
delete from public.user_capabilities uc using public.user_roles ur
  where ur.profile_id = uc.profile_id and uc.capability = 'grades.view' and ur.role = 'receptionist'
    and not exists (select 1 from public.user_roles r2 join public.access_preset_capabilities p on p.role = r2.role
                    where r2.profile_id = uc.profile_id and p.capability = 'grades.view');
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, 'grades.manage_bece', ur.school_id from public.user_roles ur where ur.role in ('school_admin', 'receptionist')
  on conflict (profile_id, capability) do nothing;

-- ── The shared rules, from actions ──────────────────────────────────────────
-- May this person see this enrolment (class membership, attendance, marks, remarks)?
-- Anyone who works across the whole school's classes, a teacher for their own classes, a parent
-- for their own child, a student for themself. The accountant is deliberately not included.
create or replace function public.can_view_enrollment(p_enrollment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment
      and e.school_id = public.current_school_id()
      and (
        public.has_any_capability(array['attendance.view', 'grades.view', 'grades.manage_bece'])
        or (public.has_any_capability(array['students.view_own_classes', 'attendance.take_own_classes', 'grades.enter_own_classes'])
            and public.teaches_class(e.class_id))
        or (public.has_role('parent') and public.is_guardian_of(e.student_id))
        or (public.has_role('student') and e.student_id = public.my_student_id())
      )
  )
$$;

-- May this person enter marks and remarks for this enrolment?
create or replace function public.can_teach_enrollment(p_enrollment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment
      and e.school_id = public.current_school_id()
      and (
        public.has_capability('grades.enter_any')
        or (public.has_capability('grades.enter_own_classes') and public.teaches_class(e.class_id))
      )
  )
$$;

-- May this person take attendance for this enrolment?
create function public.can_take_attendance(p_enrollment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment
      and e.school_id = public.current_school_id()
      and (
        public.has_capability('attendance.take_any')
        or (public.has_capability('attendance.take_own_classes') and public.teaches_class(e.class_id))
      )
  )
$$;
revoke all on function public.can_take_attendance(uuid) from public, anon;
grant execute on function public.can_take_attendance(uuid) to authenticated;

-- ── Attendance ──────────────────────────────────────────────────────────────
drop policy attendance_write on public.attendance;
create policy attendance_write on public.attendance for all to authenticated
  using (public.can_take_attendance(enrollment_id))
  with check (school_id = public.current_school_id() and public.can_take_attendance(enrollment_id));

-- ── Assessments ─────────────────────────────────────────────────────────────
drop policy assessments_read on public.assessments;
drop policy assessments_write on public.assessments;

create policy assessments_read on public.assessments for select to authenticated
  using (
    school_id = public.current_school_id() and (
      public.has_capability('grades.view')
      or (public.has_capability('grades.enter_own_classes') and public.teaches_class_subject(class_subject_id))
      or exists (
        select 1 from public.class_subjects cs join public.enrollments e on e.class_id = cs.class_id
        where cs.id = assessments.class_subject_id and public.can_view_enrollment(e.id))
    )
  );
create policy assessments_write on public.assessments for all to authenticated
  using (school_id = public.current_school_id() and (
    public.has_capability('grades.enter_any')
    or (public.has_capability('grades.enter_own_classes') and public.teaches_class_subject(class_subject_id))))
  with check (school_id = public.current_school_id() and (
    public.has_capability('grades.enter_any')
    or (public.has_capability('grades.enter_own_classes') and public.teaches_class_subject(class_subject_id))));

-- ── Publishing report cards ─────────────────────────────────────────────────
drop policy "Admins and class teachers can manage report publications" on public.term_report_publications;
create policy "Admins and class teachers can manage report publications" on public.term_report_publications for all to authenticated
  using (
    exists (select 1 from public.classes c where c.id = term_report_publications.class_id and c.school_id = public.current_school_id())
    and (public.has_capability('grades.publish')
         or (public.has_capability('grades.enter_own_classes') and public.teaches_class(class_id)))
  )
  with check (
    exists (select 1 from public.classes c where c.id = term_report_publications.class_id and c.school_id = public.current_school_id())
    and (public.has_capability('grades.publish')
         or (public.has_capability('grades.enter_own_classes') and public.teaches_class(class_id)))
  );

do $$
declare
  def text;
  old_check constant text := '(public.has_role(''school_admin'') or public.teaches_class(p_class))';
  new_check constant text := '(public.has_capability(''grades.publish'') or (public.has_capability(''grades.enter_own_classes'') and public.teaches_class(p_class)))';
  fn record;
begin
  for fn in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'set_term_report_publication'
  loop
    def := pg_get_functiondef(fn.oid);
    if position(old_check in def) = 0 then
      raise exception 'Expected role check not found in %', fn.proname;
    end if;
    execute replace(def, old_check, new_check);
  end loop;
end $$;

-- ── BECE registration (reading follows seeing the student; writing is its own action) ─
drop policy bece_insert on public.bece_registrations;
drop policy bece_update on public.bece_registrations;
drop policy bece_delete on public.bece_registrations;
create policy bece_insert on public.bece_registrations for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('grades.manage_bece'));
create policy bece_update on public.bece_registrations for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('grades.manage_bece'))
  with check (school_id = public.current_school_id() and public.has_capability('grades.manage_bece'));
create policy bece_delete on public.bece_registrations for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('grades.manage_bece'));
