-- Payroll, part one: pay details, pay runs, approval steps and payslips.
--
-- What a person is paid is private. A member of staff sees their own payslips (only once a run is marked
-- paid); the head, principal, HR and the accountant see more, each by their own action. A pay run is made
-- for a month, calculated into one payslip per paid member of staff (basic pay plus the school's own
-- allowances, minus the school's own deductions, plus or minus one-off adjustments), then goes through the
-- approval steps THE SCHOOL defines (who signs, in what order), and is only then marked paid. The person
-- who calculated a run cannot sign it off (a setting, on by default). Once a run is approved its payslips
-- cannot change.
--
-- Nothing statutory is built in here: no pension or tax rates. A school adds its own deductions as
-- components for now; the rules for statutory deductions, with dated editable rates, come next and must be
-- checked by a Ghanaian accountant before a school relies on them. Amounts are in the school's currency.

-- ── Feature and actions ─────────────────────────────────────────────────────
insert into public.app_features (key, label, description, kind, requires, sort) values
  ('payroll', 'Payroll', 'Pay details, monthly pay runs with the school''s own approval steps, and payslips staff can read on their phones.', 'module', '{}', 100);

insert into public.access_capabilities (key, module, action, label, description, sensitive, sort) values
  ('payroll.view_own', 'payroll', 'view_own', 'See their own payslips', 'Read their own payslips once a pay run is marked paid.', false, 1400),
  ('payroll.view_all', 'payroll', 'view_all', 'See pay runs and everyone''s pay', 'See every pay run, payslip and member of staff''s pay details.', true, 1410),
  ('payroll.manage_pay', 'payroll', 'manage_pay', 'Set staff pay details', 'Set each member of staff''s basic pay, allowances, deductions and bank details.', true, 1420),
  ('payroll.configure', 'payroll', 'configure', 'Set up payroll', 'Choose the allowance and deduction types, the approval steps and the payroll settings.', true, 1430),
  ('payroll.prepare', 'payroll', 'prepare', 'Prepare pay runs', 'Create a pay run, add one-off adjustments, calculate it and send it for approval.', true, 1440),
  ('payroll.approve', 'payroll', 'approve', 'Approve pay runs', 'Sign off a pay run at the step the school has given them.', true, 1450),
  ('payroll.pay', 'payroll', 'pay', 'Mark a pay run as paid', 'Record that an approved pay run has been paid, which releases payslips to staff.', true, 1460),
  ('payroll.download', 'payroll', 'download', 'Download payroll records', 'Download the payroll register and the bank payment list.', true, 1470)
on conflict (key) do nothing;

insert into public.access_preset_capabilities (role, capability)
  select r, 'payroll.view_own' from unnest(enum_range(null::public.app_role)) as r
  where r in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
  on conflict do nothing;
insert into public.access_preset_capabilities (role, capability) values
  ('school_admin', 'payroll.view_all'), ('principal', 'payroll.view_all'), ('hr_officer', 'payroll.view_all'), ('accountant', 'payroll.view_all'),
  ('school_admin', 'payroll.manage_pay'), ('hr_officer', 'payroll.manage_pay'),
  ('school_admin', 'payroll.configure'), ('principal', 'payroll.configure'),
  ('school_admin', 'payroll.prepare'), ('hr_officer', 'payroll.prepare'), ('accountant', 'payroll.prepare'),
  ('school_admin', 'payroll.approve'), ('principal', 'payroll.approve'),
  ('school_admin', 'payroll.pay'), ('accountant', 'payroll.pay'),
  ('school_admin', 'payroll.download'), ('principal', 'payroll.download'), ('hr_officer', 'payroll.download'), ('accountant', 'payroll.download')
  on conflict do nothing;
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, p.capability, ur.school_id
  from public.user_roles ur
  join public.access_preset_capabilities p on p.role::text = ur.role::text and p.capability like 'payroll.%'
  on conflict (profile_id, capability) do nothing;

insert into public.notification_events (key, label, description, feature, sort) values
  ('payroll_approval_needed', 'A pay run is waiting for your approval', 'Tell the people who sign a pay run off at a step when it reaches them.', 'payroll', 80),
  ('payroll_payslip_ready', 'Your payslip is ready', 'Tell a member of staff when their pay run is marked paid and their payslip can be read.', 'payroll', 81);

-- ── Settings and approval steps ─────────────────────────────────────────────
create table public.payroll_settings (
  school_id uuid primary key default public.current_school_id() references public.schools (id),
  require_separate_approver boolean not null default true,
  currency text not null default 'GHS' check (length(btrim(currency)) between 1 and 8),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Who signs a pay run off, in order. Each step lists the people who may sign it; one signature completes it.
create table public.payroll_approval_steps (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  position int not null check (position between 1 and 6),
  label text not null check (length(btrim(label)) between 1 and 60),
  approvers uuid[] not null check (cardinality(approvers) between 1 and 10),
  unique (school_id, position)
);

-- ── Pay details ─────────────────────────────────────────────────────────────
-- Basic monthly pay with the date it starts, so a raise is a new row and old pay runs keep what was true then.
create table public.staff_pay (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  staff_id uuid not null references public.staff (id) on delete cascade,
  effective_from date not null,
  basic numeric(12, 2) not null check (basic >= 0 and basic < 100000000),
  note text check (note is null or length(note) <= 200),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (staff_id, effective_from)
);
create index on public.staff_pay (staff_id, effective_from desc);

-- Where the money goes. No audit trigger: the audit log copies whole rows, and an account number should not be copied.
create table public.staff_pay_accounts (
  staff_id uuid primary key references public.staff (id) on delete cascade,
  school_id uuid not null default public.current_school_id() references public.schools (id),
  bank_name text check (bank_name is null or length(bank_name) <= 80),
  account_name text check (account_name is null or length(account_name) <= 120),
  account_no text check (account_no is null or length(account_no) <= 40),
  ssnit_no text check (ssnit_no is null or length(ssnit_no) <= 40),
  tin_no text check (tin_no is null or length(tin_no) <= 40),
  updated_at timestamptz not null default now()
);

-- The school's own kinds of allowance (earning) and deduction.
create table public.pay_components (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  name text not null check (length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('earning', 'deduction')),
  calc text not null default 'fixed' check (calc in ('fixed', 'percent_of_basic')),
  taxable boolean not null default true,
  pensionable boolean not null default false,
  active boolean not null default true,
  unique (school_id, name)
);

-- An allowance or deduction given to one member of staff, for a stretch of time.
create table public.staff_components (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  staff_id uuid not null references public.staff (id) on delete cascade,
  component_id uuid not null references public.pay_components (id) on delete restrict,
  amount numeric(12, 4) not null check (amount >= 0 and amount < 100000000),
  effective_from date not null,
  effective_to date,
  check (effective_to is null or effective_to >= effective_from)
);
create index on public.staff_components (staff_id);

-- ── Pay runs ────────────────────────────────────────────────────────────────
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  year int not null check (year between 2020 and 2100),
  month int not null check (month between 1 and 12),
  status text not null default 'draft' check (status in ('draft', 'calculated', 'in_approval', 'approved', 'paid', 'cancelled')),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  calculated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  calculated_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  paid_note text check (paid_note is null or length(paid_note) <= 200)
);
create unique index payroll_runs_one_per_month on public.payroll_runs (school_id, year, month) where status <> 'cancelled';

create table public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs (id) on delete cascade,
  school_id uuid not null,
  staff_id uuid not null references public.staff (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('earning', 'deduction')),
  amount numeric(12, 2) not null check (amount > 0 and amount < 100000000),
  note text check (note is null or length(note) <= 200)
);
create index on public.payroll_adjustments (run_id);

-- One payslip per member of staff per run, with the name and pay as they were when it was calculated.
create table public.payroll_slips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs (id) on delete cascade,
  school_id uuid not null,
  staff_id uuid not null references public.staff (id) on delete restrict,
  staff_name text not null,
  staff_no text,
  job text,
  basic numeric(12, 2) not null,
  gross numeric(12, 2) not null,
  deductions numeric(12, 2) not null,
  net numeric(12, 2) not null check (net >= 0),
  employer_cost numeric(12, 2) not null default 0,
  unique (run_id, staff_id)
);

create table public.payroll_slip_lines (
  id uuid primary key default gen_random_uuid(),
  slip_id uuid not null references public.payroll_slips (id) on delete cascade,
  kind text not null check (kind in ('earning', 'deduction', 'employer')),
  name text not null,
  amount numeric(12, 2) not null,
  sort int not null default 100
);
create index on public.payroll_slip_lines (slip_id);

create table public.payroll_run_approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs (id) on delete cascade,
  school_id uuid not null,
  step_id uuid references public.payroll_approval_steps (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null default auth.uid(),
  at timestamptz not null default now(),
  comment text check (comment is null or length(comment) <= 300),
  unique (run_id, step_id)
);

create table public.payroll_log (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs (id) on delete cascade,
  school_id uuid not null,
  actor_id uuid references public.profiles (id) on delete set null default auth.uid(),
  action text not null,
  detail text,
  at timestamptz not null default now()
);

create trigger audit_row after insert or update or delete on public.staff_pay for each row execute function public.audit_row();
create trigger audit_row after insert or update or delete on public.pay_components for each row execute function public.audit_row();
create trigger audit_row after insert or update or delete on public.staff_components for each row execute function public.audit_row();
create trigger audit_row after insert or update or delete on public.payroll_approval_steps for each row execute function public.audit_row();
create trigger audit_row after insert or update or delete on public.payroll_settings for each row execute function public.audit_row();

-- ── Who can read and write what ─────────────────────────────────────────────
alter table public.payroll_settings enable row level security;
alter table public.payroll_approval_steps enable row level security;
alter table public.staff_pay enable row level security;
alter table public.staff_pay_accounts enable row level security;
alter table public.pay_components enable row level security;
alter table public.staff_components enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_adjustments enable row level security;
alter table public.payroll_slips enable row level security;
alter table public.payroll_slip_lines enable row level security;
alter table public.payroll_run_approvals enable row level security;
alter table public.payroll_log enable row level security;

create function public._payroll_on() returns boolean language sql stable security definer set search_path = public as $$
  select public.current_school_id() is not null and public.feature_enabled('payroll') $$;
-- Who looks at pay in general (not a person's own payslips).
create function public._payroll_sees() returns boolean language sql stable security definer set search_path = public as $$
  select public._payroll_on() and public.has_any_capability(array['payroll.view_all', 'payroll.manage_pay', 'payroll.configure', 'payroll.prepare', 'payroll.approve', 'payroll.pay']) $$;

create policy payroll_settings_read on public.payroll_settings for select to authenticated
  using (school_id = public.current_school_id() and public._payroll_sees());
create policy payroll_steps_read on public.payroll_approval_steps for select to authenticated
  using (school_id = public.current_school_id() and public._payroll_sees());
create policy payroll_steps_write on public.payroll_approval_steps for all to authenticated
  using (school_id = public.current_school_id() and public._payroll_on() and public.has_capability('payroll.configure'))
  with check (school_id = public.current_school_id() and public._payroll_on() and public.has_capability('payroll.configure'));

create policy staff_pay_read on public.staff_pay for select to authenticated
  using (school_id = public.current_school_id() and public._payroll_on() and public.has_any_capability(array['payroll.view_all', 'payroll.manage_pay']));
create policy staff_pay_accounts_read on public.staff_pay_accounts for select to authenticated
  using (school_id = public.current_school_id() and public._payroll_on() and public.has_any_capability(array['payroll.view_all', 'payroll.manage_pay']));

create policy pay_components_read on public.pay_components for select to authenticated
  using (school_id = public.current_school_id() and public._payroll_sees());
create policy pay_components_write on public.pay_components for all to authenticated
  using (school_id = public.current_school_id() and public._payroll_on() and public.has_capability('payroll.configure'))
  with check (school_id = public.current_school_id() and public._payroll_on() and public.has_capability('payroll.configure'));

create policy staff_components_read on public.staff_components for select to authenticated
  using (school_id = public.current_school_id() and public._payroll_on() and public.has_any_capability(array['payroll.view_all', 'payroll.manage_pay']));
create policy staff_components_write on public.staff_components for all to authenticated
  using (school_id = public.current_school_id() and public._payroll_on() and public.has_capability('payroll.manage_pay'))
  with check (school_id = public.current_school_id() and public._payroll_on() and public.has_capability('payroll.manage_pay'));

-- Runs, payslips and what led to them are read here by people who look at pay; they are only ever written by the functions below.
create policy payroll_runs_read on public.payroll_runs for select to authenticated using (school_id = public.current_school_id() and public._payroll_sees());
create policy payroll_adjustments_read on public.payroll_adjustments for select to authenticated using (school_id = public.current_school_id() and public._payroll_sees());
create policy payroll_slips_read on public.payroll_slips for select to authenticated
  using (school_id = public.current_school_id() and public._payroll_on() and public.has_any_capability(array['payroll.view_all', 'payroll.prepare', 'payroll.approve', 'payroll.pay']));
create policy payroll_slip_lines_read on public.payroll_slip_lines for select to authenticated
  using (exists (select 1 from public.payroll_slips s where s.id = slip_id and s.school_id = public.current_school_id())
         and public._payroll_on() and public.has_any_capability(array['payroll.view_all', 'payroll.prepare', 'payroll.approve', 'payroll.pay']));
create policy payroll_approvals_read on public.payroll_run_approvals for select to authenticated using (school_id = public.current_school_id() and public._payroll_sees());
create policy payroll_log_read on public.payroll_log for select to authenticated using (school_id = public.current_school_id() and public._payroll_sees());

-- ── Setting things up ───────────────────────────────────────────────────────
create function public._payroll_settings() returns public.payroll_settings
language plpgsql security definer set search_path = public as $$
declare s public.payroll_settings;
begin
  if public.current_school_id() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into s from public.payroll_settings where school_id = public.current_school_id();
  if not found then
    insert into public.payroll_settings (school_id) values (public.current_school_id()) on conflict do nothing;
    select * into s from public.payroll_settings where school_id = public.current_school_id();
  end if;
  return s;
end $$;

create function public.payroll_config() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.payroll_settings;
begin
  if not public._payroll_on() or not public.has_any_capability(array['payroll.view_all', 'payroll.manage_pay', 'payroll.configure', 'payroll.prepare', 'payroll.approve', 'payroll.pay', 'payroll.view_own']) then
    raise exception 'not allowed' using errcode = '42501'; end if;
  s := public._payroll_settings();
  return jsonb_build_object('requireSeparateApprover', s.require_separate_approver, 'currency', s.currency);
end $$;

create function public.save_payroll_settings(p_separate boolean, p_currency text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._payroll_on() or not public.has_capability('payroll.configure') then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_currency, ''))) not between 1 and 8 then raise exception 'Give the currency, for example GHS.' using errcode = 'PAY01'; end if;
  perform public._payroll_settings();
  update public.payroll_settings set require_separate_approver = p_separate, currency = upper(btrim(p_currency)), updated_by = auth.uid(), updated_at = now()
   where school_id = public.current_school_id();
end $$;

-- Staff who can be paid, with their pay now. For those who look after pay.
create function public.payroll_staff_list()
returns table (staff_id uuid, full_name text, staff_no text, job text, status text, basic numeric, effective_from date, has_account boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._payroll_on() or not public.has_any_capability(array['payroll.view_all', 'payroll.manage_pay']) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select s.id, s.full_name, s.staff_no, s.role_title, s.status::text,
         sp.basic, sp.effective_from,
         exists (select 1 from public.staff_pay_accounts a where a.staff_id = s.id and a.account_no is not null)
    from public.staff s
    left join lateral (select p.basic, p.effective_from from public.staff_pay p where p.staff_id = s.id and p.effective_from <= current_date order by p.effective_from desc limit 1) sp on true
   where s.school_id = public.current_school_id() and s.deleted_at is null and s.status <> 'left'
   order by s.full_name;
end $$;

-- A raise (or a first salary) is a new dated row.
create function public.save_staff_pay(p_staff uuid, p_from date, p_basic numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._payroll_on() or not public.has_capability('payroll.manage_pay') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.staff where id = p_staff and school_id = public.current_school_id() and deleted_at is null) then
    raise exception 'Choose a member of staff.' using errcode = 'PAY01'; end if;
  if p_basic is null or p_basic < 0 or p_basic >= 100000000 then raise exception 'Give the basic pay as an amount of zero or more.' using errcode = 'PAY01'; end if;
  if p_from is null then raise exception 'Say from which date this pay applies.' using errcode = 'PAY01'; end if;
  insert into public.staff_pay (staff_id, effective_from, basic, note) values (p_staff, p_from, round(p_basic, 2), nullif(btrim(p_note), ''))
  on conflict (staff_id, effective_from) do update set basic = excluded.basic, note = excluded.note;
end $$;

create function public.staff_pay_history(p_staff uuid) returns table (id uuid, effective_from date, basic numeric, note text)
language sql stable security definer set search_path = public as $$
  select p.id, p.effective_from, p.basic, p.note from public.staff_pay p
   where p.staff_id = p_staff and p.school_id = public.current_school_id() and public._payroll_on()
     and public.has_any_capability(array['payroll.view_all', 'payroll.manage_pay'])
   order by p.effective_from desc $$;

create function public.get_staff_account(p_staff uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.staff_pay_accounts;
begin
  if not public._payroll_on() or not public.has_any_capability(array['payroll.view_all', 'payroll.manage_pay']) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into a from public.staff_pay_accounts where staff_id = p_staff and school_id = public.current_school_id();
  if not found then return '{}'::jsonb; end if;
  return jsonb_build_object('bankName', a.bank_name, 'accountName', a.account_name, 'accountNo', a.account_no, 'ssnitNo', a.ssnit_no, 'tinNo', a.tin_no);
end $$;

create function public.save_staff_account(p_staff uuid, p_bank text, p_account_name text, p_account_no text, p_ssnit text, p_tin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._payroll_on() or not public.has_capability('payroll.manage_pay') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.staff where id = p_staff and school_id = public.current_school_id() and deleted_at is null) then
    raise exception 'Choose a member of staff.' using errcode = 'PAY01'; end if;
  insert into public.staff_pay_accounts (staff_id, bank_name, account_name, account_no, ssnit_no, tin_no)
  values (p_staff, nullif(btrim(p_bank), ''), nullif(btrim(p_account_name), ''), nullif(btrim(p_account_no), ''), nullif(btrim(p_ssnit), ''), nullif(btrim(p_tin), ''))
  on conflict (staff_id) do update set bank_name = excluded.bank_name, account_name = excluded.account_name, account_no = excluded.account_no,
    ssnit_no = excluded.ssnit_no, tin_no = excluded.tin_no, updated_at = now();
end $$;

-- ── A pay run ───────────────────────────────────────────────────────────────
create function public._payroll_run_log(p_run uuid, p_school uuid, p_action text, p_detail text default null) returns void
language sql security definer set search_path = public as $$
  insert into public.payroll_log (run_id, school_id, action, detail) values (p_run, p_school, p_action, p_detail) $$;

create function public.create_payroll_run(p_year int, p_month int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public._payroll_on() or not public.has_capability('payroll.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_year not between 2020 and 2100 or p_month not between 1 and 12 then raise exception 'Choose a month and a year.' using errcode = 'PAY01'; end if;
  if exists (select 1 from public.payroll_runs where school_id = public.current_school_id() and year = p_year and month = p_month and status <> 'cancelled') then
    raise exception 'There is already a pay run for that month.' using errcode = 'PAY01'; end if;
  insert into public.payroll_runs (year, month) values (p_year, p_month) returning id into v_id;
  perform public._payroll_run_log(v_id, public.current_school_id(), 'started the pay run');
  return v_id;
end $$;

-- One-off amounts for this run only (a bonus, an advance being paid back).
create function public.add_payroll_adjustment(p_run uuid, p_staff uuid, p_name text, p_kind text, p_amount numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.payroll_runs;
begin
  select * into r from public.payroll_runs where id = p_run and school_id = public.current_school_id();
  if not found or not public._payroll_on() or not public.has_capability('payroll.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status not in ('draft', 'calculated') then raise exception 'This pay run can no longer be changed.' using errcode = 'PAY01'; end if;
  if p_kind not in ('earning', 'deduction') then raise exception 'Choose whether it is added to pay or taken from it.' using errcode = 'PAY01'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'Give the adjustment a name.' using errcode = 'PAY01'; end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 100000000 then raise exception 'Give an amount above zero.' using errcode = 'PAY01'; end if;
  if not exists (select 1 from public.staff where id = p_staff and school_id = r.school_id and deleted_at is null) then raise exception 'Choose a member of staff.' using errcode = 'PAY01'; end if;
  insert into public.payroll_adjustments (run_id, school_id, staff_id, name, kind, amount, note) values (p_run, r.school_id, p_staff, btrim(p_name), p_kind, round(p_amount, 2), nullif(btrim(p_note), ''));
  update public.payroll_runs set status = 'draft' where id = p_run;
  perform public._payroll_run_log(p_run, r.school_id, 'added an adjustment', btrim(p_name));
end $$;

create function public.remove_payroll_adjustment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.payroll_adjustments; r public.payroll_runs;
begin
  select * into a from public.payroll_adjustments where id = p_id and school_id = public.current_school_id();
  if not found or not public._payroll_on() or not public.has_capability('payroll.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.payroll_runs where id = a.run_id;
  if r.status not in ('draft', 'calculated') then raise exception 'This pay run can no longer be changed.' using errcode = 'PAY01'; end if;
  delete from public.payroll_adjustments where id = p_id;
  update public.payroll_runs set status = 'draft' where id = r.id;
  perform public._payroll_run_log(r.id, r.school_id, 'removed an adjustment', a.name);
end $$;

-- Work out every payslip. Draws on the pay and the allowances and deductions in force that month, and this run's adjustments.
create function public.calculate_payroll_run(p_run uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.payroll_runs; v_start date; v_end date; st record; comp record; adj record;
  v_basic numeric; v_earn numeric; v_ded numeric; v_slip uuid; v_amt numeric; v_n int := 0; v_skipped int := 0; v_sort int;
begin
  select * into r from public.payroll_runs where id = p_run and school_id = public.current_school_id();
  if not found or not public._payroll_on() or not public.has_capability('payroll.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status not in ('draft', 'calculated') then raise exception 'This pay run can no longer be recalculated.' using errcode = 'PAY01'; end if;
  v_start := make_date(r.year, r.month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;
  delete from public.payroll_slips where run_id = p_run;
  for st in select s.id, s.full_name, s.staff_no, s.role_title from public.staff s
             where s.school_id = r.school_id and s.status = 'active' and s.deleted_at is null order by s.full_name loop
    select p.basic into v_basic from public.staff_pay p where p.staff_id = st.id and p.effective_from <= v_end order by p.effective_from desc limit 1;
    if v_basic is null then v_skipped := v_skipped + 1; continue; end if;
    insert into public.payroll_slips (run_id, school_id, staff_id, staff_name, staff_no, job, basic, gross, deductions, net)
      values (p_run, r.school_id, st.id, st.full_name, st.staff_no, st.role_title, v_basic, 0, 0, 0) returning id into v_slip;
    insert into public.payroll_slip_lines (slip_id, kind, name, amount, sort) values (v_slip, 'earning', 'Basic salary', v_basic, 0);
    v_earn := v_basic; v_ded := 0; v_sort := 10;
    for comp in select pc.name, pc.kind, pc.calc, sc.amount from public.staff_components sc join public.pay_components pc on pc.id = sc.component_id
                 where sc.staff_id = st.id and pc.active and sc.effective_from <= v_end and (sc.effective_to is null or sc.effective_to >= v_start)
                 order by pc.kind, pc.name loop
      v_amt := round(case comp.calc when 'fixed' then comp.amount else v_basic * comp.amount / 100 end, 2);
      insert into public.payroll_slip_lines (slip_id, kind, name, amount, sort) values (v_slip, comp.kind, comp.name, v_amt, v_sort);
      if comp.kind = 'earning' then v_earn := v_earn + v_amt; else v_ded := v_ded + v_amt; end if;
      v_sort := v_sort + 1;
    end loop;
    for adj in select a.name, a.kind, a.amount from public.payroll_adjustments a where a.run_id = p_run and a.staff_id = st.id order by a.kind, a.name loop
      insert into public.payroll_slip_lines (slip_id, kind, name, amount, sort) values (v_slip, adj.kind, adj.name || ' (this month only)', adj.amount, v_sort);
      if adj.kind = 'earning' then v_earn := v_earn + adj.amount; else v_ded := v_ded + adj.amount; end if;
      v_sort := v_sort + 1;
    end loop;
    if v_earn - v_ded < 0 then
      raise exception '%''s deductions are more than their pay. Change the deductions or the adjustments and calculate again.', st.full_name using errcode = 'PAY01';
    end if;
    update public.payroll_slips set gross = v_earn, deductions = v_ded, net = v_earn - v_ded where id = v_slip;
    v_n := v_n + 1;
  end loop;
  update public.payroll_runs set status = 'calculated', calculated_by = auth.uid(), calculated_at = now() where id = p_run;
  perform public._payroll_run_log(p_run, r.school_id, 'calculated the pay run', v_n || ' payslips, ' || v_skipped || ' staff without pay details');
  return jsonb_build_object('slips', v_n, 'skipped', v_skipped);
end $$;

-- ── Approval ────────────────────────────────────────────────────────────────
-- The step a run is waiting at: the first step with no signature yet, or null when none is defined (any approver may sign).
create function public._payroll_next_step(p_run uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from public.payroll_approval_steps s join public.payroll_runs r on r.id = p_run and r.school_id = s.school_id
   where not exists (select 1 from public.payroll_run_approvals a where a.run_id = p_run and a.step_id = s.id) order by s.position limit 1 $$;

create function public.submit_payroll_run(p_run uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.payroll_runs; v_step uuid; v_who uuid[];
begin
  select * into r from public.payroll_runs where id = p_run and school_id = public.current_school_id();
  if not found or not public._payroll_on() or not public.has_capability('payroll.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status <> 'calculated' then raise exception 'Calculate the pay run first. It must be up to date before it is sent for approval.' using errcode = 'PAY01'; end if;
  if not exists (select 1 from public.payroll_slips where run_id = p_run) then raise exception 'There are no payslips in this pay run.' using errcode = 'PAY01'; end if;
  update public.payroll_runs set status = 'in_approval' where id = p_run;
  perform public._payroll_run_log(p_run, r.school_id, 'sent the pay run for approval');
  v_step := public._payroll_next_step(p_run);
  if v_step is not null then select approvers into v_who from public.payroll_approval_steps where id = v_step;
  else select coalesce(array_agg(uc.profile_id), '{}') into v_who from public.user_capabilities uc where uc.school_id = r.school_id and uc.capability = 'payroll.approve'; end if;
  begin
    perform public.notify_profiles(r.school_id, 'payroll_approval_needed', v_who, 'A pay run is waiting for your approval', to_char(make_date(r.year, r.month, 1), 'FMMonth YYYY'), '/payroll');
  exception when others then raise warning 'payroll notification failed: %', sqlerrm; end;
end $$;

create function public.approve_payroll_run(p_run uuid, p_comment text) returns text
language plpgsql security definer set search_path = public as $$
declare r public.payroll_runs; s public.payroll_settings; v_step uuid; v_ok boolean; v_total int; v_signed int; v_next uuid; v_who uuid[];
begin
  select * into r from public.payroll_runs where id = p_run and school_id = public.current_school_id();
  if not found or not public._payroll_on() or not public.has_capability('payroll.approve') then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status <> 'in_approval' then raise exception 'This pay run is not waiting for approval.' using errcode = 'PAY01'; end if;
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

-- Send it back, with a reason. Every signature is cleared, so it has to be calculated and signed again.
create function public.reject_payroll_run(p_run uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.payroll_runs;
begin
  select * into r from public.payroll_runs where id = p_run and school_id = public.current_school_id();
  if not found or not public._payroll_on() or not public.has_capability('payroll.approve') then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status <> 'in_approval' then raise exception 'This pay run is not waiting for approval.' using errcode = 'PAY01'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then raise exception 'Say what needs to change.' using errcode = 'PAY01'; end if;
  delete from public.payroll_run_approvals where run_id = p_run;
  update public.payroll_runs set status = 'draft' where id = p_run;
  perform public._payroll_run_log(p_run, r.school_id, 'sent the pay run back', btrim(p_reason));
end $$;

create function public.mark_payroll_paid(p_run uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.payroll_runs; v_who uuid[];
begin
  select * into r from public.payroll_runs where id = p_run and school_id = public.current_school_id();
  if not found or not public._payroll_on() or not public.has_capability('payroll.pay') then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status <> 'approved' then raise exception 'Only an approved pay run can be marked as paid.' using errcode = 'PAY01'; end if;
  update public.payroll_runs set status = 'paid', paid_at = now(), paid_note = nullif(btrim(p_note), '') where id = p_run;
  perform public._payroll_run_log(p_run, r.school_id, 'marked the pay run as paid', nullif(btrim(p_note), ''));
  select coalesce(array_agg(st.profile_id), '{}') into v_who from public.payroll_slips sl join public.staff st on st.id = sl.staff_id where sl.run_id = p_run and st.profile_id is not null;
  begin
    perform public.notify_profiles(r.school_id, 'payroll_payslip_ready', v_who, 'Your payslip is ready', to_char(make_date(r.year, r.month, 1), 'FMMonth YYYY'), '/payroll');
  exception when others then raise warning 'payroll notification failed: %', sqlerrm; end;
end $$;

create function public.cancel_payroll_run(p_run uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.payroll_runs;
begin
  select * into r from public.payroll_runs where id = p_run and school_id = public.current_school_id();
  if not found or not public._payroll_on() or not public.has_capability('payroll.prepare') then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status in ('paid', 'cancelled') then raise exception 'A paid or cancelled pay run cannot be cancelled.' using errcode = 'PAY01'; end if;
  update public.payroll_runs set status = 'cancelled' where id = p_run;
  perform public._payroll_run_log(p_run, r.school_id, 'cancelled the pay run', nullif(btrim(p_reason), ''));
end $$;

-- ── A person's own payslips ─────────────────────────────────────────────────
-- Only from runs that have been marked paid.
create function public.my_payslips()
returns table (id uuid, year int, month int, basic numeric, gross numeric, deductions numeric, net numeric, paid_at timestamptz)
language sql stable security definer set search_path = public as $$
  select sl.id, r.year, r.month, sl.basic, sl.gross, sl.deductions, sl.net, r.paid_at
    from public.payroll_slips sl join public.payroll_runs r on r.id = sl.run_id join public.staff st on st.id = sl.staff_id
   where st.profile_id = auth.uid() and r.status = 'paid' and r.school_id = public.current_school_id()
     and public._payroll_on() and public.has_capability('payroll.view_own')
   order by r.year desc, r.month desc $$;

create function public.my_payslip_lines(p_slip uuid) returns table (kind text, name text, amount numeric)
language sql stable security definer set search_path = public as $$
  select l.kind, l.name, l.amount from public.payroll_slip_lines l
    join public.payroll_slips sl on sl.id = l.slip_id join public.payroll_runs r on r.id = sl.run_id join public.staff st on st.id = sl.staff_id
   where l.slip_id = p_slip and st.profile_id = auth.uid() and r.status = 'paid' and r.school_id = public.current_school_id()
     and public._payroll_on() and public.has_capability('payroll.view_own')
   order by l.kind desc, l.sort $$;

-- ── Lock the functions down ─────────────────────────────────────────────────
revoke execute on function public._payroll_on() from public, anon;
revoke execute on function public._payroll_sees() from public, anon;
revoke execute on function public._payroll_settings() from public, anon, authenticated;
revoke execute on function public._payroll_run_log(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public._payroll_next_step(uuid) from public, anon, authenticated;
revoke execute on function public.payroll_config() from public, anon;
revoke execute on function public.save_payroll_settings(boolean, text) from public, anon;
revoke execute on function public.payroll_staff_list() from public, anon;
revoke execute on function public.save_staff_pay(uuid, date, numeric, text) from public, anon;
revoke execute on function public.staff_pay_history(uuid) from public, anon;
revoke execute on function public.get_staff_account(uuid) from public, anon;
revoke execute on function public.save_staff_account(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.create_payroll_run(int, int) from public, anon;
revoke execute on function public.add_payroll_adjustment(uuid, uuid, text, text, numeric, text) from public, anon;
revoke execute on function public.remove_payroll_adjustment(uuid) from public, anon;
revoke execute on function public.calculate_payroll_run(uuid) from public, anon;
revoke execute on function public.submit_payroll_run(uuid) from public, anon;
revoke execute on function public.approve_payroll_run(uuid, text) from public, anon;
revoke execute on function public.reject_payroll_run(uuid, text) from public, anon;
revoke execute on function public.mark_payroll_paid(uuid, text) from public, anon;
revoke execute on function public.cancel_payroll_run(uuid, text) from public, anon;
revoke execute on function public.my_payslips() from public, anon;
revoke execute on function public.my_payslip_lines(uuid) from public, anon;
grant execute on function public._payroll_on() to authenticated;
grant execute on function public._payroll_sees() to authenticated;
grant execute on function public.payroll_config() to authenticated;
grant execute on function public.save_payroll_settings(boolean, text) to authenticated;
grant execute on function public.payroll_staff_list() to authenticated;
grant execute on function public.save_staff_pay(uuid, date, numeric, text) to authenticated;
grant execute on function public.staff_pay_history(uuid) to authenticated;
grant execute on function public.get_staff_account(uuid) to authenticated;
grant execute on function public.save_staff_account(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.create_payroll_run(int, int) to authenticated;
grant execute on function public.add_payroll_adjustment(uuid, uuid, text, text, numeric, text) to authenticated;
grant execute on function public.remove_payroll_adjustment(uuid) to authenticated;
grant execute on function public.calculate_payroll_run(uuid) to authenticated;
grant execute on function public.submit_payroll_run(uuid) to authenticated;
grant execute on function public.approve_payroll_run(uuid, text) to authenticated;
grant execute on function public.reject_payroll_run(uuid, text) to authenticated;
grant execute on function public.mark_payroll_paid(uuid, text) to authenticated;
grant execute on function public.cancel_payroll_run(uuid, text) to authenticated;
grant execute on function public.my_payslips() to authenticated;
grant execute on function public.my_payslip_lines(uuid) to authenticated;
