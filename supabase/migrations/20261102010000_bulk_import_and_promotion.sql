-- Bulk CSV/Excel Import (Students & Staff) and Year-End Class Promotion / Graduation Wizard.

-- 1. Bulk admit students in one transaction:
--    Each item in p_rows is:
--    {
--      "first_name": "Ama",
--      "middle_name": "K.",
--      "last_name": "Mensah",
--      "date_of_birth": "2015-05-14",
--      "gender": "female",
--      "admitted_on": "2026-09-01",
--      "residence_address": "East Legon",
--      "guardian_name": "Kofi Mensah",
--      "guardian_phone": "0240000000",
--      "guardian_relationship": "Father",
--      "guardian_email": "kofi@example.com"
--    }
--    Reuses existing guardians within the school when guardian_phone matches!
create or replace function public.bulk_admit_students(
  p_rows jsonb,
  p_class uuid default null
) returns table (student_id uuid, admission_no text, full_name text)
language plpgsql set search_path = public as $$
declare
  v_school uuid := public.current_school_id();
  v_year uuid := null;
  v_student uuid;
  v_number text;
  v_guardian uuid;
  v_phone text;
  v_gname text;
  r jsonb;
begin
  if not public.has_any_role(array['school_admin','receptionist']::public.app_role[]) then
    raise exception 'permission denied for bulk student import';
  end if;

  if p_class is not null then
    select c.academic_year_id into v_year
    from public.classes c
    where c.id = p_class and c.school_id = v_school;
    if v_year is null then
      raise exception 'target class not found in your school';
    end if;
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    continue when coalesce(trim(r ->> 'first_name'), '') = ''
               or coalesce(trim(r ->> 'last_name'), '') = '';

    insert into public.students (
      school_id,
      admission_no,
      first_name,
      middle_name,
      last_name,
      date_of_birth,
      gender,
      admitted_on,
      residence_address,
      nationality,
      medical_notes
    ) values (
      v_school,
      '', -- Trigger students_assign_admission_no issues sequential number
      trim(r ->> 'first_name'),
      nullif(trim(coalesce(r ->> 'middle_name', '')), ''),
      trim(r ->> 'last_name'),
      nullif(trim(coalesce(r ->> 'date_of_birth', '')), '')::date,
      case
        when lower(trim(coalesce(r ->> 'gender', ''))) in ('female', 'f', 'girl') then 'female'::public.gender
        when lower(trim(coalesce(r ->> 'gender', ''))) in ('male', 'm', 'boy') then 'male'::public.gender
        else null
      end,
      coalesce(nullif(trim(coalesce(r ->> 'admitted_on', '')), '')::date, current_date),
      nullif(trim(coalesce(r ->> 'residence_address', '')), ''),
      coalesce(nullif(trim(coalesce(r ->> 'nationality', '')), ''), 'Ghanaian'),
      nullif(trim(coalesce(r ->> 'medical_notes', '')), '')
    )
    returning id, students.admission_no into v_student, v_number;

    -- Link or create primary guardian if provided
    v_guardian := null;
    v_phone := regexp_replace(coalesce(r ->> 'guardian_phone', ''), '[\s\-()]', '', 'g');
    v_gname := trim(coalesce(r ->> 'guardian_name', ''));

    if length(v_phone) >= 7 then
      select g.id into v_guardian
      from public.guardians g
      where g.school_id = v_school
        and g.deleted_at is null
        and g.phone = v_phone
      limit 1;
    end if;

    if v_guardian is null and v_gname <> '' then
      insert into public.guardians (
        school_id,
        full_name,
        phone,
        relationship,
        email
      ) values (
        v_school,
        v_gname,
        nullif(v_phone, ''),
        coalesce(nullif(trim(coalesce(r ->> 'guardian_relationship', '')), ''), 'Guardian'),
        nullif(trim(coalesce(r ->> 'guardian_email', '')), '')
      )
      returning id into v_guardian;
    end if;

    if v_guardian is not null then
      insert into public.student_guardians (
        school_id,
        student_id,
        guardian_id,
        is_primary,
        is_fee_payer,
        is_emergency_contact,
        can_pickup
      ) values (
        v_school,
        v_student,
        v_guardian,
        true,
        true,
        true,
        true
      ) on conflict (student_id, guardian_id) do nothing;
    end if;

    if p_class is not null and v_year is not null then
      insert into public.enrollments (
        school_id,
        student_id,
        class_id,
        academic_year_id
      ) values (
        v_school,
        v_student,
        p_class,
        v_year
      ) on conflict (student_id, academic_year_id) do update
        set class_id = excluded.class_id;
    end if;

    student_id := v_student;
    admission_no := v_number;
    full_name := trim(concat_ws(' ', r ->> 'first_name', nullif(trim(coalesce(r ->> 'middle_name', '')), ''), r ->> 'last_name'));
    return next;
  end loop;
end $$;

revoke execute on function public.bulk_admit_students(jsonb, uuid) from public, anon;
grant execute on function public.bulk_admit_students(jsonb, uuid) to authenticated;

-- 2. Class Promotion & Graduation Wizard RPC:
--    p_action: 'promote' | 'repeat' | 'graduate'
--    - 'promote' or 'repeat': marks source enrollments as 'promoted' or 'repeated'
--      and creates/updates target enrollments in p_to_class (and its academic_year_id).
--    - 'graduate': marks source enrollments as 'completed' and updates students.status = 'completed'.
create or replace function public.promote_class_students(
  p_from_class uuid,
  p_student_ids uuid[],
  p_action text,
  p_to_class uuid default null
) returns int
language plpgsql set search_path = public as $$
declare
  v_school uuid := public.current_school_id();
  v_from_year uuid;
  v_to_year uuid;
  v_sid uuid;
  v_count int := 0;
begin
  if not public.has_any_role(array['school_admin','receptionist']::public.app_role[]) then
    raise exception 'permission denied for class promotion';
  end if;

  if p_action not in ('promote', 'repeat', 'graduate') then
    raise exception 'invalid promotion action: %', p_action;
  end if;

  select c.academic_year_id into v_from_year
  from public.classes c
  where c.id = p_from_class and c.school_id = v_school;

  if v_from_year is null then
    raise exception 'source class not found';
  end if;

  if p_action in ('promote', 'repeat') then
    if p_to_class is null then
      raise exception 'destination class is required for promote or repeat';
    end if;
    select c.academic_year_id into v_to_year
    from public.classes c
    where c.id = p_to_class and c.school_id = v_school;

    if v_to_year is null then
      raise exception 'destination class not found';
    end if;
  end if;

  foreach v_sid in array coalesce(p_student_ids, '{}'::uuid[])
  loop
    if p_action = 'graduate' then
      update public.enrollments
        set status = 'completed'
        where school_id = v_school
          and student_id = v_sid
          and class_id = p_from_class;

      update public.students
        set status = 'completed',
            left_on = coalesce(left_on, current_date),
            left_reason = coalesce(left_reason, 'Graduated / Completed final level')
        where id = v_sid and school_id = v_school;

      v_count := v_count + 1;
    else
      -- If moving to a new academic year, mark old enrollment as promoted/repeated
      -- and insert/update enrollment in destination year.
      if v_to_year <> v_from_year then
        update public.enrollments
          set status = case when p_action = 'repeat' then 'repeated'::public.enrollment_status else 'promoted'::public.enrollment_status end
          where school_id = v_school
            and student_id = v_sid
            and class_id = p_from_class;

        insert into public.enrollments (school_id, student_id, class_id, academic_year_id, status)
        values (v_school, v_sid, p_to_class, v_to_year, 'enrolled')
        on conflict (student_id, academic_year_id)
        do update set class_id = excluded.class_id, status = 'enrolled';
      else
        -- Within the same academic year: move student to destination class
        update public.enrollments
          set class_id = p_to_class
          where school_id = v_school
            and student_id = v_sid
            and academic_year_id = v_from_year;
      end if;

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end $$;

revoke execute on function public.promote_class_students(uuid, uuid[], text, uuid) from public, anon;
grant execute on function public.promote_class_students(uuid, uuid[], text, uuid) to authenticated;

