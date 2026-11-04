-- The bank payment list for a pay run: who to pay, where, and how much. For those who may download payroll records.
create function public.payroll_bank_list(p_run uuid)
returns table (staff_name text, bank_name text, account_name text, account_no text, net numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._payroll_on() or not public.has_capability('payroll.download') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select sl.staff_name, a.bank_name, a.account_name, a.account_no, sl.net
    from public.payroll_slips sl join public.payroll_runs r on r.id = sl.run_id
    left join public.staff_pay_accounts a on a.staff_id = sl.staff_id
   where sl.run_id = p_run and r.school_id = public.current_school_id() order by sl.staff_name;
end $$;
revoke execute on function public.payroll_bank_list(uuid) from public, anon;
grant execute on function public.payroll_bank_list(uuid) to authenticated;
