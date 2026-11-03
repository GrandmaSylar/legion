-- Removes everything seed_demo.sql loaded, and nothing else: parents and staff with
-- an @demo.invalid email, the students linked only to them, and rows created on
-- 2026-01-01 (demo assessments and notices). When no real students or invoices are
-- left, the number counters restart so real numbering begins at the start.
--
-- Run: supabase db query --linked -f supabase/demo/remove_demo.sql

do $$
declare sch uuid; demo_students uuid[];
begin
  select id into sch from public.schools where name = 'Pinks Academy';

  select coalesce(array_agg(distinct sg.student_id), '{}') into demo_students
  from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
  where g.email like '%@demo.invalid';

  delete from public.payments where invoice_id in (select id from public.invoices where student_id = any (demo_students));
  delete from public.installments where invoice_id in (select id from public.invoices where student_id = any (demo_students));
  delete from public.invoice_items where invoice_id in (select id from public.invoices where student_id = any (demo_students));
  delete from public.invoices where student_id = any (demo_students);
  -- The demo fee structures are the only ones, unless the school has set its own since
  if not exists (select 1 from public.fee_structures where created_at > timestamptz '2026-11-01') then
    delete from public.fee_structures where school_id = sch;
  end if;

  delete from public.messages where guardian_id in (select id from public.guardians where email like '%@demo.invalid')
                                 or staff_id in (select id from public.staff where email like '%@demo.invalid');
  delete from public.message_batches b where not exists (select 1 from public.messages m where m.batch_id = b.id);

  delete from public.assessments where created_at = timestamptz '2026-01-01 00:00+00';   -- scores go with them
  delete from public.announcements where created_at = timestamptz '2026-01-01 00:00+00';

  delete from public.term_remarks where enrollment_id in (select id from public.enrollments where student_id = any (demo_students));
  delete from public.term_results where enrollment_id in (select id from public.enrollments where student_id = any (demo_students));
  delete from public.scores where enrollment_id in (select id from public.enrollments where student_id = any (demo_students));
  delete from public.attendance where enrollment_id in (select id from public.enrollments where student_id = any (demo_students));
  delete from public.bece_registrations where student_id = any (demo_students);
  delete from public.enrollments where student_id = any (demo_students);
  delete from public.student_guardians where student_id = any (demo_students);
  delete from public.students where id = any (demo_students);
  delete from public.guardians where email like '%@demo.invalid';

  update public.classes set class_teacher_id = null where class_teacher_id in (select id from public.staff where email like '%@demo.invalid');
  update public.class_subjects set teacher_id = null where teacher_id in (select id from public.staff where email like '%@demo.invalid');
  delete from public.staff where email like '%@demo.invalid';

  if not exists (select 1 from public.students) and not exists (select 1 from public.invoices) then
    update public.number_sequences set next_value = 1 where school_id = sch and kind in ('admission_no', 'invoice_no', 'receipt_no');
  end if;

  raise notice 'Demo data removed.';
end $$;
