-- Step 6 of the move from roles to actions: Notices and Staff.
--
-- Who may post, edit and see every notice, and who may see and change the staff directory, are
-- decided by actions instead of roles. Who a notice is FOR (everyone, staff, parents, a class)
-- is still worked out from a person's job, because that is about audience, not permission.
-- Every existing role keeps what it had.

-- ── A new action: seeing colleagues' names ──────────────────────────────────
-- Every staff member could always read the staff list (class teachers' names, timetables), even
-- though only some have the Staff screen. That ordinary access gets its own action so it does not
-- open the Staff screen.
insert into public.access_capabilities (key, module, action, label, description, sensitive, sort)
values ('staff.view_basic', 'staff', 'view_basic', 'See colleagues'' names and contacts', 'See staff names and contact details where they appear, such as class teachers and timetables, without opening the Staff screen.', false, 325)
on conflict (key) do nothing;
insert into public.access_preset_capabilities (role, capability)
  select r, 'staff.view_basic' from unnest(enum_range(null::public.app_role)) as r
  where r in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
  on conflict do nothing;
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, 'staff.view_basic', ur.school_id from public.user_roles ur
  where ur.role in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
  on conflict (profile_id, capability) do nothing;

-- ── Notices ─────────────────────────────────────────────────────────────────
drop policy announcements_read on public.announcements;
drop policy announcements_write on public.announcements;

create policy announcements_read on public.announcements for select to authenticated
  using (
    school_id = public.current_school_id() and (
      -- people who manage notices see everything, drafts included; a poster sees their own drafts
      public.has_capability('notices.manage')
      or (public.has_capability('notices.post') and posted_by = auth.uid())
      or (public.has_capability('notices.post_class') and audience = 'class' and public.teaches_class(class_id))
      -- published notices reach their audience
      or (published_at is not null and published_at <= now() and (
            audience = 'all'
            or (audience = 'staff' and public.has_any_role(array['principal','teacher','hr_officer','accountant','librarian','receptionist']::public.app_role[]))
            or (audience = 'parents' and public.has_role('parent'))
            or (audience = 'class' and (
                  (public.has_role('teacher') and public.teaches_class(class_id))
                  or (public.has_role('parent') and exists (
                        select 1 from public.enrollments e where e.class_id = announcements.class_id and public.is_guardian_of(e.student_id)))
                  or (public.has_role('student') and exists (
                        select 1 from public.enrollments e where e.class_id = announcements.class_id and e.student_id = public.my_student_id()))
            ))
      ))
    )
  );

create policy announcements_insert on public.announcements for insert to authenticated
  with check (
    school_id = public.current_school_id() and (
      public.has_capability('notices.post')
      or (public.has_capability('notices.post_class') and audience = 'class' and class_id is not null and public.teaches_class(class_id))
    )
  );
create policy announcements_update on public.announcements for update to authenticated
  using (
    school_id = public.current_school_id() and (
      public.has_capability('notices.manage')
      or (public.has_capability('notices.post') and posted_by = auth.uid())
      or (public.has_capability('notices.post_class') and audience = 'class' and class_id is not null and public.teaches_class(class_id))
    )
  )
  with check (
    school_id = public.current_school_id() and (
      public.has_capability('notices.manage')
      or (public.has_capability('notices.post') and posted_by = auth.uid())
      or (public.has_capability('notices.post_class') and audience = 'class' and class_id is not null and public.teaches_class(class_id))
    )
  );
create policy announcements_delete on public.announcements for delete to authenticated
  using (
    school_id = public.current_school_id() and (
      public.has_capability('notices.manage')
      or (public.has_capability('notices.post') and posted_by = auth.uid())
      or (public.has_capability('notices.post_class') and audience = 'class' and class_id is not null and public.teaches_class(class_id))
    )
  );

-- ── Staff directory ─────────────────────────────────────────────────────────
drop policy staff_read on public.staff;
drop policy staff_write on public.staff;

create policy staff_read on public.staff for select to authenticated
  using (school_id = public.current_school_id() and deleted_at is null
         and public.has_any_capability(array['staff.view', 'staff.view_basic']));
create policy staff_insert on public.staff for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('staff.create'));
create policy staff_update on public.staff for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('staff.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('staff.edit'));
create policy staff_delete on public.staff for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('staff.delete'));
