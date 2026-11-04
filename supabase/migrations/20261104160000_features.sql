-- Features: each school switches whole parts of the system on or off.
--
-- Not every school wants every module. A feature that is off disappears from the menus, and the
-- database refuses it, so nothing else shows an empty box or a broken link. Everything is on by
-- default, so nothing changes until a school switches something off.
--
-- Core parts (students, users, settings, access, the audit trail) cannot be switched off.
-- Where a person's access is checked with has_capability, an action of a switched-off feature
-- simply stops being held, for everyone, including a developer. Parents' own view of their fees
-- is switched off too, because that is money.

-- ── The catalogue of switchable features ────────────────────────────────────
create table public.app_features (
  key text primary key,
  label text not null,
  description text not null,
  kind text not null check (kind in ('module', 'channel')),
  default_on boolean not null default true,
  requires text[] not null default '{}',
  sort int not null default 0
);
alter table public.app_features enable row level security;
create policy app_features_read on public.app_features for select to authenticated using (true);

insert into public.app_features (key, label, description, kind, requires, sort) values
  ('attendance', 'Attendance', 'Daily class registers and absence figures.', 'module', '{}', 10),
  ('grades', 'Grades and report cards', 'Assessments, marks, results and report cards.', 'module', '{}', 20),
  ('fees', 'Fees and receipts', 'Invoices, payments, receipts, discounts and instalments. Switch off if the school does not manage fees here.', 'module', '{}', 30),
  ('online_payments', 'Online payments', 'Let parents pay fees online through Paystack. Without it, the office records payments by hand and issues receipts.', 'channel', '{fees}', 40),
  ('expenses', 'Expenses', 'Record and approve the school''s expenses.', 'module', '{}', 50),
  ('analytics', 'Analytics', 'Reports and charts across the school, with exports.', 'module', '{}', 60),
  ('staff', 'Staff directory', 'The staff list and staff records.', 'module', '{}', 70),
  ('messages', 'Text messages (SMS)', 'Send SMS to parents and staff, including absence alerts and fee reminders.', 'channel', '{}', 80),
  ('notices', 'Notices', 'The notice board for the whole school and for classes.', 'module', '{}', 90),
  ('timetable', 'Timetable', 'Class and teacher timetables.', 'module', '{}', 100);

-- ── What each school has chosen ─────────────────────────────────────────────
create table public.school_features (
  school_id uuid not null default public.current_school_id() references public.schools (id),
  feature text not null references public.app_features (key) on delete cascade,
  enabled boolean not null,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (school_id, feature)
);
alter table public.school_features enable row level security;
-- Everyone in the school can read the choices; nobody writes them directly (see set_school_features).
create policy school_features_read on public.school_features for select to authenticated
  using (school_id = public.current_school_id());

-- Is this feature on for this school? A feature switched off, or one that needs another that is
-- off, is off. A key that is not in the catalogue (a core part) is always on.
create function public.school_feature_enabled(p_school uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(sf.enabled, f.default_on)
       and not exists (
         select 1 from unnest(f.requires) r
         where not coalesce(
           (select sf2.enabled from public.school_features sf2 where sf2.school_id = p_school and sf2.feature = r),
           (select f2.default_on from public.app_features f2 where f2.key = r), true))
     from public.app_features f
     left join public.school_features sf on sf.school_id = p_school and sf.feature = f.key
     where f.key = p_key),
    true)
$$;
-- The version that names a school is for the server's own functions only.
revoke all on function public.school_feature_enabled(uuid, text) from public, anon, authenticated;
grant execute on function public.school_feature_enabled(uuid, text) to service_role;

create function public.feature_enabled(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.school_feature_enabled(public.current_school_id(), p_key)
$$;
revoke all on function public.feature_enabled(text) from public, anon;
grant execute on function public.feature_enabled(text) to authenticated;

-- Which feature does an action belong to? Its module, except reviewing online payments.
create function public.capability_feature(p_cap text) returns text
language sql immutable as $$
  select case p_cap when 'fees.review_online' then 'online_payments' else split_part(p_cap, '.', 1) end
$$;

-- ── Access now respects the switches ────────────────────────────────────────
create or replace function public.has_capability(p_cap text) returns boolean
language sql stable security definer set search_path = public as $$
  select (
    public.is_developer() or exists (
      select 1 from public.user_capabilities uc
      where uc.profile_id = auth.uid() and uc.capability = p_cap
        and (uc.expires_at is null or uc.expires_at > now())
    )
  ) and public.feature_enabled(public.capability_feature(p_cap))
$$;

create or replace function public.has_any_capability(p_caps text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(p_caps) as c where public.has_capability(c))
$$;

create or replace function public.my_capabilities() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(k order by s), '{}') from (
    select c.key as k, c.sort as s from public.access_capabilities c
    where public.has_capability(c.key)
  ) held
$$;

-- The keys of the features that are switched off, for the app to hide what they open.
create function public.my_disabled_features() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(f.key order by f.sort), '{}') from public.app_features f
  where not public.feature_enabled(f.key)
$$;
revoke all on function public.my_disabled_features() from public, anon;
grant execute on function public.my_disabled_features() to authenticated;

-- Parents' view of their own fees is money, so it follows the switches too.
drop policy invoices_parent_read on public.invoices;
drop policy invoice_items_parent_read on public.invoice_items;
drop policy installments_parent_read on public.installments;
drop policy payments_parent_read on public.payments;
drop policy online_payments_read on public.online_payments;

create policy invoices_parent_read on public.invoices for select to authenticated
  using (school_id = public.current_school_id() and deleted_at is null and public.has_role('parent')
         and public.is_guardian_of(student_id) and public.feature_enabled('fees'));
create policy invoice_items_parent_read on public.invoice_items for select to authenticated
  using (school_id = public.current_school_id() and public.has_role('parent') and public.feature_enabled('fees')
         and exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and public.is_guardian_of(i.student_id)));
create policy installments_parent_read on public.installments for select to authenticated
  using (school_id = public.current_school_id() and public.has_role('parent') and public.feature_enabled('fees')
         and exists (select 1 from public.invoices i where i.id = installments.invoice_id and public.is_guardian_of(i.student_id)));
create policy payments_parent_read on public.payments for select to authenticated
  using (school_id = public.current_school_id() and public.has_role('parent') and public.feature_enabled('fees')
         and exists (select 1 from public.invoices i where i.id = payments.invoice_id and public.is_guardian_of(i.student_id)));
create policy online_payments_read on public.online_payments for select to authenticated
  using (school_id = public.current_school_id() and public.feature_enabled('online_payments')
         and (initiated_by = auth.uid() or public.has_capability('fees.review_online')));

-- ── Changing the switches ───────────────────────────────────────────────────
-- Replace the set of features that are on with exactly this list. A feature cannot be on while
-- one it needs is off. Only someone who may change school settings can do it, and it is audited.
create function public.set_school_features(p_on text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid := public.current_school_id();
  v_on text[] := coalesce(p_on, '{}');
  v_before text[];
  v_after text[];
  k text;
  f record;
  r text;
begin
  if auth.uid() is null or not public.has_capability('settings.edit') then
    raise exception 'You do not have permission to change which features are on.' using errcode = '42501';
  end if;
  foreach k in array v_on loop
    if not exists (select 1 from public.app_features where key = k) then
      raise exception 'Unknown feature: %', k using errcode = '22023';
    end if;
  end loop;
  for f in select key, label, requires from public.app_features where key = any (v_on) loop
    foreach r in array f.requires loop
      if not (r = any (v_on)) then
        raise exception '% needs % to be on first.', f.label, (select label from public.app_features where key = r) using errcode = '22023';
      end if;
    end loop;
  end loop;

  select coalesce(array_agg(key order by key), '{}') into v_before from public.app_features a
    where public.school_feature_enabled(v_school, a.key);

  insert into public.school_features (school_id, feature, enabled, updated_by)
    select v_school, a.key, a.key = any (v_on), auth.uid() from public.app_features a
    on conflict (school_id, feature) do update
      set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now();

  select coalesce(array_agg(key order by key), '{}') into v_after from public.app_features a
    where public.school_feature_enabled(v_school, a.key);

  if v_before is distinct from v_after then
    insert into public.audit_log (school_id, actor_id, action, table_name, row_id, before, after)
    values (v_school, auth.uid(), 'FEATURES_CHANGE', 'school_features', null, to_jsonb(v_before), to_jsonb(v_after));
  end if;
end $$;
revoke all on function public.set_school_features(text[]) from public, anon;
grant execute on function public.set_school_features(text[]) to authenticated;
