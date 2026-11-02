-- Expense tracking, categories, receipt attachments, and approval workflow.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'expense_status') then
    create type public.expense_status as enum ('pending', 'approved', 'rejected', 'paid');
  end if;
end $$;

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  name text not null,
  budget_limit numeric(12, 2) check (budget_limit is null or budget_limit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);
create index if not exists expense_categories_school_id_idx on public.expense_categories (school_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  expense_category_id uuid not null references public.expense_categories (id),
  term_id uuid references public.terms (id),
  voucher_no text not null,
  title text not null,
  vendor text,
  amount numeric(12, 2) not null check (amount > 0),
  incurred_on date not null default current_date,
  payment_method public.payment_method not null default 'cash',
  reference text,
  notes text,
  receipt_url text,
  status public.expense_status not null default 'pending',
  requested_by uuid references public.profiles (id),
  requested_by_name text,
  reviewed_by uuid references public.profiles (id),
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, voucher_no)
);
create index if not exists expenses_school_status_idx on public.expenses (school_id, status);
create index if not exists expenses_incurred_on_idx on public.expenses (school_id, incurred_on desc);

-- Auto-assign voucher_no (EXP-YYYY-NNNN) and stamp requester identity on insert.
create or replace function public.expenses_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_year text := to_char(coalesce(new.incurred_on, current_date), 'YYYY');
  v_seq int;
begin
  if new.school_id is null then
    new.school_id := public.current_school_id();
  end if;

  if new.voucher_no is null or btrim(new.voucher_no) = '' then
    select count(*) + 1 into v_seq
    from public.expenses
    where school_id = new.school_id
      and voucher_no like 'EXP-' || v_year || '-%';

    loop
      new.voucher_no := 'EXP-' || v_year || '-' || lpad(v_seq::text, 4, '0');
      exit when not exists (
        select 1 from public.expenses
        where school_id = new.school_id and voucher_no = new.voucher_no
      );
      v_seq := v_seq + 1;
    end loop;
  end if;

  if auth.uid() is not null and new.requested_by is null then
    new.requested_by := auth.uid();
  end if;

  if new.requested_by is not null and (new.requested_by_name is null or btrim(new.requested_by_name) = '') then
    select full_name into new.requested_by_name
    from public.profiles
    where id = new.requested_by;
  end if;

  return new;
end $$;

drop trigger if exists expenses_before_insert on public.expenses;
create trigger expenses_before_insert
before insert on public.expenses
for each row execute function public.expenses_before_insert();

drop trigger if exists set_updated_at on public.expense_categories;
create trigger set_updated_at before update on public.expense_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.expenses;
create trigger set_updated_at before update on public.expenses
for each row execute function public.set_updated_at();

drop trigger if exists audit_row on public.expenses;
create trigger audit_row after insert or update or delete on public.expenses
for each row execute function public.audit_row();

-- Enable RLS
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

drop policy if exists expense_categories_read on public.expense_categories;
create policy expense_categories_read on public.expense_categories
  for select to authenticated
  using (
    school_id = public.current_school_id()
    and public.has_any_role(array['school_admin','accountant','principal']::public.app_role[])
  );

drop policy if exists expense_categories_write on public.expense_categories;
create policy expense_categories_write on public.expense_categories
  for all to authenticated
  using (
    school_id = public.current_school_id()
    and public.has_any_role(array['school_admin','accountant']::public.app_role[])
  )
  with check (
    school_id = public.current_school_id()
    and public.has_any_role(array['school_admin','accountant']::public.app_role[])
  );

drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses
  for select to authenticated
  using (
    school_id = public.current_school_id()
    and public.has_any_role(array['school_admin','accountant','principal']::public.app_role[])
  );

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (
    school_id = public.current_school_id()
    and public.has_any_role(array['school_admin','accountant','principal']::public.app_role[])
  );

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update to authenticated
  using (
    school_id = public.current_school_id()
    and public.has_any_role(array['school_admin','accountant','principal']::public.app_role[])
  )
  with check (
    school_id = public.current_school_id()
    and public.has_any_role(array['school_admin','accountant','principal']::public.app_role[])
  );

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete to authenticated
  using (
    school_id = public.current_school_id()
    and status in ('pending', 'rejected')
    and public.has_any_role(array['school_admin','accountant']::public.app_role[])
  );

-- Review (approve / reject) or mark paid via RPC with role enforcement.
create or replace function public.review_expense(
  p_expense_id uuid,
  p_decision public.expense_status,
  p_review_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid := public.current_school_id();
  v_reviewer_name text;
begin
  if v_school is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_decision in ('approved', 'rejected') then
    if not public.has_any_role(array['school_admin', 'principal']::public.app_role[]) then
      raise exception 'Only a School Admin or Principal may approve or reject expenses.' using errcode = '42501';
    end if;

    select full_name into v_reviewer_name from public.profiles where id = auth.uid();

    update public.expenses
    set status = p_decision,
        reviewed_by = auth.uid(),
        reviewed_by_name = v_reviewer_name,
        reviewed_at = now(),
        review_note = nullif(btrim(coalesce(p_review_note, '')), '')
    where id = p_expense_id
      and school_id = v_school;

    if not found then
      raise exception 'Expense not found' using errcode = 'P0002';
    end if;

  elsif p_decision = 'paid' then
    if not public.has_any_role(array['school_admin', 'accountant']::public.app_role[]) then
      raise exception 'Only a School Admin or Accountant may mark an expense as paid.' using errcode = '42501';
    end if;

    update public.expenses
    set status = 'paid',
        paid_at = now(),
        review_note = coalesce(nullif(btrim(coalesce(p_review_note, '')), ''), review_note)
    where id = p_expense_id
      and school_id = v_school
      and status in ('approved', 'pending');

    if not found then
      raise exception 'Expense must be pending or approved before marking as paid' using errcode = 'P0002';
    end if;
  else
    raise exception 'Invalid decision status' using errcode = '22023';
  end if;
end $$;

revoke execute on function public.expenses_before_insert() from public, anon, authenticated;
revoke execute on function public.review_expense(uuid, public.expense_status, text) from public, anon;
grant execute on function public.review_expense(uuid, public.expense_status, text) to authenticated;

-- Seed default expense categories for existing schools
insert into public.expense_categories (school_id, name, budget_limit)
select s.id, c.name, c.budget_limit
from public.schools s
cross join (
  values
    ('Utilities & Electricity', 2500.00),
    ('Stationery & Printing', 1800.00),
    ('Teaching & Learning Materials', 3500.00),
    ('Maintenance & Repairs', 2000.00),
    ('Sanitation & First Aid', 1200.00),
    ('Transport & Fuel', 1500.00),
    ('Canteen & Feeding', 4000.00),
    ('Miscellaneous', 1000.00)
) as c(name, budget_limit)
on conflict (school_id, name) do nothing;

