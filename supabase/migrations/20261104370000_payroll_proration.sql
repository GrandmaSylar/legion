-- Payroll: pay for part of a month.
--
-- Until now a pay run paid every active person a whole month at the pay in force on its last day. So someone who
-- started on the 20th was paid a full month, someone who left on the 5th was not paid at all, and a raise from the
-- 15th was paid for the whole month. A school can now choose how part-months are paid (the choice is the school's,
-- and starts as "pay the whole month", which is exactly the old behaviour):
--   * none:          as before.
--   * calendar days: pay is shared by days of the month, counting every day.
--   * working days:  pay is shared by Monday-to-Friday days (holidays are not taken out).
-- With either of the last two:
--   * A person is paid only for the days they were employed: from their start date (or the day their pay starts) to the
--     day they left, so someone who left mid-month is paid up to that day.
--   * A raise (or any change of pay) part-way through the month pays each rate for the days it was in force.
--   * A fixed allowance or deduction is paid for the days it was in force and the person was employed; a percent-of-basic
--     one follows the part-month basic pay. One-off adjustments and fixed statutory rules are exactly as entered.
--   * The payslip says how many days were paid.
-- The start and leaving dates are kept by payroll staff on the person's pay screen.

alter table public.staff add column left_on date;
alter table public.staff add check (left_on is null or hired_on is null or left_on >= hired_on);

alter table public.payroll_settings add column prorate_method text not null default 'none' check (prorate_method in ('none', 'calendar_days', 'working_days'));

-- How many days of a stretch count under a method.
create function public._pay_days(p_method text, p_from date, p_to date) returns int
language sql immutable as $$
  select case when p_to < p_from then 0
              when p_method = 'working_days' then (select count(*)::int from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d where extract(isodow from d) <= 5)
              else (p_to - p_from + 1) end $$;

create function public.save_payroll_proration(p_method text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._payroll_on() or not public.has_capability('payroll.configure') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_method not in ('none', 'calendar_days', 'working_days') then raise exception 'Choose how part-months are paid.' using errcode = 'PAY01'; end if;
  perform public._payroll_settings();
  update public.payroll_settings set prorate_method = p_method, updated_by = auth.uid(), updated_at = now() where school_id = public.current_school_id();
end $$;

create or replace function public.payroll_config() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.payroll_settings;
begin
  if not public._payroll_on() or not public.has_any_capability(array['payroll.view_all', 'payroll.manage_pay', 'payroll.configure', 'payroll.prepare', 'payroll.approve', 'payroll.pay', 'payroll.view_own']) then
    raise exception 'not allowed' using errcode = '42501'; end if;
  s := public._payroll_settings();
  return jsonb_build_object('requireSeparateApprover', s.require_separate_approver, 'currency', s.currency, 'prorateMethod', s.prorate_method,
    'rulesConfirmedBy', s.rules_confirmed_by_name, 'rulesConfirmedNote', s.rules_confirmed_note, 'rulesConfirmedAt', s.rules_confirmed_at,
    'activeRules', (select count(*) from public.payroll_rules where school_id = s.school_id and active));
end $$;

-- When a person started and, if they have, when they left.
create function public.set_staff_pay_dates(p_staff uuid, p_hired date, p_left date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._payroll_on() or not public.has_capability('payroll.manage_pay') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_hired is not null and p_left is not null and p_left < p_hired then raise exception 'The last day cannot be before the first.' using errcode = 'PAY01'; end if;
  update public.staff set hired_on = p_hired, left_on = p_left where id = p_staff and school_id = public.current_school_id() and deleted_at is null;
  if not found then raise exception 'Choose a member of staff.' using errcode = 'PAY01'; end if;
end $$;

-- The people list now carries the dates, and includes someone who left in the last year (so their last pay can be run).
drop function public.payroll_staff_list();
create function public.payroll_staff_list()
returns table (staff_id uuid, full_name text, staff_no text, job text, status text, basic numeric, effective_from date, has_account boolean, hired_on date, left_on date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._payroll_on() or not public.has_any_capability(array['payroll.view_all', 'payroll.manage_pay']) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select s.id, s.full_name, s.staff_no, s.role_title, s.status::text,
         sp.basic, sp.effective_from,
         exists (select 1 from public.staff_pay_accounts a where a.staff_id = s.id and a.account_no is not null), s.hired_on, s.left_on
    from public.staff s
    left join lateral (select p.basic, p.effective_from from public.staff_pay p where p.staff_id = s.id and p.effective_from <= current_date order by p.effective_from desc limit 1) sp on true
   where s.school_id = public.current_school_id() and s.deleted_at is null
     and (s.status <> 'left' or (s.left_on is not null and s.left_on >= current_date - 365))
   order by s.full_name;
end $$;

-- ── The calculation, now able to pay part of a month ────────────────────────
create or replace function public.calculate_payroll_run(p_run uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.payroll_runs; v_start date; v_end date; st record; comp record; adj record; rl record; seg record;
  v_basic numeric; v_earn numeric; v_ded numeric; v_slip uuid; v_amt numeric; v_n int := 0; v_skipped int := 0; v_sort int;
  v_taxearn numeric; v_pens numeric; v_relief numeric; v_emp numeric; v_base numeric;
  v_method text; v_den int; v_emp_from date; v_emp_to date; v_used int; d int; v_label text; v_note text;
begin
  select * into r from public.payroll_runs where id = p_run and school_id = public.current_school_id();
  if not found or not public._payroll_on() or not public.has_capability('payroll.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status not in ('draft', 'calculated') then raise exception 'This pay run can no longer be recalculated.' using errcode = 'PAY01'; end if;
  v_start := make_date(r.year, r.month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;
  v_method := (public._payroll_settings()).prorate_method;
  v_den := public._pay_days(v_method, v_start, v_end);
  delete from public.payroll_slips where run_id = p_run;
  for st in select s.id, s.full_name, s.staff_no, s.role_title, s.type, s.hired_on, s.left_on from public.staff s
             where s.school_id = r.school_id and s.deleted_at is null
               and (s.status = 'active' or (v_method <> 'none' and s.status = 'left' and s.left_on is not null and s.left_on >= v_start))
             order by s.full_name loop
    v_label := 'Basic salary';
    if v_method = 'none' then
      select p.basic into v_basic from public.staff_pay p where p.staff_id = st.id and p.effective_from <= v_end order by p.effective_from desc limit 1;
      if v_basic is null then v_skipped := v_skipped + 1; continue; end if;
    else
      -- Paid for the days employed, each rate for the days it was in force.
      v_emp_from := greatest(coalesce(st.hired_on, v_start), v_start);
      v_emp_to := least(coalesce(st.left_on, v_end), v_end);
      v_basic := 0; v_used := 0;
      for seg in select p.basic, p.effective_from as eff, lead(p.effective_from) over (order by p.effective_from) as nxt
                   from public.staff_pay p where p.staff_id = st.id and p.effective_from <= v_end order by p.effective_from loop
        d := public._pay_days(v_method, greatest(seg.eff, v_emp_from), least(coalesce(seg.nxt - 1, v_end), v_emp_to));
        if d > 0 then v_basic := v_basic + seg.basic * d / v_den; v_used := v_used + d; end if;
      end loop;
      if v_used = 0 then v_skipped := v_skipped + 1; continue; end if;
      v_basic := round(v_basic, 2);
      if v_used < v_den then v_label := 'Basic salary (' || v_used || ' of ' || v_den || ' days)'; end if;
    end if;
    insert into public.payroll_slips (run_id, school_id, staff_id, staff_name, staff_no, job, basic, gross, deductions, net)
      values (p_run, r.school_id, st.id, st.full_name, st.staff_no, st.role_title, v_basic, 0, 0, 0) returning id into v_slip;
    insert into public.payroll_slip_lines (slip_id, kind, name, amount, sort) values (v_slip, 'earning', v_label, v_basic, 0);
    v_earn := v_basic; v_ded := 0; v_sort := 10; v_taxearn := v_basic; v_pens := v_basic; v_relief := 0; v_emp := 0;
    for comp in select pc.name, pc.kind, pc.calc, pc.taxable, pc.pensionable, sc.amount, sc.effective_from as eff_from, sc.effective_to as eff_to
                  from public.staff_components sc join public.pay_components pc on pc.id = sc.component_id
                 where sc.staff_id = st.id and pc.active and sc.effective_from <= v_end and (sc.effective_to is null or sc.effective_to >= v_start)
                 order by pc.kind, pc.name loop
      v_note := '';
      if comp.calc = 'fixed' then
        if v_method = 'none' then
          v_amt := round(comp.amount, 2);
        else
          d := public._pay_days(v_method, greatest(comp.eff_from, v_emp_from), least(coalesce(comp.eff_to, v_end), v_emp_to));
          if d = 0 then continue; end if;
          v_amt := round(comp.amount * d / v_den, 2);
          if d < v_den then v_note := ' (' || d || ' of ' || v_den || ' days)'; end if;
        end if;
      else
        v_amt := round(v_basic * comp.amount / 100, 2);
      end if;
      insert into public.payroll_slip_lines (slip_id, kind, name, amount, sort) values (v_slip, comp.kind, comp.name || v_note, v_amt, v_sort);
      if comp.kind = 'earning' then
        v_earn := v_earn + v_amt;
        if comp.taxable then v_taxearn := v_taxearn + v_amt; end if;
        if comp.pensionable then v_pens := v_pens + v_amt; end if;
      else v_ded := v_ded + v_amt; end if;
      v_sort := v_sort + 1;
    end loop;
    -- One-off adjustments count as taxable pay, and are not pensionable.
    for adj in select a.name, a.kind, a.amount from public.payroll_adjustments a where a.run_id = p_run and a.staff_id = st.id order by a.kind, a.name loop
      insert into public.payroll_slip_lines (slip_id, kind, name, amount, sort) values (v_slip, adj.kind, adj.name || ' (this month only)', adj.amount, v_sort);
      if adj.kind = 'earning' then v_earn := v_earn + adj.amount; v_taxearn := v_taxearn + adj.amount; else v_ded := v_ded + adj.amount; end if;
      v_sort := v_sort + 1;
    end loop;
    -- The school's own rules, in order.
    for rl in select ru.* from public.payroll_rules ru
               where ru.school_id = r.school_id and ru.active and ru.effective_from <= v_end and (ru.effective_to is null or ru.effective_to >= v_end)
                 and (ru.applies_to = 'all' or ru.applies_to = st.type::text)
                 and not exists (select 1 from public.staff_rule_exemptions x where x.staff_id = st.id and x.rule_id = ru.id)
               order by ru.sequence, ru.name loop
      v_base := case rl.base when 'basic' then v_basic when 'gross' then v_earn when 'pensionable' then v_pens else greatest(0, v_taxearn - v_relief) end;
      if rl.cap_base is not null then v_base := least(v_base, rl.cap_base); end if;
      if rl.method = 'percent' then v_amt := round(v_base * rl.rate / 100, 2);
      elsif rl.method = 'fixed' then v_amt := rl.fixed_amount;
      else
        select round(coalesce(sum(greatest(0, least(v_base, coalesce(b.to_amount, v_base)) - b.from_amount) * b.rate / 100), 0), 2) into v_amt
          from public.payroll_rule_bands b where b.rule_id = rl.id;
      end if;
      if v_amt > 0 or rl.method = 'fixed' then
        insert into public.payroll_slip_lines (slip_id, kind, name, amount, sort) values (v_slip, case rl.kind when 'employer' then 'employer' else 'deduction' end, rl.name, v_amt, v_sort);
        v_sort := v_sort + 1;
        if rl.kind = 'deduction' then v_ded := v_ded + v_amt; if rl.reduces_taxable then v_relief := v_relief + v_amt; end if;
        else v_emp := v_emp + v_amt; end if;
      end if;
    end loop;
    if v_earn - v_ded < 0 then
      raise exception '%''s deductions are more than their pay. Change the deductions or the adjustments and calculate again.', st.full_name using errcode = 'PAY01';
    end if;
    update public.payroll_slips set gross = v_earn, deductions = v_ded, net = v_earn - v_ded, employer_cost = v_emp where id = v_slip;
    v_n := v_n + 1;
  end loop;
  update public.payroll_runs set status = 'calculated', calculated_by = auth.uid(), calculated_at = now() where id = p_run;
  perform public._payroll_run_log(p_run, r.school_id, 'calculated the pay run', v_n || ' payslips, ' || v_skipped || ' staff without pay details or not employed that month'
    || case v_method when 'none' then '' when 'calendar_days' then ', part-months paid by calendar days' else ', part-months paid by working days' end);
  return jsonb_build_object('slips', v_n, 'skipped', v_skipped);
end $$;

revoke execute on function public._pay_days(text, date, date) from public, anon, authenticated;
revoke execute on function public.save_payroll_proration(text) from public, anon;
revoke execute on function public.set_staff_pay_dates(uuid, date, date) from public, anon;
revoke execute on function public.payroll_staff_list() from public, anon;
grant execute on function public.save_payroll_proration(text) to authenticated;
grant execute on function public.set_staff_pay_dates(uuid, date, date) to authenticated;
grant execute on function public.payroll_staff_list() to authenticated;
