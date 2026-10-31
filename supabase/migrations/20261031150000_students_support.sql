-- Support for the Students screens.

-- Admit a student in one transaction: the student (admission number issued by
-- trigger), a guardian (new, or an existing one for siblings), the link, and the
-- class enrolment. Runs as the caller, so RLS limits it to admin and reception.
create function public.admit_student(
  p_first text,
  p_middle text,
  p_last text,
  p_dob date,
  p_gender public.gender,
  p_class uuid,
  p_medical text,
  p_guardian_id uuid,
  p_guardian_name text,
  p_guardian_phone text,
  p_guardian_relationship text,
  p_guardian_email text
) returns table (student_id uuid, admission_no text)
language plpgsql set search_path = public as $$
declare
  v_student uuid;
  v_number text;
  v_guardian uuid := p_guardian_id;
  v_year uuid;
begin
  insert into public.students (first_name, middle_name, last_name, date_of_birth, gender, medical_notes)
  values (p_first, nullif(p_middle, ''), p_last, p_dob, p_gender, nullif(p_medical, ''))
  returning id, students.admission_no into v_student, v_number;

  if v_guardian is null and coalesce(p_guardian_name, '') <> '' then
    insert into public.guardians (full_name, phone, relationship, email)
    values (p_guardian_name, nullif(p_guardian_phone, ''), nullif(p_guardian_relationship, ''), nullif(p_guardian_email, ''))
    returning id into v_guardian;
  end if;

  if v_guardian is not null then
    insert into public.student_guardians (student_id, guardian_id, is_primary)
    values (v_student, v_guardian, true);
  end if;

  if p_class is not null then
    select academic_year_id into v_year from public.classes where id = p_class;
    if v_year is null then
      raise exception 'class not found or not permitted';
    end if;
    insert into public.enrollments (student_id, class_id, academic_year_id)
    values (v_student, p_class, v_year);
  end if;

  return query select v_student, v_number;
end $$;

revoke execute on function public.admit_student(text, text, text, date, public.gender, uuid, text, uuid, text, text, text, text) from public, anon;
grant execute on function public.admit_student(text, text, text, date, public.gender, uuid, text, uuid, text, text, text, text) to authenticated;

-- Record who entered a BECE index number, and when. Set by the database so the
-- browser cannot claim someone else entered it.
create function public.bece_stamp_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.index_number is not null
     and (tg_op = 'INSERT' or new.index_number is distinct from old.index_number) then
    new.entered_by := auth.uid();
    new.entered_on := now();
  end if;
  return new;
end $$;

revoke execute on function public.bece_stamp_entry() from public, anon, authenticated;

create trigger bece_stamp_entry
before insert or update on public.bece_registrations
for each row execute function public.bece_stamp_entry();
