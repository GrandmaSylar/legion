-- Step 5 of the move from roles to actions: Fees and Expenses.
--
-- Billing, payments, receipts, fee set-up, online payment review and expenses are decided by
-- actions instead of roles. Parents still read their own invoices and receipts through the
-- portal rules. Each money job gets its own action, so a school can, for example, let someone
-- record payments without letting them cancel a receipt.

-- ── A new action: marking an expense as paid ────────────────────────────────
-- The database has always had a separate rule for this (admin and accountant).
insert into public.access_capabilities (key, module, action, label, description, sensitive, sort)
values ('expenses.pay', 'expenses', 'pay', 'Mark expenses as paid', 'Record that an approved expense has been paid.', false, 175)
on conflict (key) do nothing;
insert into public.access_preset_capabilities (role, capability) values
  ('school_admin', 'expenses.pay'), ('accountant', 'expenses.pay') on conflict do nothing;
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, 'expenses.pay', ur.school_id from public.user_roles ur where ur.role in ('school_admin', 'accountant')
  on conflict (profile_id, capability) do nothing;

-- ── Invoices, items, instalments (billing) ──────────────────────────────────
drop policy invoices_finance on public.invoices;
drop policy invoice_items_finance on public.invoice_items;
drop policy installments_finance on public.installments;

create policy invoices_staff_read on public.invoices for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.view'));
create policy invoices_insert on public.invoices for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('fees.bill'));
create policy invoices_update on public.invoices for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.bill'))
  with check (school_id = public.current_school_id() and public.has_capability('fees.bill'));
create policy invoices_delete on public.invoices for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.bill'));

create policy invoice_items_staff_read on public.invoice_items for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.view'));
create policy invoice_items_insert on public.invoice_items for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('fees.bill'));
create policy invoice_items_update on public.invoice_items for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.bill'))
  with check (school_id = public.current_school_id() and public.has_capability('fees.bill'));
create policy invoice_items_delete on public.invoice_items for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.bill'));

create policy installments_staff_read on public.installments for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.view'));
create policy installments_insert on public.installments for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('fees.bill'));
create policy installments_update on public.installments for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.bill'))
  with check (school_id = public.current_school_id() and public.has_capability('fees.bill'));
create policy installments_delete on public.installments for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.bill'));

-- ── Fee set-up: categories, amounts per level, discounts ────────────────────
drop policy fee_categories_finance on public.fee_categories;
drop policy fee_structures_finance on public.fee_structures;
drop policy discounts_finance on public.discounts;
drop policy student_discounts_finance on public.student_discounts;

create policy fee_categories_read on public.fee_categories for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.view'));
create policy fee_categories_write on public.fee_categories for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.configure'))
  with check (school_id = public.current_school_id() and public.has_capability('fees.configure'));

create policy fee_structures_read on public.fee_structures for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.view'));
create policy fee_structures_write on public.fee_structures for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.configure'))
  with check (school_id = public.current_school_id() and public.has_capability('fees.configure'));

create policy discounts_read on public.discounts for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.view'));
create policy discounts_write on public.discounts for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.configure'))
  with check (school_id = public.current_school_id() and public.has_capability('fees.configure'));

create policy student_discounts_read on public.student_discounts for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.view'));
create policy student_discounts_write on public.student_discounts for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.configure'))
  with check (school_id = public.current_school_id() and public.has_capability('fees.configure'));

-- ── Payments and online payments ────────────────────────────────────────────
drop policy payments_finance_read on public.payments;
drop policy payments_finance_insert on public.payments;
create policy payments_finance_read on public.payments for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.view'));
create policy payments_finance_insert on public.payments for insert to authenticated
  with check (school_id = public.current_school_id() and voided_at is null and public.has_capability('fees.record_payment'));

-- Online payment attempts: the parent who started one, and whoever reviews online payments.
-- The principal could read these through the old rule but never had a screen for them; that
-- unused access is dropped (it can be given back from the Access screen).
drop policy online_payments_read on public.online_payments;
create policy online_payments_read on public.online_payments for select to authenticated
  using (school_id = public.current_school_id()
         and (initiated_by = auth.uid() or public.has_capability('fees.review_online')));

-- ── Expenses ────────────────────────────────────────────────────────────────
drop policy expense_categories_read on public.expense_categories;
drop policy expense_categories_write on public.expense_categories;
drop policy expenses_read on public.expenses;
drop policy expenses_insert on public.expenses;
drop policy expenses_update on public.expenses;
drop policy expenses_delete on public.expenses;

create policy expense_categories_read on public.expense_categories for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('expenses.view'));
create policy expense_categories_write on public.expense_categories for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('fees.configure'))
  with check (school_id = public.current_school_id() and public.has_capability('fees.configure'));

create policy expenses_read on public.expenses for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('expenses.view'));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('expenses.create'));
create policy expenses_update on public.expenses for update to authenticated
  using (school_id = public.current_school_id() and public.has_any_capability(array['expenses.create', 'expenses.approve', 'expenses.pay']))
  with check (school_id = public.current_school_id() and public.has_any_capability(array['expenses.create', 'expenses.approve', 'expenses.pay']));
create policy expenses_delete on public.expenses for delete to authenticated
  using (school_id = public.current_school_id() and status in ('pending', 'rejected') and public.has_capability('expenses.delete'));

-- ── Functions with their own checks ─────────────────────────────────────────
-- Each body is long and only the permission line changes, so rewrite that line in place.
do $$
declare
  fix record;
  def text;
  fn record;
begin
  for fix in
    select * from (values
      ('batch_generate_term_invoices', 'public.has_any_role(array[''school_admin'',''accountant'']::public.app_role[])', 'public.has_capability(''fees.bill'')'),
      ('void_payment', 'public.has_any_role(array[''school_admin'',''accountant'']::public.app_role[])', 'public.has_capability(''fees.cancel_receipt'')'),
      ('resolve_online_payment', 'public.has_any_role(array[''school_admin'',''accountant'']::public.app_role[])', 'public.has_capability(''fees.review_online'')'),
      ('review_expense', 'public.has_any_role(array[''school_admin'', ''principal'']::public.app_role[])', 'public.has_capability(''expenses.approve'')'),
      ('review_expense', 'public.has_any_role(array[''school_admin'', ''accountant'']::public.app_role[])', 'public.has_capability(''expenses.pay'')')
    ) as t(proname, old_check, new_check)
  loop
    for fn in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = fix.proname
    loop
      def := pg_get_functiondef(fn.oid);
      if position(fix.old_check in def) = 0 then
        raise exception 'Expected role check not found in %', fix.proname;
      end if;
      execute replace(def, fix.old_check, fix.new_check);
    end loop;
  end loop;
end $$;
