-- Messaging: SMS to parents and staff through Arkesel.
--
-- Clients never insert messages. The `messaging` Edge Function (service role)
-- resolves the audience, writes the rows, calls the provider and updates the
-- status. Staff with a messaging role can read the log; that is all RLS allows.

-- A parent can ask not to receive school-wide messages.
alter table public.guardians add column if not exists sms_opt_out boolean not null default false;

-- ─── Templates ───────────────────────────────────────────────────────────────
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  key text not null,
  name text not null,
  body text not null check (length(body) between 1 and 640),
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, key)
);

-- ─── Batches (one send action) and messages (one per recipient) ─────────────
create table public.message_batches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  title text not null,
  kind text not null,                       -- template key, 'custom' or 'test'
  audience text not null check (audience in
    ('all_parents', 'class_parents', 'fee_balance', 'absent_today', 'staff', 'teachers', 'custom')),
  class_id uuid references public.classes (id) on delete set null,
  body_template text not null,
  sandbox boolean not null default false,   -- provider accepts but does not deliver or bill
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.message_batches (school_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  batch_id uuid not null references public.message_batches (id) on delete cascade,
  kind text not null,
  recipient_name text,
  recipient_phone text not null,            -- international form, digits only (233...)
  guardian_id uuid references public.guardians (id) on delete set null,
  staff_id uuid references public.staff (id) on delete set null,
  student_id uuid references public.students (id) on delete set null,
  body text not null,
  segments int not null default 1,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled')),
  provider text not null default 'arkesel',
  provider_message_id text,
  provider_response jsonb,                  -- raw reply, kept to diagnose provider changes
  error text,
  attempts int not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.messages (school_id, created_at desc);
create index on public.messages (batch_id, status);
create index messages_open_idx on public.messages (status, created_at) where status in ('queued', 'sending');
create index on public.messages (provider_message_id) where provider_message_id is not null;

create trigger set_updated_at before update on public.message_templates
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.messages
  for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.message_templates
  for each row execute function public.audit_row();

-- ─── Access ──────────────────────────────────────────────────────────────────
alter table public.message_templates enable row level security;
alter table public.message_batches enable row level security;
alter table public.messages enable row level security;

create policy message_templates_read on public.message_templates for select to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','principal','accountant']::public.app_role[]));
create policy message_templates_write on public.message_templates for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','principal']::public.app_role[]))
  with check (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','principal']::public.app_role[]));

-- Read-only for clients: the log contains phone numbers and message text.
create policy message_batches_read on public.message_batches for select to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','principal','accountant']::public.app_role[]));
create policy messages_read on public.messages for select to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','principal','accountant']::public.app_role[]));

-- ─── Who gets a message (service role only) ──────────────────────────────────
-- One row per guardian (or staff member) with a phone number. A parent with
-- several children in the audience gets one row listing them all.
create or replace function public.messaging_audience(
  p_school uuid, p_kind text, p_class uuid default null, p_date date default current_date
) returns table (
  guardian_id uuid, staff_id uuid, student_id uuid, recipient_name text, phone text,
  student_names text, class_name text, balance numeric
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if p_kind in ('all_parents', 'class_parents', 'fee_balance', 'absent_today') then
    return query
    with kids as (
      select sg.guardian_id as gid, s.id as sid, (s.first_name || ' ' || s.last_name) as sname,
             (select l.name || ' ' || c.section
                from public.enrollments e
                join public.classes c on c.id = e.class_id
                join public.levels l on l.id = c.level_id
                join public.academic_years y on y.id = e.academic_year_id
               where e.student_id = s.id and y.is_current limit 1) as cname,
             (select e.class_id
                from public.enrollments e
                join public.academic_years y on y.id = e.academic_year_id
               where e.student_id = s.id and y.is_current limit 1) as cid
      from public.student_guardians sg
      join public.students s on s.id = sg.student_id
      where sg.school_id = p_school and s.status = 'active' and s.deleted_at is null
    ),
    owed as (
      select i.student_id as sid,
             sum(greatest(
               coalesce((select sum(amount) from public.invoice_items it where it.invoice_id = i.id), 0)
               - coalesce((select sum(amount) from public.payments py where py.invoice_id = i.id and py.voided_at is null), 0),
               0)) as amt
      from public.invoices i
      where i.school_id = p_school and i.status <> 'void' and i.deleted_at is null
      group by i.student_id
    )
    select g.id, null::uuid, (array_agg(k.sid order by k.sname))[1], g.full_name, g.phone,
           string_agg(k.sname, ', ' order by k.sname), (array_agg(k.cname order by k.sname))[1],
           coalesce(sum(o.amt), 0)
    from kids k
    join public.guardians g on g.id = k.gid and g.deleted_at is null
      and not g.sms_opt_out and nullif(trim(g.phone), '') is not null
    left join owed o on o.sid = k.sid
    where p_kind = 'all_parents'
       or (p_kind = 'class_parents' and k.cid = p_class)
       or (p_kind = 'fee_balance' and coalesce(o.amt, 0) > 0)
       or (p_kind = 'absent_today' and exists (
             select 1 from public.attendance a
             join public.enrollments e on e.id = a.enrollment_id
             where e.student_id = k.sid and a.date = p_date and a.status = 'absent'))
    group by g.id, g.full_name, g.phone;

  elsif p_kind in ('staff', 'teachers') then
    return query
    select null::uuid, st.id, null::uuid, st.full_name, st.phone, null::text, null::text, null::numeric
    from public.staff st
    where st.school_id = p_school and st.status = 'active' and st.deleted_at is null
      and nullif(trim(st.phone), '') is not null
      and (p_kind = 'staff' or st.type = 'teaching');
  else
    raise exception 'unknown audience %', p_kind;
  end if;
end $$;

-- ─── Claim queued messages for sending (service role only) ───────────────────
-- Atomic, so two overlapping send calls never send the same message twice. A
-- message stuck in "sending" for ten minutes is marked failed rather than resent:
-- we cannot know whether the provider already sent it.
create or replace function public.claim_messages(p_batch uuid, p_limit int)
returns setof public.messages
language plpgsql security definer set search_path = public as $$
begin
  update public.messages
     set status = 'failed', error = 'Interrupted while sending. Check delivery before resending.', updated_at = now()
   where status = 'sending' and claimed_at < now() - interval '10 minutes'
     and (p_batch is null or batch_id = p_batch);

  return query
  with picked as (
    select id from public.messages
    where status = 'queued' and (p_batch is null or batch_id = p_batch)
    order by created_at, id
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.messages m
       set status = 'sending', claimed_at = now(), attempts = m.attempts + 1, updated_at = now()
      from picked where m.id = picked.id
    returning m.*
  )
  select * from claimed;
end $$;

-- ─── Batch summaries for the screen (RLS applies) ────────────────────────────
create or replace function public.message_batch_stats(p_limit int default 50)
returns table (
  batch_id uuid, title text, kind text, audience text, sandbox boolean, created_at timestamptz,
  total bigint, queued bigint, sent bigint, delivered bigint, failed bigint
)
language sql stable security invoker set search_path = public as $$
  select b.id, b.title, b.kind, b.audience, b.sandbox, b.created_at,
         count(m.id),
         count(m.id) filter (where m.status in ('queued', 'sending')),
         count(m.id) filter (where m.status = 'sent'),
         count(m.id) filter (where m.status = 'delivered'),
         count(m.id) filter (where m.status in ('failed', 'cancelled'))
  from public.message_batches b
  left join public.messages m on m.batch_id = b.id
  group by b.id
  order by b.created_at desc
  limit greatest(least(p_limit, 200), 1)
$$;

revoke execute on function public.messaging_audience(uuid, text, uuid, date) from public, anon, authenticated;
revoke execute on function public.claim_messages(uuid, int) from public, anon, authenticated;
grant execute on function public.messaging_audience(uuid, text, uuid, date) to service_role;
grant execute on function public.claim_messages(uuid, int) to service_role;
revoke execute on function public.message_batch_stats(int) from public, anon;
grant execute on function public.message_batch_stats(int) to authenticated, service_role;

-- ─── Starter templates (editable; {placeholders} are filled in per recipient) ─
insert into public.message_templates (school_id, key, name, body, is_system)
select s.id, t.key, t.name, t.body, true
from public.schools s
cross join (values
  ('absence_alert', 'Absence alert',
   'Dear {parent}, {student} was marked absent from school on {date}. Please contact the school office if this is unexpected. - {school}'),
  ('fee_reminder', 'Fee reminder',
   'Dear {parent}, the outstanding school fees balance for {student} is {balance}. Kindly pay at the school office or by mobile money. Thank you. - {school}'),
  ('general_notice', 'General notice',
   'Dear {parent}, {school} wishes to inform you of an important notice. Please contact the school office for details.'),
  ('term_reopening', 'Term reopening',
   'Dear {parent}, {school} reopens for the new term soon. Please ensure {student} reports on time with all required items.'),
  ('exam_notice', 'Exam notice',
   'Dear {parent}, end of term examinations for {student} ({class}) are approaching. Please ensure your ward is prepared. - {school}'),
  ('meeting_invite', 'Parents meeting',
   'Dear {parent}, you are invited to a parents meeting at {school}. Your attendance is important. Thank you.'),
  ('staff_notice', 'Staff notice',
   'Dear {parent}, please note the staff notice from {school} management. Thank you.')
) as t(key, name, body)
on conflict (school_id, key) do nothing;
