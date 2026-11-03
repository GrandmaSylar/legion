-- Clears every activity record and keeps the people and the setup.
--
-- CLEARED:  invoices, invoice items, instalment plans, payments, online payment attempts,
--           attendance, assessments and scores, term results and remarks, report
--           publications, SMS messages and batches, notices, expenses, student discounts.
--           Invoice and receipt numbering restarts at 1.
-- KEPT:     students, parents (guardians) and their links, class enrolments, staff, classes,
--           subjects, fee categories and structures, SMS templates and settings, school
--           settings, all logins, and the audit log (the system's own record of who did what).
--
-- One transaction: either everything below happens, or nothing does.
-- Run: supabase db query --linked -f supabase/demo/clear_transactions.sql

do $$
declare
  t text;
  n bigint;
  report text := '';
begin
  -- Children before parents, so no foreign key is ever violated.
  foreach t in array array[
    'online_payments', 'payments', 'installments', 'invoice_items', 'student_discounts', 'invoices',
    'scores', 'assessments', 'term_results', 'term_remarks', 'term_report_publications',
    'student_behavioral_assessments', 'attendance',
    'messages', 'message_batches', 'announcements', 'expenses'
  ] loop
    execute format('select count(*) from public.%I', t) into n;
    execute format('delete from public.%I', t);
    if n > 0 then report := report || format('%s=%s ', t, n); end if;
  end loop;

  -- Fresh numbering for invoices and receipts. Admission and staff numbers are untouched,
  -- because the students and staff they belong to are still here.
  update public.number_sequences set next_value = 1 where kind in ('invoice_no', 'receipt_no');

  raise notice 'Cleared: %', report;
end $$;
