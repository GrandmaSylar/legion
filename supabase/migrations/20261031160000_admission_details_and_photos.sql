-- Fuller admission record, several guardians per admission, and student photos.

-- ─── Student details ─────────────────────────────────────────────────────────
alter table public.students
  add column place_of_birth text,
  add column nationality text default 'Ghanaian',
  add column religion text,
  add column home_language text,
  add column residence_address text,
  add column birth_cert_no text,
  add column nhis_no text,
  add column blood_group text
    check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  add column allergies text,
  add column special_needs text,
  add column previous_school text,
  add column previous_class text,
  add column previous_school_reason text,
  add column transport_mode text
    check (transport_mode in ('walk','school_bus','private_car','public_transport','other')),
  add column consent_medical boolean not null default false,
  add column consent_photo boolean not null default false,
  -- keys: birth_certificate, passport_photo, previous_report, immunisation_card, nhis_card
  add column documents_received text[] not null default '{}';

-- A birth certificate number identifies one child; catch accidental duplicates.
create unique index students_birth_cert_unique
  on public.students (school_id, birth_cert_no) where birth_cert_no is not null;

alter table public.guardians add column employer text;

alter table public.student_guardians
  add column is_fee_payer boolean not null default false,
  add column is_emergency_contact boolean not null default false;

-- ─── Admit: one student, one class, any number of guardians ─────────────────
drop function public.admit_student(text, text, text, date, public.gender, uuid, text, uuid, text, text, text, text);

create function public.admit_student(p_student jsonb, p_class uuid, p_guardians jsonb)
returns table (student_id uuid, admission_no text)
language plpgsql set search_path = public as $$
declare
  v_student uuid;
  v_number text;
  v_year uuid;
  v_guardian uuid;
  v_index int := 0;
  g jsonb;
begin
  insert into public.students (
    first_name, middle_name, last_name, date_of_birth, gender, admitted_on,
    place_of_birth, nationality, religion, home_language, residence_address,
    birth_cert_no, nhis_no, blood_group, allergies, medical_notes, special_needs,
    previous_school, previous_class, previous_school_reason, transport_mode,
    consent_medical, consent_photo, documents_received
  ) values (
    p_student ->> 'first_name',
    nullif(p_student ->> 'middle_name', ''),
    p_student ->> 'last_name',
    nullif(p_student ->> 'date_of_birth', '')::date,
    (p_student ->> 'gender')::public.gender,
    coalesce(nullif(p_student ->> 'admitted_on', '')::date, current_date),
    nullif(p_student ->> 'place_of_birth', ''),
    coalesce(nullif(p_student ->> 'nationality', ''), 'Ghanaian'),
    nullif(p_student ->> 'religion', ''),
    nullif(p_student ->> 'home_language', ''),
    nullif(p_student ->> 'residence_address', ''),
    nullif(p_student ->> 'birth_cert_no', ''),
    nullif(p_student ->> 'nhis_no', ''),
    nullif(p_student ->> 'blood_group', ''),
    nullif(p_student ->> 'allergies', ''),
    nullif(p_student ->> 'medical_notes', ''),
    nullif(p_student ->> 'special_needs', ''),
    nullif(p_student ->> 'previous_school', ''),
    nullif(p_student ->> 'previous_class', ''),
    nullif(p_student ->> 'previous_school_reason', ''),
    nullif(p_student ->> 'transport_mode', ''),
    coalesce((p_student ->> 'consent_medical')::boolean, false),
    coalesce((p_student ->> 'consent_photo')::boolean, false),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_student -> 'documents_received', '[]'::jsonb))), '{}')
  )
  returning id, students.admission_no into v_student, v_number;

  for g in select * from jsonb_array_elements(coalesce(p_guardians, '[]'::jsonb))
  loop
    v_guardian := nullif(g ->> 'id', '')::uuid;
    if v_guardian is null then
      continue when coalesce(g ->> 'full_name', '') = '';
      insert into public.guardians (full_name, phone, relationship, email, occupation, employer, address)
      values (
        g ->> 'full_name', nullif(g ->> 'phone', ''), nullif(g ->> 'relationship', ''),
        nullif(g ->> 'email', ''), nullif(g ->> 'occupation', ''), nullif(g ->> 'employer', ''),
        nullif(g ->> 'address', '')
      ) returning id into v_guardian;
    end if;

    insert into public.student_guardians
      (student_id, guardian_id, is_primary, is_fee_payer, is_emergency_contact, can_pickup)
    values (
      v_student, v_guardian,
      coalesce((g ->> 'is_primary')::boolean, v_index = 0),
      coalesce((g ->> 'is_fee_payer')::boolean, false),
      coalesce((g ->> 'is_emergency_contact')::boolean, false),
      coalesce((g ->> 'can_pickup')::boolean, true)
    );
    v_index := v_index + 1;
  end loop;

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

revoke execute on function public.admit_student(jsonb, uuid, jsonb) from public, anon;
grant execute on function public.admit_student(jsonb, uuid, jsonb) to authenticated;

-- ─── Photos: a private bucket, read through short-lived signed links ────────
-- Files live at {student_id}/photo.jpg. Access follows the students table's own
-- RLS, so a teacher or parent can only fetch photos of students they can see.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy student_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'student-photos'
    and exists (select 1 from public.students s where s.id::text = (storage.foldername(name))[1])
  );

create policy student_photos_write on storage.objects for all to authenticated
  using (
    bucket_id = 'student-photos'
    and public.has_any_role(array['school_admin', 'receptionist']::public.app_role[])
    and exists (select 1 from public.students s where s.id::text = (storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'student-photos'
    and public.has_any_role(array['school_admin', 'receptionist']::public.app_role[])
    and exists (select 1 from public.students s where s.id::text = (storage.foldername(name))[1])
  );
