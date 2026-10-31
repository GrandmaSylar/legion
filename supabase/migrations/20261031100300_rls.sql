-- Row Level Security. Deny by default: RLS is enabled on every table and a
-- table without a matching policy is inaccessible.
--
-- Every policy is scoped to the caller's school (school_id = current_school_id()),
-- then narrowed by role. super_admin (platform-level) has no tenant-data
-- policies here; platform operations use the service role.
--
-- Known limit: policies check school_id on the row being written, not on the
-- rows it references. Cross-tenant foreign keys are prevented by the app's data
-- layer; composite (school_id, id) foreign keys can be added later.

-- ---------------------------------------------------------------------------
-- Identity helpers (SECURITY DEFINER: they read tables RLS would otherwise block)
-- ---------------------------------------------------------------------------

create function public.my_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.staff where profile_id = auth.uid() and deleted_at is null
$$;

create function public.my_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.students where profile_id = auth.uid() and deleted_at is null
$$;

create function public.is_guardian_of(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student and g.profile_id = auth.uid()
  )
$$;

create function public.teaches_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class and c.class_teacher_id = public.my_staff_id()
  ) or exists (
    select 1 from public.class_subjects cs
    where cs.class_id = p_class and cs.teacher_id = public.my_staff_id()
  )
$$;

create function public.teaches_class_subject(p_cs uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_subjects cs
    join public.classes c on c.id = cs.class_id
    where cs.id = p_cs
      and (cs.teacher_id = public.my_staff_id() or c.class_teacher_id = public.my_staff_id())
  )
$$;

-- Can the caller read this enrollment's student data?
create function public.can_view_enrollment(p_enrollment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment
      and e.school_id = public.current_school_id()
      and (
        public.has_any_role(array['school_admin','principal','receptionist']::public.app_role[])
        or (public.has_role('teacher') and public.teaches_class(e.class_id))
        or (public.has_role('parent') and public.is_guardian_of(e.student_id))
        or (public.has_role('student') and e.student_id = public.my_student_id())
      )
  )
$$;

-- Can the caller record attendance / scores for this enrollment?
create function public.can_teach_enrollment(p_enrollment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment
      and e.school_id = public.current_school_id()
      and (
        public.has_role('school_admin')
        or (public.has_role('teacher') and public.teaches_class(e.class_id))
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- School-wide reference data: any signed-in member of the school may read,
-- only school_admin may write.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'academic_years','terms','levels','subjects','learning_areas',
    'grading_scales','grade_bands','classes','class_subjects'
  ]
  loop
    execute format(
      'create policy %1$s_read on public.%1$I for select to authenticated
         using (school_id = public.current_school_id())', t);
    execute format(
      'create policy %1$s_write on public.%1$I for all to authenticated
         using (school_id = public.current_school_id() and public.has_role(''school_admin''))
         with check (school_id = public.current_school_id() and public.has_role(''school_admin''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Tenancy and access
-- ---------------------------------------------------------------------------

create policy schools_read on public.schools for select to authenticated
  using (id = public.current_school_id());
create policy schools_update on public.schools for update to authenticated
  using (id = public.current_school_id() and public.has_role('school_admin'))
  with check (id = public.current_school_id());

create policy profiles_read on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (school_id = public.current_school_id()
        and public.has_any_role(array['school_admin','principal','hr_officer']::public.app_role[]))
  );
create policy profiles_write on public.profiles for all to authenticated
  using (school_id = public.current_school_id() and public.has_role('school_admin'))
  with check (school_id = public.current_school_id() and public.has_role('school_admin'));

create policy user_roles_read on public.user_roles for select to authenticated
  using (
    profile_id = auth.uid()
    or (school_id = public.current_school_id() and public.has_role('school_admin'))
  );
create policy user_roles_write on public.user_roles for all to authenticated
  using (school_id = public.current_school_id() and public.has_role('school_admin'))
  with check (school_id = public.current_school_id() and public.has_role('school_admin'));

create policy number_sequences_admin on public.number_sequences for all to authenticated
  using (school_id = public.current_school_id() and public.has_role('school_admin'))
  with check (school_id = public.current_school_id() and public.has_role('school_admin'));

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

-- Students: office roles see all; teachers see students they teach; parents see
-- their children; students see themselves. HR has no student access.
create policy students_read on public.students for select to authenticated
  using (
    school_id = public.current_school_id()
    and deleted_at is null
    and (
      public.has_any_role(array['school_admin','principal','receptionist','accountant']::public.app_role[])
      or (public.has_role('teacher') and exists (
            select 1 from public.enrollments e
            where e.student_id = students.id and public.teaches_class(e.class_id)))
      or (public.has_role('parent') and public.is_guardian_of(students.id))
      or (public.has_role('student') and students.id = public.my_student_id())
    )
  );
create policy students_write on public.students for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','receptionist']::public.app_role[]))
  with check (school_id = public.current_school_id()
              and public.has_any_role(array['school_admin','receptionist']::public.app_role[]));

create policy guardians_read on public.guardians for select to authenticated
  using (
    school_id = public.current_school_id()
    and deleted_at is null
    and (
      public.has_any_role(array['school_admin','principal','receptionist','accountant']::public.app_role[])
      or profile_id = auth.uid()
    )
  );
create policy guardians_write on public.guardians for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','receptionist']::public.app_role[]))
  with check (school_id = public.current_school_id()
              and public.has_any_role(array['school_admin','receptionist']::public.app_role[]));

create policy student_guardians_read on public.student_guardians for select to authenticated
  using (
    school_id = public.current_school_id()
    and (
      public.has_any_role(array['school_admin','principal','receptionist','accountant']::public.app_role[])
      or public.is_guardian_of(student_id)
    )
  );
create policy student_guardians_write on public.student_guardians for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','receptionist']::public.app_role[]))
  with check (school_id = public.current_school_id()
              and public.has_any_role(array['school_admin','receptionist']::public.app_role[]));

-- Staff: other staff may read (names for class teachers, etc.); HR and admin write.
create policy staff_read on public.staff for select to authenticated
  using (
    school_id = public.current_school_id()
    and deleted_at is null
    and public.has_any_role(array[
      'school_admin','principal','teacher','hr_officer','accountant',
      'librarian','receptionist'
    ]::public.app_role[])
  );
create policy staff_write on public.staff for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','hr_officer']::public.app_role[]))
  with check (school_id = public.current_school_id()
              and public.has_any_role(array['school_admin','hr_officer']::public.app_role[]));

create policy enrollments_read on public.enrollments for select to authenticated
  using (public.can_view_enrollment(id));
create policy enrollments_write on public.enrollments for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','receptionist']::public.app_role[]))
  with check (school_id = public.current_school_id()
              and public.has_any_role(array['school_admin','receptionist']::public.app_role[]));

-- BECE index numbers: entered by the school (admin or reception).
create policy bece_read on public.bece_registrations for select to authenticated
  using (
    school_id = public.current_school_id()
    and public.has_any_role(array['school_admin','principal','receptionist']::public.app_role[])
  );
create policy bece_write on public.bece_registrations for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','receptionist']::public.app_role[]))
  with check (school_id = public.current_school_id()
              and public.has_any_role(array['school_admin','receptionist']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- Attendance and grading
-- ---------------------------------------------------------------------------

create policy attendance_read on public.attendance for select to authenticated
  using (public.can_view_enrollment(enrollment_id));
create policy attendance_write on public.attendance for all to authenticated
  using (public.can_teach_enrollment(enrollment_id))
  with check (school_id = public.current_school_id() and public.can_teach_enrollment(enrollment_id));

create policy assessments_read on public.assessments for select to authenticated
  using (
    school_id = public.current_school_id()
    and (
      public.has_any_role(array['school_admin','principal']::public.app_role[])
      or (public.has_role('teacher') and public.teaches_class_subject(class_subject_id))
    )
  );
create policy assessments_write on public.assessments for all to authenticated
  using (
    school_id = public.current_school_id()
    and (public.has_role('school_admin')
         or (public.has_role('teacher') and public.teaches_class_subject(class_subject_id)))
  )
  with check (
    school_id = public.current_school_id()
    and (public.has_role('school_admin')
         or (public.has_role('teacher') and public.teaches_class_subject(class_subject_id)))
  );

create policy scores_read on public.scores for select to authenticated
  using (public.can_view_enrollment(enrollment_id));
create policy scores_write on public.scores for all to authenticated
  using (public.can_teach_enrollment(enrollment_id))
  with check (school_id = public.current_school_id() and public.can_teach_enrollment(enrollment_id));

-- term_results is derived by trigger: readable, never directly writable.
create policy term_results_read on public.term_results for select to authenticated
  using (public.can_view_enrollment(enrollment_id));

create policy term_remarks_read on public.term_remarks for select to authenticated
  using (public.can_view_enrollment(enrollment_id));
create policy term_remarks_write on public.term_remarks for all to authenticated
  using (public.can_teach_enrollment(enrollment_id))
  with check (school_id = public.current_school_id() and public.can_teach_enrollment(enrollment_id));

-- ---------------------------------------------------------------------------
-- Finance: school_admin and accountant only. Parents read their own children's
-- billing. The principal has no finance access.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['fee_categories','fee_structures','discounts','student_discounts']
  loop
    execute format(
      'create policy %1$s_finance on public.%1$I for all to authenticated
         using (school_id = public.current_school_id()
                and public.has_any_role(array[''school_admin'',''accountant'']::public.app_role[]))
         with check (school_id = public.current_school_id()
                and public.has_any_role(array[''school_admin'',''accountant'']::public.app_role[]))', t);
  end loop;
end $$;

create policy invoices_finance on public.invoices for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','accountant']::public.app_role[]))
  with check (school_id = public.current_school_id()
              and public.has_any_role(array['school_admin','accountant']::public.app_role[]));
create policy invoices_parent_read on public.invoices for select to authenticated
  using (school_id = public.current_school_id() and deleted_at is null
         and public.has_role('parent') and public.is_guardian_of(student_id));

create policy invoice_items_finance on public.invoice_items for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','accountant']::public.app_role[]))
  with check (school_id = public.current_school_id()
              and public.has_any_role(array['school_admin','accountant']::public.app_role[]));
create policy invoice_items_parent_read on public.invoice_items for select to authenticated
  using (school_id = public.current_school_id() and public.has_role('parent')
         and exists (select 1 from public.invoices i
                     where i.id = invoice_id and public.is_guardian_of(i.student_id)));

create policy installments_finance on public.installments for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','accountant']::public.app_role[]))
  with check (school_id = public.current_school_id()
              and public.has_any_role(array['school_admin','accountant']::public.app_role[]));
create policy installments_parent_read on public.installments for select to authenticated
  using (school_id = public.current_school_id() and public.has_role('parent')
         and exists (select 1 from public.invoices i
                     where i.id = invoice_id and public.is_guardian_of(i.student_id)));

create policy payments_finance on public.payments for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','accountant']::public.app_role[]))
  with check (school_id = public.current_school_id()
              and public.has_any_role(array['school_admin','accountant']::public.app_role[]));
create policy payments_parent_read on public.payments for select to authenticated
  using (school_id = public.current_school_id() and public.has_role('parent')
         and exists (select 1 from public.invoices i
                     where i.id = invoice_id and public.is_guardian_of(i.student_id)));

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------

create policy announcements_read on public.announcements for select to authenticated
  using (
    school_id = public.current_school_id()
    and (
      public.has_role('school_admin')
      or (
        published_at is not null and published_at <= now()
        and (
          audience = 'all'
          or (audience = 'staff' and public.has_any_role(array[
                'principal','teacher','hr_officer','accountant','librarian','receptionist'
              ]::public.app_role[]))
          or (audience = 'parents' and public.has_role('parent'))
          or (audience = 'class' and (
                (public.has_role('teacher') and public.teaches_class(class_id))
                or (public.has_role('parent') and exists (
                      select 1 from public.enrollments e
                      where e.class_id = announcements.class_id
                        and public.is_guardian_of(e.student_id)))
             ))
        )
      )
    )
  );
create policy announcements_write on public.announcements for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','principal']::public.app_role[]))
  with check (school_id = public.current_school_id()
              and public.has_any_role(array['school_admin','principal']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- Audit log: readable by school_admin; written only by the audit trigger.
-- Nobody can update, delete or truncate it through the API.
-- ---------------------------------------------------------------------------

create policy audit_log_read on public.audit_log for select to authenticated
  using (school_id = public.current_school_id() and public.has_role('school_admin'));

revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
revoke all on public.term_results from anon;
revoke insert, update, delete, truncate on public.term_results from authenticated;

-- ---------------------------------------------------------------------------
-- Function hardening. PostgREST exposes public functions as RPC, so internal
-- SECURITY DEFINER functions must not be callable by clients. Triggers check
-- EXECUTE at creation time, so revoking here does not stop them firing.
-- ---------------------------------------------------------------------------

revoke execute on function public.issue_number(uuid, public.number_kind) from public, anon, authenticated;
revoke execute on function public.recompute_term_result(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.refresh_invoice_status(uuid) from public, anon, authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.students_assign_admission_no() from public, anon, authenticated;
revoke execute on function public.invoices_assign_number() from public, anon, authenticated;
revoke execute on function public.payments_assign_receipt() from public, anon, authenticated;
revoke execute on function public.scores_after_change() from public, anon, authenticated;
revoke execute on function public.payments_after_change() from public, anon, authenticated;
revoke execute on function public.invoice_items_after_change() from public, anon, authenticated;
