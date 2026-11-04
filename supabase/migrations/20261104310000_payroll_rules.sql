-- Payroll, part two: statutory deductions and employer costs, as rules the SCHOOL enters.
--
-- Nothing here knows any rate. There is no pension rate, no tax band and no threshold anywhere in this
-- file, in the app or in the seed: a school (with its accountant) enters each rule, with the date it starts.
-- A rule is "in force" for a pay run if it was in force on the last day of that month. To change a rate, add a
-- new version from a date; the old one ends the day before, and earlier months still use what was true then.
--
-- A rule takes a BASE amount of the person's pay (basic, gross, pensionable pay or taxable pay), optionally
-- capped, and works out an amount: a percent, a fixed sum, or progressive bands (each slice of the base at its
-- own rate). It is either a deduction from the person's pay (and may reduce taxable pay, for a contribution
-- allowed before tax) or an employer cost (shown, but not taken from the person). Rules run in order, so a
-- tax rule can come after the rules that reduce taxable pay.
--
-- A set of rules must be CONFIRMED before any pay run that uses it can be approved: someone records the name of
-- the accountant who checked them. Changing any rule, band or exemption clears the confirmation.
-- These calculations are the school's responsibility to validate; the app only does the arithmetic it is given.

-- ── Rules ───────────────────────────────────────────────────────────────────
create table public.payroll_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('deduction', 'employer')),
  method text not null check (method in ('percent', 'fixed', 'bands')),
  base text not null default 'basic' check (base in ('basic', 'gross', 'pensionable', 'taxable')),
  rate numeric(7, 4) check (rate is null or (rate >= 0 and rate <= 100)),
  fixed_amount numeric(12, 2) check (fixed_amount is null or fixed_amount >= 0),
  cap_base numeric(12, 2) check (cap_base is null or cap_base >= 0),
  reduces_taxable boolean not null default false,
  sequence int not null default 100 check (sequence between 1 and 999),
  applies_to text not null default 'all' check (applies_to in ('all', 'teaching', 'non_teaching')),
  effective_from date not null,
  effective_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check ((method = 'percent' and rate is not null) or (method = 'fixed' and fixed_amount is not null) or method = 'bands'),
  check (not (reduces_taxable and kind = 'employer'))
);
create index on public.payroll_rules (school_id, effective_from);

create table public.payroll_rule_bands (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.payroll_rules (id) on delete cascade,
  school_id uuid not null,
  from_amount numeric(12, 2) not null check (from_amount >= 0),
  to_amount numeric(12, 2),
  rate numeric(7, 4) not null check (rate >= 0 and rate <= 100),
  check (to_amount is null or to_amount > from_amount)
);
create index on public.payroll_rule_bands (rule_id, from_amount);

-- A person left out of a rule (for example someone who does not take part in a scheme).
create table public.staff_rule_exemptions (
  staff_id uuid not null references public.staff (id) on delete cascade,
  rule_id uuid not null references public.payroll_rules (id) on delete cascade,
  school_id uuid not null default public.current_school_id() references public.schools (id),
  primary key (staff_id, rule_id)
);

alter table public.payroll_settings
  add column rules_confirmed_by_name text check (rules_confirmed_by_name is null or length(rules_confirmed_by_name) <= 120),
  add column rules_confirmed_note text check (rules_confirmed_note is null or length(rules_confirmed_note) <= 300),
  add column rules_confirmed_at timestamptz,
  add column rules_confirmed_by uuid references public.profiles (id) on delete set null;

create trigger audit_row after insert or update or delete on public.payroll_rules for each row execute function public.audit_row();
create trigger audit_row after insert or update or delete on public.payroll_rule_bands for each row execute function public.audit_row();

alter table public.payroll_rules enable row level security;
alter table public.payroll_rule_bands enable row level security;
alter table public.staff_rule_exemptions enable row level security;
create policy payroll_rules_read on public.payroll_rules for select to authenticated using (school_id = public.current_school_id() and public._payroll_sees());
create policy payroll_rule_bands_read on public.payroll_rule_bands for select to authenticated using (school_id = public.current_school_id() and public._payroll_sees());
create policy staff_rule_exemptions_read on public.staff_rule_exemptions for select to authenticated
  using (school_id = public.current_school_id() and public._payroll_on() and public.has_any_capability(array['payroll.view_all', 'payroll.manage_pay', 'payroll.configure']));
revoke insert, update, delete on public.payroll_rules, public.payroll_rule_bands, public.staff_rule_exemptions from authenticated;

-- Any change to the rules clears the accountant's confirmation.
create function public._payroll_rules_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  v_school := case when tg_op = 'DELETE' then old.school_id else new.school_id end;
  update public.payroll_settings set rules_confirmed_at = null, rules_confirmed_by = null, rules_confirmed_by_name = null, rules_confirmed_note = null
   where school_id = v_school and rules_confirmed_at is not null;
  return null;
end $$;
create trigger rules_changed after insert or update or delete on public.payroll_rules for each row execute function public._payroll_rules_changed();
create trigger rules_changed after insert or update or delete on public.payroll_rule_bands for each row execute function public._payroll_rules_changed();
create trigger rules_changed after insert or update or delete on public.staff_rule_exemptions for each row execute function public._payroll_rules_changed();

-- ── Saving a rule ───────────────────────────────────────────────────────────
-- Checks the rule as a whole and replaces its bands. Bands must start at zero and follow on from each other,
-- with only the last open-ended.
create function public.save_payroll_rule(
  p_id uuid, p_name text, p_kind text, p_method text, p_base text, p_rate numeric, p_fixed numeric, p_cap numeric,
  p_reduces_taxable boolean, p_sequence int, p_applies_to text, p_from date, p_to date, p_active boolean, p_bands jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_school uuid := public.current_school_id(); v_id uuid; b jsonb; v_prev numeric := 0; v_n int; i int := 0; v_to numeric; v_from numeric;
begin
  if not public._payroll_on() or not public.has_capability('payroll.configure') then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 80 then raise exception 'Give the rule a name.' using errcode = 'PAY01'; end if;
  if p_kind not in ('deduction', 'employer') then raise exception 'Choose whether it is taken from the person or paid by the school.' using errcode = 'PAY01'; end if;
  if p_method not in ('percent', 'fixed', 'bands') then raise exception 'Choose how it is worked out.' using errcode = 'PAY01'; end if;
  if p_base not in ('basic', 'gross', 'pensionable', 'taxable') then raise exception 'Choose what it is worked out from.' using errcode = 'PAY01'; end if;
  if p_applies_to not in ('all', 'teaching', 'non_teaching') then raise exception 'Choose who it applies to.' using errcode = 'PAY01'; end if;
  if p_from is null then raise exception 'Say from which date the rule applies.' using errcode = 'PAY01'; end if;
  if p_to is not null and p_to < p_from then raise exception 'The rule cannot end before it starts.' using errcode = 'PAY01'; end if;
  if p_sequence is null or p_sequence not between 1 and 999 then raise exception 'Give the order as a number from 1 to 999.' using errcode = 'PAY01'; end if;
  if p_method = 'percent' and (p_rate is null or p_rate < 0 or p_rate > 100) then raise exception 'Give a rate between 0 and 100 percent.' using errcode = 'PAY01'; end if;
  if p_method = 'fixed' and (p_fixed is null or p_fixed < 0) then raise exception 'Give the amount as zero or more.' using errcode = 'PAY01'; end if;
  if p_reduces_taxable and p_kind = 'employer' then raise exception 'Only a deduction from the person can reduce their taxable pay.' using errcode = 'PAY01'; end if;
  if exists (select 1 from public.payroll_rules r where r.school_id = v_school and lower(r.name) = lower(btrim(p_name)) and r.id is distinct from p_id
              and r.effective_from <= coalesce(p_to, 'infinity'::date) and coalesce(r.effective_to, 'infinity'::date) >= p_from) then
    raise exception 'Another version of this rule already covers some of those dates.' using errcode = 'PAY01'; end if;
  -- A rule worked out from taxable pay must come after the rules that reduce taxable pay.
  if p_base = 'taxable' and exists (select 1 from public.payroll_rules r where r.school_id = v_school and r.reduces_taxable and r.active and r.id is distinct from p_id
                                      and r.sequence >= p_sequence and r.effective_from <= coalesce(p_to, 'infinity'::date) and coalesce(r.effective_to, 'infinity'::date) >= p_from) then
    raise exception 'Put this rule after the rules that reduce taxable pay (give it a higher order number).' using errcode = 'PAY01'; end if;
  if p_reduces_taxable and exists (select 1 from public.payroll_rules r where r.school_id = v_school and r.base = 'taxable' and r.active and r.id is distinct from p_id
                                     and r.sequence <= p_sequence and r.effective_from <= coalesce(p_to, 'infinity'::date) and coalesce(r.effective_to, 'infinity'::date) >= p_from) then
    raise exception 'A rule that reduces taxable pay must come before the rules worked out from taxable pay (give it a lower order number).' using errcode = 'PAY01'; end if;
  if p_method = 'bands' then
    v_n := coalesce(jsonb_array_length(p_bands), 0);
    if v_n not between 1 and 12 then raise exception 'Give between 1 and 12 bands.' using errcode = 'PAY01'; end if;
    for b in select * from jsonb_array_elements(p_bands) loop
      i := i + 1;
      v_from := (b ->> 'from')::numeric; v_to := nullif(b ->> 'to', '')::numeric;
      if v_from is null or (b ->> 'rate') is null or (b ->> 'rate')::numeric not between 0 and 100 then raise exception 'Each band needs a start and a rate between 0 and 100 percent.' using errcode = 'PAY01'; end if;
      if v_from <> v_prev then raise exception 'Bands must follow on from each other, the first starting at 0.' using errcode = 'PAY01'; end if;
      if v_to is null and i < v_n then raise exception 'Only the last band can be open-ended.' using errcode = 'PAY01'; end if;
      if v_to is not null and v_to <= v_from then raise exception 'A band must end above where it starts.' using errcode = 'PAY01'; end if;
      v_prev := coalesce(v_to, v_from);
    end loop;
  end if;
  if p_id is null then
    insert into public.payroll_rules (name, kind, method, base, rate, fixed_amount, cap_base, reduces_taxable, sequence, applies_to, effective_from, effective_to, active)
    values (btrim(p_name), p_kind, p_method, p_base, case when p_method = 'percent' then p_rate end, case when p_method = 'fixed' then round(p_fixed, 2) end, p_cap,
            p_reduces_taxable, p_sequence, p_applies_to, p_from, p_to, coalesce(p_active, true)) returning id into v_id;
  else
    update public.payroll_rules set name = btrim(p_name), kind = p_kind, method = p_method, base = p_base, rate = case when p_method = 'percent' then p_rate end,
      fixed_amount = case when p_method = 'fixed' then round(p_fixed, 2) end, cap_base = p_cap, reduces_taxable = p_reduces_taxable, sequence = p_sequence,
      applies_to = p_applies_to, effective_from = p_from, effective_to = p_to, active = coalesce(p_active, true)
     where id = p_id and school_id = v_school returning id into v_id;
    if v_id is null then raise exception 'There is no such rule.' using errcode = 'PAY01'; end if;
    delete from public.payroll_rule_bands where rule_id = v_id;
  end if;
  if p_method = 'bands' then
    insert into public.payroll_rule_bands (rule_id, school_id, from_amount, to_amount, rate)
      select v_id, v_school, (e ->> 'from')::numeric, nullif(e ->> 'to', '')::numeric, (e ->> 'rate')::numeric from jsonb_array_elements(p_bands) e;
  end if;
  return v_id;
end $$;

create function public.delete_payroll_rule(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._payroll_on() or not public.has_capability('payroll.configure') then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.payroll_rules where id = p_id and school_id = public.current_school_id();
end $$;

-- A rate (or the bands) changing from a date: a new version starts then, and the old one ends the day before.
create function public.new_payroll_rule_version(p_id uuid, p_from date, p_rate numeric, p_fixed numeric, p_bands jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.payroll_rules; v_new uuid;
begin
  if not public._payroll_on() or not public.has_capability('payroll.configure') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.payroll_rules where id = p_id and school_id = public.current_school_id();
  if not found then raise exception 'There is no such rule.' using errcode = 'PAY01'; end if;
  if p_from is null or p_from <= r.effective_from then raise exception 'The new version must start after the one it replaces.' using errcode = 'PAY01'; end if;
  if r.effective_to is not null and p_from > r.effective_to then raise exception 'That rule has already ended before that date.' using errcode = 'PAY01'; end if;
  update public.payroll_rules set effective_to = p_from - 1 where id = p_id;
  v_new := public.save_payroll_rule(null, r.name, r.kind, r.method, r.base,
    case when r.method = 'percent' then coalesce(p_rate, r.rate) end, case when r.method = 'fixed' then coalesce(p_fixed, r.fixed_amount) end, r.cap_base,
    r.reduces_taxable, r.sequence, r.applies_to, p_from, r.effective_to, r.active,
    case when r.method = 'bands' then coalesce(p_bands, (select jsonb_agg(jsonb_build_object('from', b.from_amount, 'to', b.to_amount, 'rate', b.rate) order by b.from_amount)
                                                         from public.payroll_rule_bands b where b.rule_id = p_id)) end);
  return v_new;
end $$;

create function public.set_rule_exemption(p_staff uuid, p_rule uuid, p_exempt boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._payroll_on() or not public.has_capability('payroll.manage_pay') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.staff where id = p_staff and school_id = public.current_school_id()) or
     not exists (select 1 from public.payroll_rules where id = p_rule and school_id = public.current_school_id()) then
    raise exception 'Choose a member of staff and a rule.' using errcode = 'PAY01'; end if;
  if p_exempt then
    insert into public.staff_rule_exemptions (staff_id, rule_id) values (p_staff, p_rule) on conflict do nothing;
  else
    delete from public.staff_rule_exemptions where staff_id = p_staff and rule_id = p_rule;
  end if;
end $$;

-- Someone records that an accountant has checked the rules as they now stand.
create function public.confirm_payroll_rules(p_name text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._payroll_on() or not public.has_capability('payroll.configure') then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 3 and 120 then raise exception 'Give the name of the accountant who checked the rules.' using errcode = 'PAY01'; end if;
  perform public._payroll_settings();
  update public.payroll_settings set rules_confirmed_by_name = btrim(p_name), rules_confirmed_note = nullif(btrim(p_note), ''), rules_confirmed_at = now(), rules_confirmed_by = auth.uid()
   where school_id = public.current_school_id();
end $$;

-- Are there rules in force for this run's month that nobody has confirmed?
create function public._payroll_rules_pending(p_run uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.payroll_runs r join public.payroll_rules ru on ru.school_id = r.school_id and ru.active
     where r.id = p_run and ru.effective_from <= (make_date(r.year, r.month, 1) + interval '1 month - 1 day')::date
       and (ru.effective_to is null or ru.effective_to >= (make_date(r.year, r.month, 1) + interval '1 month - 1 day')::date))
    and not exists (select 1 from public.payroll_runs r join public.payroll_settings s on s.school_id = r.school_id where r.id = p_run and s.rules_confirmed_at is not null) $$;

-- What the screens need to know about the settings and the confirmation.
create or replace function public.payroll_config() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.payroll_settings;
begin
  if not public._payroll_on() or not public.has_any_capability(array['payroll.view_all', 'payroll.manage_pay', 'payroll.configure', 'payroll.prepare', 'payroll.approve', 'payroll.pay', 'payroll.view_own']) then
    raise exception 'not allowed' using errcode = '42501'; end if;
  s := public._payroll_settings();
  return jsonb_build_object('requireSeparateApprover', s.require_separate_approver, 'currency', s.currency,
    'rulesConfirmedBy', s.rules_confirmed_by_name, 'rulesConfirmedNote', s.rules_confirmed_note, 'rulesConfirmedAt', s.rules_confirmed_at,
    'activeRules', (select count(*) from public.payroll_rules where school_id = s.school_id and active));
end $$;

-- ── Calculating with the rules ──────────────────────────────────────────────
create or replace function public.calculate_payroll_run(p_run uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.payroll_runs; v_start date; v_end date; st record; comp record; adj record; rl record;
  v_basic numeric; v_earn numeric; v_ded numeric; v_slip uuid; v_amt numeric; v_n int := 0; v_skipped int := 0; v_sort int;
  v_taxearn numeric; v_pens numeric; v_relief numeric; v_emp numeric; v_base numeric;
begin
  select * into r from public.payroll_runs where id = p_run and school_id = public.current_school_id();
  if not found or not public._payroll_on() or not public.has_capability('payroll.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status not in ('draft', 'calculated') then raise exception 'This pay run can no longer be recalculated.' using errcode = 'PAY01'; end if;
  v_start := make_date(r.year, r.month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;
  delete from public.payroll_slips where run_id = p_run;
  for st in select s.id, s.full_name, s.staff_no, s.role_title, s.type from public.staff s
             where s.school_id = r.school_id and s.status = 'active' and s.deleted_at is null order by s.full_name loop
    select p.basic into v_basic from public.staff_pay p where p.staff_id = st.id and p.effective_from <= v_end order by p.effective_from desc limit 1;
    if v_basic is null then v_skipped := v_skipped + 1; continue; end if;
    insert into public.payroll_slips (run_id, school_id, staff_id, staff_name, staff_no, job, basic, gross, deductions, net)
      values (p_run, r.school_id, st.id, st.full_name, st.staff_no, st.role_title, v_basic, 0, 0, 0) returning id into v_slip;
    insert into public.payroll_slip_lines (slip_id, kind, name, amount, sort) values (v_slip, 'earning', 'Basic salary', v_basic, 0);
    v_earn := v_basic; v_ded := 0; v_sort := 10; v_taxearn := v_basic; v_pens := v_basic; v_relief := 0; v_emp := 0;
    for comp in select pc.name, pc.kind, pc.calc, pc.taxable, pc.pensionable, sc.amount from public.staff_components sc join public.pay_components pc on pc.id = sc.component_id
                 where sc.staff_id = st.id and pc.active and sc.effective_from <= v_end and (sc.effective_to is null or sc.effective_to >= v_start)
                 order by pc.kind, pc.name loop
      v_amt := round(case comp.calc when 'fixed' then comp.amount else v_basic * comp.amount / 100 end, 2);
      insert into public.payroll_slip_lines (slip_id, kind, name, amount, sort) values (v_slip, comp.kind, comp.name, v_amt, v_sort);
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
  perform public._payroll_run_log(p_run, r.school_id, 'calculated the pay run', v_n || ' payslips, ' || v_skipped || ' staff without pay details');
  return jsonb_build_object('slips', v_n, 'skipped', v_skipped);
end $$;

-- ── Approval needs the rules confirmed ──────────────────────────────────────
create or replace function public.approve_payroll_run(p_run uuid, p_comment text) returns text
language plpgsql security definer set search_path = public as $$
declare r public.payroll_runs; s public.payroll_settings; v_step uuid; v_ok boolean; v_total int; v_signed int; v_next uuid; v_who uuid[];
begin
  select * into r from public.payroll_runs where id = p_run and school_id = public.current_school_id();
  if not found or not public._payroll_on() or not public.has_capability('payroll.approve') then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status <> 'in_approval' then raise exception 'This pay run is not waiting for approval.' using errcode = 'PAY01'; end if;
  if public._payroll_rules_pending(p_run) then
    raise exception 'The statutory rules have not been confirmed by an accountant. Confirm them under Set up before approving.' using errcode = 'PAY01'; end if;
  s := public._payroll_settings();
  if s.require_separate_approver and r.calculated_by = auth.uid() then
    raise exception 'The person who calculated a pay run cannot approve it. Someone else must.' using errcode = 'PAY01'; end if;
  v_step := public._payroll_next_step(p_run);
  if v_step is not null then
    select auth.uid() = any (approvers) into v_ok from public.payroll_approval_steps where id = v_step;
    if not coalesce(v_ok, false) and not public.is_developer() then raise exception 'It is not your turn to approve this pay run.' using errcode = 'PAY01'; end if;
  end if;
  if exists (select 1 from public.payroll_run_approvals where run_id = p_run and approved_by = auth.uid()) then
    raise exception 'You have already signed this pay run.' using errcode = 'PAY01'; end if;
  insert into public.payroll_run_approvals (run_id, school_id, step_id, comment) values (p_run, r.school_id, v_step, nullif(btrim(p_comment), ''));
  perform public._payroll_run_log(p_run, r.school_id, 'approved the pay run', coalesce((select label from public.payroll_approval_steps where id = v_step), 'approval'));
  select count(*) into v_total from public.payroll_approval_steps where school_id = r.school_id;
  select count(*) into v_signed from public.payroll_run_approvals where run_id = p_run;
  if v_signed >= greatest(v_total, 1) then
    update public.payroll_runs set status = 'approved', approved_at = now() where id = p_run;
    return 'approved';
  end if;
  v_next := public._payroll_next_step(p_run);
  select approvers into v_who from public.payroll_approval_steps where id = v_next;
  begin
    perform public.notify_profiles(r.school_id, 'payroll_approval_needed', v_who, 'A pay run is waiting for your approval', to_char(make_date(r.year, r.month, 1), 'FMMonth YYYY'), '/payroll');
  exception when others then raise warning 'payroll notification failed: %', sqlerrm; end;
  return 'in_approval';
end $$;

-- ── Lock the functions down ─────────────────────────────────────────────────
revoke execute on function public._payroll_rules_changed() from public, anon, authenticated;
revoke execute on function public._payroll_rules_pending(uuid) from public, anon, authenticated;
revoke execute on function public.save_payroll_rule(uuid, text, text, text, text, numeric, numeric, numeric, boolean, int, text, date, date, boolean, jsonb) from public, anon;
revoke execute on function public.delete_payroll_rule(uuid) from public, anon;
revoke execute on function public.new_payroll_rule_version(uuid, date, numeric, numeric, jsonb) from public, anon;
revoke execute on function public.set_rule_exemption(uuid, uuid, boolean) from public, anon;
revoke execute on function public.confirm_payroll_rules(text, text) from public, anon;
grant execute on function public.save_payroll_rule(uuid, text, text, text, text, numeric, numeric, numeric, boolean, int, text, date, date, boolean, jsonb) to authenticated;
grant execute on function public.delete_payroll_rule(uuid) to authenticated;
grant execute on function public.new_payroll_rule_version(uuid, date, numeric, numeric, jsonb) to authenticated;
grant execute on function public.set_rule_exemption(uuid, uuid, boolean) to authenticated;
grant execute on function public.confirm_payroll_rules(text, text) to authenticated;
