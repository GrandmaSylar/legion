-- Step 7 of the move from roles to actions: Timetable, Users, school Settings and the audit trail.
-- After this every staff-facing rule is decided by actions. The role names remain only as job
-- labels that carry a preset, and for the portal accounts (parents and students).
--
-- Because giving a person a role now also gives them that role's preset of actions, handing out
-- roles is itself a way to hand out access. A new rule closes that door: you can only give a
-- role whose preset you hold in full yourself (a developer may give any).

-- ── New actions ─────────────────────────────────────────────────────────────
insert into public.access_capabilities (key, module, action, label, description, sensitive, sort) values
  ('timetable.edit_own_classes', 'timetable', 'edit_own_classes', 'Edit timetables for their own classes', 'Change timetable slots only for classes they teach.', false, 550),
  ('users.view_basic', 'users', 'view_basic', 'See other people''s names and contacts', 'See names and contact details of the school''s logins without opening the Users screen.', false, 560)
on conflict (key) do nothing;

-- Presets: teachers edit the timetable for their own classes only; principals and HR officers
-- could always read the people list; only a developer deletes logins (the Users function has
-- always insisted on it), so admins do not hold that action by default.
delete from public.access_preset_capabilities where role = 'teacher' and capability = 'timetable.edit';
insert into public.access_preset_capabilities (role, capability) values
  ('teacher', 'timetable.edit_own_classes'), ('school_admin', 'timetable.edit_own_classes'),
  ('school_admin', 'users.view_basic'), ('principal', 'users.view_basic'), ('hr_officer', 'users.view_basic')
  on conflict do nothing;
delete from public.access_preset_capabilities where role = 'school_admin' and capability = 'users.delete';

delete from public.user_capabilities uc using public.user_roles ur
  where ur.profile_id = uc.profile_id and ur.role = 'teacher' and uc.capability = 'timetable.edit'
    and not exists (select 1 from public.user_roles r2 join public.access_preset_capabilities p on p.role = r2.role
                    where r2.profile_id = uc.profile_id and p.capability = 'timetable.edit');
delete from public.user_capabilities uc using public.user_roles ur
  where ur.profile_id = uc.profile_id and ur.role = 'school_admin' and uc.capability = 'users.delete'
    and not exists (select 1 from public.user_roles r2 join public.access_preset_capabilities p on p.role = r2.role
                    where r2.profile_id = uc.profile_id and p.capability = 'users.delete');
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, p.capability, ur.school_id from public.user_roles ur
  join public.access_preset_capabilities p on p.role = ur.role
  where p.capability in ('timetable.edit_own_classes', 'users.view_basic')
  on conflict (profile_id, capability) do nothing;

-- ── Timetable ───────────────────────────────────────────────────────────────
drop policy timetable_slots_write on public.timetable_slots;
create policy timetable_slots_insert on public.timetable_slots for insert to authenticated
  with check (school_id = public.current_school_id() and (
    public.has_capability('timetable.edit')
    or (public.has_capability('timetable.edit_own_classes') and public.teaches_class(class_id))));
create policy timetable_slots_update on public.timetable_slots for update to authenticated
  using (school_id = public.current_school_id() and (
    public.has_capability('timetable.edit')
    or (public.has_capability('timetable.edit_own_classes') and public.teaches_class(class_id))))
  with check (school_id = public.current_school_id() and (
    public.has_capability('timetable.edit')
    or (public.has_capability('timetable.edit_own_classes') and public.teaches_class(class_id))));
create policy timetable_slots_delete on public.timetable_slots for delete to authenticated
  using (school_id = public.current_school_id() and (
    public.has_capability('timetable.edit')
    or (public.has_capability('timetable.edit_own_classes') and public.teaches_class(class_id))));

-- ── School settings: year, terms, classes, subjects, grading, numbering, school details ──
drop policy academic_years_insert on public.academic_years;
drop policy academic_years_update on public.academic_years;
drop policy terms_insert on public.terms;
drop policy terms_update on public.terms;
drop policy classes_insert on public.classes;
drop policy classes_update on public.classes;
drop policy subjects_insert on public.subjects;
drop policy subjects_update on public.subjects;
drop policy levels_write on public.levels;
drop policy class_subjects_write on public.class_subjects;
drop policy grading_scales_write on public.grading_scales;
drop policy grade_bands_write on public.grade_bands;
drop policy number_sequences_admin on public.number_sequences;
drop policy schools_update on public.schools;

create policy academic_years_insert on public.academic_years for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy academic_years_update on public.academic_years for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('settings.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy terms_insert on public.terms for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy terms_update on public.terms for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('settings.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy classes_insert on public.classes for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy classes_update on public.classes for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('settings.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy subjects_insert on public.subjects for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy subjects_update on public.subjects for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('settings.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy levels_write on public.levels for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('settings.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy class_subjects_write on public.class_subjects for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('settings.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy grading_scales_write on public.grading_scales for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('settings.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy grade_bands_write on public.grade_bands for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('settings.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy number_sequences_admin on public.number_sequences for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('settings.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy schools_update on public.schools for update to authenticated
  using (id = public.current_school_id() and public.has_capability('settings.edit'))
  with check (id = public.current_school_id());

-- Deleting these reference rows stays with developers only (their *_delete policies are unchanged).

-- ── The audit trail ─────────────────────────────────────────────────────────
drop policy audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('audit.view'));

-- ── Logins and roles ────────────────────────────────────────────────────────
-- May the caller give this role? A developer may give any. Anyone else may not give the developer
-- or super admin role, and may give another role only if they hold every action its preset holds,
-- so handing out a role can never hand out more than the giver has.
create function public.can_assign_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_developer() or (
    p_role not in ('developer', 'super_admin')
    and not exists (
      select 1 from public.access_preset_capabilities p
      where p.role = p_role and not public.has_capability(p.capability)
    )
  )
$$;
revoke all on function public.can_assign_role(public.app_role) from public, anon;
grant execute on function public.can_assign_role(public.app_role) to authenticated;

drop policy profiles_read on public.profiles;
drop policy profiles_write on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or (school_id = public.current_school_id()
         and public.has_any_capability(array['users.view', 'users.view_basic'])));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('users.create'));
create policy profiles_update on public.profiles for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('users.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('users.edit'));
create policy profiles_delete on public.profiles for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('users.delete'));

drop policy user_roles_read on public.user_roles;
drop policy user_roles_write on public.user_roles;
create policy user_roles_read on public.user_roles for select to authenticated
  using (profile_id = auth.uid() or (school_id = public.current_school_id() and public.has_capability('users.view')));
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('users.edit') and public.can_assign_role(role));
create policy user_roles_update on public.user_roles for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('users.edit') and public.can_assign_role(role))
  with check (school_id = public.current_school_id() and public.has_capability('users.edit') and public.can_assign_role(role));
create policy user_roles_delete on public.user_roles for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('users.edit') and public.can_assign_role(role));
