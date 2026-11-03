-- Demo data for Pinks Academy: staff, families, students in every class, three
-- weeks of attendance, Term 1 invoices with a realistic mix of paid, part-paid
-- and unpaid, first-term scores, remarks and notices.
--
-- Every phone number is one of two numbers (0248594482, 0204906780), so any SMS
-- test can only ever reach them.
--
-- Run:    supabase db query --linked -f supabase/demo/seed_demo.sql
-- Remove: supabase db query --linked -f supabase/demo/remove_demo.sql
--
-- Demo rows are recognisable by an @demo.invalid email (parents, staff) or by the
-- creation date 2026-01-01 (assessments, notices); nothing else is touched.

do $$
declare
  sch uuid; yr uuid; trm uuid;
  phones text[] := array['0248594482', '0204906780'];
  girls text[] := array['Ama','Akua','Abena','Adwoa','Esi','Efua','Yaa','Afia','Akosua','Naa','Adjoa','Selina','Priscilla','Gifty','Mavis','Patience','Joyce','Ewurama','Nhyira','Maame','Dorcas','Mabel','Linda','Vivian'];
  boys text[] := array['Kofi','Kwame','Kwabena','Kwaku','Yaw','Kojo','Kwesi','Daniel','Emmanuel','Samuel','Prince','Nii','Papa','Kelvin','Joshua','Jeremiah','Eric','Enoch','Nathaniel','Isaac','Caleb','Elvis','Benjamin','Jerry'];
  mids text[] := array['Nana','Owusu','Kwadwo','Mensima','Serwaa','Boakye','Ohene','Pokua','Gyasi','Manu','Dede','Lamisi','Ayeley','Kekeli'];
  surnames text[] := array['Mensah','Owusu','Asante','Boateng','Appiah','Osei','Agyemang','Adjei','Quaye','Tetteh','Amoah','Ansah','Addo','Darko','Ofori','Acheampong','Sarpong','Opoku','Frimpong','Antwi','Annan','Quartey','Lamptey','Armah','Ankrah','Kyei','Baidoo','Donkor','Gyamfi','Aidoo','Bonsu','Yeboah','Danso','Tagoe','Nartey','Ocloo'];
  suburbs text[] := array['Adenta Housing Down','Madina Estates','Teshie Nungua Estates','Tema Community 18','Kasoa Millennium City','Dome Pillar 2','Spintex Baatsona','East Legon Hills','Ashaley Botwe','Haatso','Lapaz','Weija'];
  mother_jobs text[] := array['Trader','Teacher','Nurse','Seamstress','Civil servant','Hairdresser','Banker','Caterer','Pharmacist','Administrator'];
  father_jobs text[] := array['Driver','Electrician','Civil servant','Engineer','Mechanic','Accountant','Police officer','Carpenter','Trader','Technician'];
  places text[] := array['Accra','Tema','Kumasi','Cape Coast','Koforidua','Takoradi','Ho'];
  langs text[] := array['Twi','Ga','Ewe','Fante','English','Twi'];
  blood text[] := array['O+','O+','A+','B+','AB+','O-','A-'];
  per_class int[] := array[6,7,7,8,8,9,9,9,9,8,8,8,7,7];
  teachers text[] := array['Abena Owusu','Efua Quaye','Grace Tetteh','Adwoa Frimpong','Comfort Asare','Kwabena Boateng','Mavis Ankrah','Daniel Amoah','Priscilla Addo','Samuel Ofori','Gifty Sarpong','Emmanuel Darko','Rebecca Nyarko','Isaac Antwi'];
  cl record; i int; n int; j int; k int; fam int := 0; f int;
  fam_surname text[] := '{}'; fam_mother uuid[] := '{}'; fam_father uuid[] := '{}'; fam_phone int[] := '{}';
  surname text; fname text; sex public.gender; g_m uuid; g_f uuid; s_id uuid; e_id uuid;
  suburb text; addr text; dob date; new_adm boolean; adm date; phone_i int;
  inv record; pay_total numeric; pct int; paid numeric; amt numeric; method public.payment_method; net public.momo_network;
  rem_phrases text[] := array[
    'A cheerful child who is settling in well and enjoys group play.',
    'Shows good progress in recognising letters and numbers. Needs encouragement to share toys.',
    'Participates eagerly in songs and rhymes. Fine motor skills are developing nicely.',
    'Quiet but attentive. Is beginning to express herself more confidently in class.',
    'Very curious and eager to learn. Follows instructions well and helps classmates.',
    'Works independently and finishes tasks on time. Handwriting is improving steadily.'];
begin
  select id into sch from public.schools where name = 'Pinks Academy';
  select id into yr from public.academic_years where school_id = sch and is_current;
  select id into trm from public.terms where school_id = sch and is_current;
  if sch is null or yr is null or trm is null then
    raise exception 'The school, current academic year and current term must exist first.';
  end if;
  if exists (select 1 from public.guardians where email like '%@demo.invalid') then
    raise exception 'Demo data is already loaded. Run remove_demo.sql first.';
  end if;
  perform setseed(0.2026);

  -- ── Staff ────────────────────────────────────────────────────────────────
  i := 0;
  for cl in select c.id, l.name lvl from public.classes c join public.levels l on l.id = c.level_id
            where c.academic_year_id = yr order by l.sort_order loop
    i := i + 1;
    insert into public.staff (school_id, full_name, role_title, type, phone, email, hired_on)
    values (sch, teachers[i], 'Class Teacher, ' || cl.lvl, 'teaching', phones[1 + i % 2],
            lower(replace(teachers[i], ' ', '.')) || '@demo.invalid',
            date '2015-09-01' + (random() * 3500)::int);
    update public.classes
       set class_teacher_id = (select id from public.staff where email = lower(replace(teachers[i], ' ', '.')) || '@demo.invalid')
     where id = cl.id;
  end loop;
  insert into public.staff (school_id, full_name, role_title, type, phone, email, hired_on) values
    (sch, 'Joyce Aidoo', 'Bursar', 'non_teaching', phones[1], 'joyce.aidoo@demo.invalid', '2017-01-09'),
    (sch, 'Patience Lamptey', 'School Secretary', 'non_teaching', phones[2], 'patience.lamptey@demo.invalid', '2019-09-02'),
    (sch, 'Francis Donkor', 'Caretaker', 'non_teaching', phones[1], 'francis.donkor@demo.invalid', '2016-05-16');

  -- Subject teachers: the class teacher, except Computing and French
  update public.class_subjects cs set teacher_id = c.class_teacher_id
    from public.classes c where c.id = cs.class_id and c.academic_year_id = yr;
  update public.class_subjects cs set teacher_id = (select id from public.staff where email = 'isaac.antwi@demo.invalid')
    from public.subjects s where s.id = cs.subject_id and s.name = 'Computing';
  update public.class_subjects cs set teacher_id = (select id from public.staff where email = 'rebecca.nyarko@demo.invalid')
    from public.subjects s where s.id = cs.subject_id and s.name = 'French';

  -- ── Families, students, enrolments ───────────────────────────────────────
  k := 0;
  for cl in select c.id from public.classes c join public.levels l on l.id = c.level_id
            where c.academic_year_id = yr order by l.sort_order loop
    k := k + 1;
    for j in 1 .. per_class[k] loop
      if fam > 0 and random() < 0.22 then
        f := 1 + (random() * (fam - 1))::int;            -- a brother or sister of an earlier child
        surname := fam_surname[f]; g_m := fam_mother[f]; g_f := fam_father[f];
      else
        fam := fam + 1; f := fam;
        surname := surnames[1 + (random() * (array_length(surnames, 1) - 1))::int];
        suburb := suburbs[1 + (random() * (array_length(suburbs, 1) - 1))::int];
        addr := 'H/No. ' || (1 + (random() * 90)::int) || ', ' || suburb || ', Greater Accra';
        phone_i := 1 + fam % 2;
        fname := girls[1 + (random() * 23)::int];
        insert into public.guardians (school_id, full_name, phone, email, relationship, occupation, address)
        values (sch, fname || ' ' || surname, phones[phone_i], lower(fname || '.' || surname || fam) || '@demo.invalid',
                'Mother', mother_jobs[1 + (random() * 9)::int], addr)
        returning id into g_m;
        g_f := null;
        if random() < 0.55 then
          fname := boys[1 + (random() * 23)::int];
          insert into public.guardians (school_id, full_name, phone, email, relationship, occupation, address)
          values (sch, fname || ' ' || surname, phones[3 - phone_i], lower(fname || '.' || surname || fam || 'f') || '@demo.invalid',
                  'Father', father_jobs[1 + (random() * 9)::int], addr)
          returning id into g_f;
        end if;
        fam_surname := fam_surname || surname; fam_mother := fam_mother || g_m; fam_father := fam_father || g_f;
        fam_phone := fam_phone || phone_i;
      end if;

      sex := case when random() < 0.5 then 'female' else 'male' end;
      fname := case when sex = 'female' then girls[1 + (random() * 23)::int] else boys[1 + (random() * 23)::int] end;
      dob := make_date(2025 - k, 1 + (random() * 11)::int, 1 + (random() * 27)::int);
      new_adm := k <= 2 or random() < 0.15;
      adm := case when new_adm then date '2026-08-20' + (random() * 18)::int
                  else date '2026-09-07' - ((random() * least(k - 1, 6))::int * 365 + 30 + (random() * 60)::int) end;

      insert into public.students (school_id, first_name, middle_name, last_name, date_of_birth, gender, admitted_on,
          medical_notes, place_of_birth, religion, home_language, residence_address, nhis_no, blood_group, allergies,
          transport_mode, previous_school, consent_medical, consent_photo, birth_cert_no)
      values (sch, fname, case when random() < 0.6 then mids[1 + (random() * 13)::int] end, surname, dob, sex, adm,
          case when random() < 0.05 then (array['Asthma. Carries an inhaler.','Wears glasses.','Sickle cell trait. No special care needed.'])[1 + (random() * 2)::int] end,
          places[1 + (random() * 6)::int],
          case when random() < 0.78 then 'Christian' when random() < 0.9 then 'Muslim' else 'Other' end,
          langs[1 + (random() * 5)::int],
          (select address from public.guardians where id = g_m),
          lpad((random() * 99999999)::bigint::text, 8, '0'),
          blood[1 + (random() * 6)::int],
          case when random() < 0.08 then (array['Peanuts','Eggs','Penicillin','Dust'])[1 + (random() * 3)::int] end,
          (array['walk','school_bus','private_car','public_transport'])[1 + (random() * 3)::int],
          case when k > 2 and new_adm then (array['Little Angels Preparatory','Bright Future School','Grace Academy','St. Marys Basic'])[1 + (random() * 3)::int] end,
          true, random() < 0.85, 'BC' || lpad((random() * 9999999)::bigint::text, 7, '0'))
      returning id into s_id;

      insert into public.enrollments (school_id, student_id, class_id, academic_year_id)
        values (sch, s_id, cl.id, yr) returning id into e_id;
      insert into public.student_guardians (school_id, student_id, guardian_id, is_primary, can_pickup, is_fee_payer, is_emergency_contact)
        values (sch, s_id, g_m, true, true, true, true);
      if g_f is not null then
        insert into public.student_guardians (school_id, student_id, guardian_id, is_primary, can_pickup, is_fee_payer, is_emergency_contact)
          values (sch, s_id, g_f, false, true, false, true);
      end if;
    end loop;
  end loop;

  -- ── Attendance: the last three weeks of school days, with some absentees today
  insert into public.attendance (school_id, enrollment_id, date, status, note)
  select sch, e.id, d.dt,
         (case when d.r < case when d.dt = current_date then 0.07 else 0.04 end then 'absent'
               when d.r < 0.07 then 'late' when d.r < 0.08 then 'excused' else 'present' end)::public.attendance_status,
         case when d.r < 0.04 then (array['Sick. Parent called.','Family event.','No reason given.'])[1 + (random() * 2)::int] end
  from public.enrollments e
  cross join lateral (
    select gs::date as dt, random() as r from generate_series(current_date - 21, current_date, interval '1 day') gs
  ) d
  where e.academic_year_id = yr
    and e.student_id in (select sg.student_id from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where g.email like '%@demo.invalid')
    and extract(isodow from d.dt) < 6
    and d.dt >= (select start_date from public.terms where id = trm);

  -- ── Fees for Term 1 ──────────────────────────────────────────────────────
  insert into public.fee_structures (school_id, fee_category_id, level_id, term_id, amount)
  select sch, fc.id, l.id, case when fc.is_one_off then null else trm end,
         case fc.name
           when 'School fees' then (array[800,850,900,1000,1050,1200,1250,1300,1350,1400,1450,1700,1750,1900])[l.sort_order]
           when 'Books and stationery' then (array[150,150,180,220,250,300,300,320,320,350,350,420,420,480])[l.sort_order]
           else case when l.sort_order <= 5 then 300 when l.sort_order <= 11 then 350 else 400 end end
  from public.levels l cross join public.fee_categories fc
  where l.school_id = sch and fc.school_id = sch;

  -- Invoices: school fees and books, admission for new pupils, 10% off school fees for a second child
  insert into public.invoices (school_id, student_id, term_id, issued_on, due_on)
  select sch, s.id, trm, date '2026-09-07', date '2026-10-09'
  from public.students s
  where s.id in (select sg.student_id from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where g.email like '%@demo.invalid');

  insert into public.invoice_items (school_id, invoice_id, fee_category_id, kind, description, amount)
  select sch, i.id, fs.fee_category_id, 'fee', fc.name || case when fc.is_one_off then '' else ' - Term 1 2026/2027' end, fs.amount
  from public.invoices i
  join public.students s on s.id = i.student_id
  join public.enrollments e on e.student_id = s.id and e.academic_year_id = yr
  join public.classes c on c.id = e.class_id
  join public.fee_structures fs on fs.level_id = c.level_id and (fs.term_id = trm or fs.term_id is null)
  join public.fee_categories fc on fc.id = fs.fee_category_id
  where i.term_id = trm
    and (not fc.is_one_off or s.admitted_on >= date '2026-08-01');

  insert into public.invoice_items (school_id, invoice_id, fee_category_id, kind, description, amount)
  select sch, x.invoice_id, x.cat, 'discount', 'Sibling discount (10%)', -round(x.fee * 0.10, 2)
  from (
    select i.id invoice_id, it.fee_category_id cat, it.amount fee,
           row_number() over (partition by sg.guardian_id order by s.admitted_on, s.id) rn
    from public.invoices i
    join public.students s on s.id = i.student_id
    join public.student_guardians sg on sg.student_id = s.id and sg.is_primary
    join public.invoice_items it on it.invoice_id = i.id and it.kind = 'fee'
    join public.fee_categories fc on fc.id = it.fee_category_id and fc.name = 'School fees'
    where i.term_id = trm
  ) x where x.rn >= 2;

  -- Payments: about 40% settled, 35% part-paid, 25% nothing yet
  for inv in
    select i.id, sum(it.amount) total, abs(hashtext(i.id::text)) % 100 bucket,
           (select sg.guardian_id from public.student_guardians sg where sg.student_id = i.student_id and sg.is_primary) gid
    from public.invoices i join public.invoice_items it on it.invoice_id = i.id
    where i.term_id = trm group by i.id, i.student_id
  loop
    if inv.bucket < 40 then pay_total := inv.total;
    elsif inv.bucket < 75 then pay_total := round((inv.total * (0.35 + random() * 0.35)) / 10) * 10;
    else continue; end if;
    paid := 0;
    for n in 1 .. case when inv.bucket < 40 and random() < 0.4 then 2 else 1 end loop
      amt := case when n = 1 and pay_total = inv.total and random() < 0.4 then round(pay_total * 0.6 / 10) * 10
                  when n = 1 then pay_total else pay_total - paid end;
      continue when amt <= 0;
      pct := (random() * 100)::int;
      method := case when pct < 40 then 'cash' when pct < 85 then 'mobile_money' else 'bank_transfer' end;
      net := case when method = 'mobile_money' then (array['mtn','mtn','mtn','telecel','airteltigo'])[1 + (random() * 4)::int]::public.momo_network end;
      insert into public.payments (school_id, invoice_id, amount, method, network, reference, paid_on, paid_by_guardian_id)
      values (sch, inv.id, amt, method, net,
              case method when 'mobile_money' then lpad((random() * 99999999999)::bigint::text, 11, '0')
                          when 'bank_transfer' then 'GCB-' || lpad((random() * 99999999)::bigint::text, 8, '0') end,
              least(current_date, date '2026-09-08' + (random() * 50)::int + (n - 1) * 9), inv.gid);
      paid := paid + amt;
    end loop;
  end loop;

  -- Instalment plans on some invoices that are not fully paid
  insert into public.installments (school_id, invoice_id, due_on, amount)
  select sch, x.id, d.due, case when d.n = 3 then x.total - 2 * round(x.total / 3, 2) else round(x.total / 3, 2) end
  from (select i.id, sum(it.amount) total from public.invoices i join public.invoice_items it on it.invoice_id = i.id
        where i.term_id = trm and i.status <> 'paid' and abs(hashtext(i.id::text || 'p')) % 100 < 30 group by i.id) x
  cross join (values (1, date '2026-10-09'), (2, date '2026-11-13'), (3, date '2026-12-04')) d(n, due);

  -- ── First-term scores for the numeric classes ────────────────────────────
  insert into public.assessments (school_id, class_subject_id, term_id, type, title, max_score, weight, created_at)
  select sch, cs.id, trm, a.type::public.assessment_type, a.title, a.max, a.weight, timestamptz '2026-01-01 00:00+00'
  from public.class_subjects cs
  join public.classes c on c.id = cs.class_id and c.academic_year_id = yr
  join public.levels l on l.id = c.level_id and l.sort_order >= 6
  cross join (values ('class_exercise', 'Class exercise 1', 20, 10), ('ca_test', 'Class test 1', 40, 20)) a(type, title, max, weight);

  insert into public.scores (school_id, assessment_id, enrollment_id, score)
  select sch, a.id, e.id,
         round(a.max_score * greatest(0.15, least(1.0,
           0.35 + 0.55 * ((abs(hashtext(e.student_id::text)) % 256) / 255.0) + (random() - 0.5) * 0.18)))
  from public.assessments a
  join public.class_subjects cs on cs.id = a.class_subject_id
  join public.enrollments e on e.class_id = cs.class_id and e.academic_year_id = yr
  where a.created_at = timestamptz '2026-01-01 00:00+00' and random() > 0.03;

  -- Descriptive remarks for creche to KG 2
  insert into public.term_remarks (school_id, enrollment_id, term_id, remark)
  select sch, e.id, trm, rem_phrases[1 + (abs(hashtext(e.id::text)) % 6)]
  from public.enrollments e
  join public.classes c on c.id = e.class_id
  join public.levels l on l.id = c.level_id and l.sort_order <= 5
  where e.academic_year_id = yr;

  -- ── Notices ──────────────────────────────────────────────────────────────
  insert into public.announcements (school_id, title, body, audience, published_at, created_at) values
    (sch, 'PTA meeting on Saturday 14 November', 'Parents are invited to the termly PTA meeting at 9:00 am in the school hall. Please be on time. Light refreshments will be served.', 'parents', now() - interval '2 days', timestamptz '2026-01-01 00:00+00'),
    (sch, 'Mid-term break', 'School closes for the mid-term break on Thursday 19 November and reopens on Monday 23 November. Wishing everyone a restful break.', 'all', now() - interval '4 days', timestamptz '2026-01-01 00:00+00'),
    (sch, 'Staff meeting on Friday', 'All teaching and non-teaching staff should meet in the staffroom at 2:30 pm on Friday to review Term 1 progress and prepare for end-of-term examinations.', 'staff', now() - interval '1 day', timestamptz '2026-01-01 00:00+00'),
    (sch, 'Term 1 fees reminder', 'Parents with outstanding Term 1 fees are kindly asked to settle their balances at the school office or by mobile money before the end of November.', 'parents', now() - interval '6 days', timestamptz '2026-01-01 00:00+00');

  raise notice 'Demo data loaded: % students, % families', (select count(*) from public.students), fam;
end $$;
