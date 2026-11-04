-- A fee notice for students: a yes or no, never an amount.
--
-- A student cannot read any fee records (invoices, payments, instalments), and that does not change.
-- What a student may learn is a single fact about themselves: whether a balance is owed. It comes from
-- this one function, which returns only true or false, so there is nothing else to leak. A school can
-- switch the notice off in Features. It needs fees to be on.

insert into public.app_features (key, label, description, kind, requires, sort) values
  ('student_fee_notice', 'Fee notice for students',
   'Show students a short notice when fees are owed. They never see amounts or any fee records.', 'channel', '{fees}', 45);

-- Does the signed-in student owe anything? False for anyone who is not a student, and false when the
-- notice or fees are switched off. A balance is what the invoice adds up to less the payments that
-- have not been cancelled, on invoices that are neither cancelled nor removed.
create function public.my_fee_notice() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_student uuid;
begin
  if auth.uid() is null or not public.has_role('student') then return false; end if;
  if not public.feature_enabled('student_fee_notice') then return false; end if;

  select s.id into v_student from public.students s
   where s.profile_id = auth.uid() and s.school_id = public.current_school_id() and s.deleted_at is null
   limit 1;
  if v_student is null then return false; end if;

  return exists (
    select 1 from public.invoices i
    where i.student_id = v_student and i.status <> 'void' and i.deleted_at is null
      and coalesce((select sum(it.amount) from public.invoice_items it where it.invoice_id = i.id), 0)
        - coalesce((select sum(py.amount) from public.payments py where py.invoice_id = i.id and py.voided_at is null), 0) > 0
  );
end $$;
revoke execute on function public.my_fee_notice() from public, anon;
grant execute on function public.my_fee_notice() to authenticated;
