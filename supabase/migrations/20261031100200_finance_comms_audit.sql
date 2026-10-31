-- Finance, communication, audit log.

create type public.invoice_status as enum ('unpaid', 'partial', 'paid', 'void');
create type public.invoice_item_kind as enum ('fee', 'discount', 'arrears');
create type public.payment_method as enum ('cash', 'mobile_money', 'bank_transfer');
create type public.momo_network as enum ('mtn', 'telecel', 'airteltigo');
create type public.discount_type as enum ('percent', 'fixed');

create table public.fee_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null,
  is_one_off boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

-- Price of a category for a level. term_id is null for one-off fees.
create table public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  fee_category_id uuid not null references public.fee_categories (id),
  level_id uuid not null references public.levels (id),
  term_id uuid references public.terms (id),
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index fee_structures_unique
  on public.fee_structures (fee_category_id, level_id, coalesce(term_id, '00000000-0000-0000-0000-000000000000'));
create index on public.fee_structures (school_id);

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null,
  type public.discount_type not null,
  value numeric(12, 2) not null check (value >= 0),
  applies_to_category_id uuid references public.fee_categories (id),
  reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table public.student_discounts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  student_id uuid not null references public.students (id),
  discount_id uuid not null references public.discounts (id),
  academic_year_id uuid not null references public.academic_years (id),
  approved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (student_id, discount_id, academic_year_id)
);
create index on public.student_discounts (school_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  student_id uuid not null references public.students (id),
  term_id uuid references public.terms (id),
  number text not null,
  issued_on date not null default current_date,
  due_on date,
  status public.invoice_status not null default 'unpaid',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, number)
);
create index on public.invoices (school_id, status);
create index on public.invoices (student_id);

create function public.invoices_assign_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.number is null or new.number = '' then
    new.number := public.issue_number(new.school_id, 'invoice_no');
  end if;
  return new;
end $$;

create trigger invoices_assign_number
before insert on public.invoices
for each row execute function public.invoices_assign_number();

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  fee_category_id uuid references public.fee_categories (id),
  kind public.invoice_item_kind not null default 'fee',
  -- For arrears: the invoice the unpaid balance came from.
  source_invoice_id uuid references public.invoices (id),
  description text not null,
  -- Discounts are stored as negative amounts.
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  check ((kind = 'discount') = (amount < 0) or amount = 0)
);
create index on public.invoice_items (invoice_id);
create index on public.invoice_items (school_id);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  due_on date not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index on public.installments (invoice_id);
create index on public.installments (school_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  invoice_id uuid not null references public.invoices (id),
  receipt_no text not null,
  amount numeric(12, 2) not null check (amount > 0),
  method public.payment_method not null,
  network public.momo_network,
  reference text,
  paid_on date not null default current_date,
  received_by uuid references public.profiles (id),
  paid_by_guardian_id uuid references public.guardians (id),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, receipt_no),
  -- Mobile money needs a network; other methods must not carry one.
  check ((method = 'mobile_money') = (network is not null))
);
create index on public.payments (invoice_id);
create index on public.payments (school_id, paid_on);

create function public.payments_assign_receipt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.receipt_no is null or new.receipt_no = '' then
    new.receipt_no := public.issue_number(new.school_id, 'receipt_no');
  end if;
  return new;
end $$;

create trigger payments_assign_receipt
before insert on public.payments
for each row execute function public.payments_assign_receipt();

-- Keep invoices.status in step with payments. An invoice is paid when
-- non-voided payments cover the sum of its items.
create function public.refresh_invoice_status(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_total numeric;
  v_paid numeric;
  v_status public.invoice_status;
begin
  if (select status from public.invoices where id = p_invoice) = 'void' then
    return;
  end if;
  select coalesce(sum(amount), 0) into v_total from public.invoice_items where invoice_id = p_invoice;
  select coalesce(sum(amount), 0) into v_paid from public.payments
    where invoice_id = p_invoice and voided_at is null;
  v_status := case
    when v_paid <= 0 then 'unpaid'
    when v_paid >= v_total then 'paid'
    else 'partial'
  end;
  update public.invoices set status = v_status, updated_at = now() where id = p_invoice;
end $$;

create function public.payments_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_invoice_status(coalesce(new.invoice_id, old.invoice_id));
  return null;
end $$;

create trigger payments_after_change
after insert or update or delete on public.payments
for each row execute function public.payments_after_change();

create function public.invoice_items_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_invoice_status(coalesce(new.invoice_id, old.invoice_id));
  return null;
end $$;

create trigger invoice_items_after_change
after insert or update or delete on public.invoice_items
for each row execute function public.invoice_items_after_change();

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------

create type public.announcement_audience as enum ('all', 'staff', 'parents', 'class');

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  title text not null,
  body text not null,
  audience public.announcement_audience not null default 'all',
  class_id uuid references public.classes (id),
  posted_by uuid references public.profiles (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((audience = 'class') = (class_id is not null))
);
create index on public.announcements (school_id, published_at);

-- ---------------------------------------------------------------------------
-- Audit log: insert-only
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  school_id uuid,
  actor_id uuid,
  action text not null,
  table_name text not null,
  row_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index on public.audit_log (school_id, at desc);
create index on public.audit_log (table_name, row_id);

create function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (school_id, actor_id, action, table_name, row_id, before, after)
  values (
    nullif(r ->> 'school_id', '')::uuid,
    auth.uid(),
    tg_op,
    tg_table_name,
    nullif(r ->> 'id', '')::uuid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'students','guardians','staff','user_roles','enrollments','scores',
    'term_results','invoices','invoice_items','payments','bece_registrations'
  ]
  loop
    execute format(
      'create trigger audit_row after insert or update or delete on public.%I
       for each row execute function public.audit_row()', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'fee_categories','fee_structures','discounts','invoices','announcements'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
