-- Edit and delete controls.
--
-- Rule: editing is for admins and developers; hard deletion is for developers
-- only, and only when nothing depends on the record. Anything with history is
-- archived or switched off instead, so grades, payments and the audit trail
-- stay intact.

-- ─── Reference data: admins may add and edit, only a developer may delete ───
do $$
declare t text;
begin
  foreach t in array array['academic_years', 'terms', 'classes', 'subjects']
  loop
    execute format('drop policy %I_write on public.%I', t, t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
         with check (school_id = public.current_school_id() and public.has_role(''school_admin''))', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
         using (school_id = public.current_school_id() and public.has_role(''school_admin''))
         with check (school_id = public.current_school_id() and public.has_role(''school_admin''))', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated
         using (school_id = public.current_school_id() and public.is_developer())', t);
  end loop;
end $$;

-- ─── Delete a student, only if they have no history ──────────────────────────
-- Meant for mistakes such as a test or duplicate admission. A student with
-- attendance, scores, remarks or any billing must be archived (completed or left).
create function public.delete_student_if_unused(p_student uuid) returns void
language plpgsql set search_path = public as $$
declare
  v_admission text;
  v_orphans uuid[];
begin
  if not public.is_developer() then
    raise exception 'only a developer can delete a student' using errcode = '42501';
  end if;

  select admission_no into v_admission from public.students where id = p_student;
  if v_admission is null then
    raise exception 'student not found or not permitted';
  end if;

  if exists (select 1 from public.enrollments e join public.attendance a on a.enrollment_id = e.id where e.student_id = p_student)
     or exists (select 1 from public.enrollments e join public.scores s on s.enrollment_id = e.id where e.student_id = p_student)
     or exists (select 1 from public.enrollments e join public.term_remarks r on r.enrollment_id = e.id where e.student_id = p_student)
     or exists (select 1 from public.invoices i where i.student_id = p_student)
     or exists (select 1 from public.student_discounts d where d.student_id = p_student) then
    raise exception 'student has records' using errcode = '23503';
  end if;

  -- Guardians that belong to no one else and have no login go with the student.
  select coalesce(array_agg(sg.guardian_id), '{}') into v_orphans
  from public.student_guardians sg
  where sg.student_id = p_student
    and not exists (select 1 from public.student_guardians o where o.guardian_id = sg.guardian_id and o.student_id <> p_student)
    and not exists (select 1 from public.guardians g where g.id = sg.guardian_id and g.profile_id is not null);

  delete from public.bece_registrations where student_id = p_student;
  delete from public.enrollments where student_id = p_student;
  delete from public.student_guardians where student_id = p_student;
  delete from public.students where id = p_student;
  delete from public.guardians where id = any (v_orphans);
end $$;

-- ─── Move a student to another class in that class's year ───────────────────
create function public.change_student_class(p_student uuid, p_class uuid) returns void
language plpgsql set search_path = public as $$
declare
  v_year uuid;
begin
  select academic_year_id into v_year from public.classes where id = p_class;
  if v_year is null then
    raise exception 'class not found or not permitted';
  end if;

  update public.enrollments set class_id = p_class, status = 'enrolled'
  where student_id = p_student and academic_year_id = v_year;

  if not found then
    insert into public.enrollments (student_id, class_id, academic_year_id)
    values (p_student, p_class, v_year);
  end if;
end $$;

-- ─── Guardians on an existing student ────────────────────────────────────────
create function public.add_student_guardian(p_student uuid, p_guardian jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  v_guardian uuid := nullif(p_guardian ->> 'id', '')::uuid;
begin
  if not exists (select 1 from public.students where id = p_student) then
    raise exception 'student not found or not permitted';
  end if;

  if v_guardian is null then
    insert into public.guardians (full_name, phone, relationship, email, occupation, employer, address)
    values (
      p_guardian ->> 'full_name', nullif(p_guardian ->> 'phone', ''), nullif(p_guardian ->> 'relationship', ''),
      nullif(p_guardian ->> 'email', ''), nullif(p_guardian ->> 'occupation', ''),
      nullif(p_guardian ->> 'employer', ''), nullif(p_guardian ->> 'address', '')
    ) returning id into v_guardian;
  end if;

  insert into public.student_guardians (student_id, guardian_id, is_primary, is_fee_payer, is_emergency_contact, can_pickup)
  values (
    p_student, v_guardian,
    coalesce((p_guardian ->> 'is_primary')::boolean, false),
    coalesce((p_guardian ->> 'is_fee_payer')::boolean, false),
    coalesce((p_guardian ->> 'is_emergency_contact')::boolean, false),
    coalesce((p_guardian ->> 'can_pickup')::boolean, true)
  );
  return v_guardian;
end $$;

-- Unlink a guardian from one student. The guardian record is deleted only if it
-- now belongs to no one and has no login.
create function public.remove_student_guardian(p_student uuid, p_guardian uuid) returns void
language plpgsql set search_path = public as $$
begin
  delete from public.student_guardians where student_id = p_student and guardian_id = p_guardian;
  delete from public.guardians g
  where g.id = p_guardian and g.profile_id is null
    and not exists (select 1 from public.student_guardians sg where sg.guardian_id = g.id);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'delete_student_if_unused(uuid)', 'change_student_class(uuid, uuid)',
    'add_student_guardian(uuid, jsonb)', 'remove_student_guardian(uuid, uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
