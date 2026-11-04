-- Email beside SMS: the same audiences, templates, log and retries, a second way to reach people.
--
-- A message now has a channel ('sms' or 'email'). An email message is addressed to an email
-- address instead of a phone number. A batch is one send on one channel, so sending both ways is
-- two batches. Parents can opt out of each channel separately. A school switches each channel on
-- or off in Features, and either can be off while Messages stays on.

-- ── Channel, address and subject ─────────────────────────────────────────────
alter table public.message_batches
  add column channel text not null default 'sms' check (channel in ('sms', 'email')),
  add column subject text;

alter table public.messages
  add column channel text not null default 'sms' check (channel in ('sms', 'email')),
  add column recipient_email text,
  add column subject text;

alter table public.messages alter column recipient_phone drop not null;
alter table public.messages
  add constraint messages_has_address check (
    (channel = 'sms' and recipient_phone is not null)
    or (channel = 'email' and recipient_email is not null)
  );

alter table public.guardians add column if not exists email_opt_out boolean not null default false;

-- ── Who gets a message, by phone or by email (service role only) ─────────────
drop function public.messaging_audience(uuid, text, uuid, date);
create function public.messaging_audience(
  p_school uuid, p_kind text, p_class uuid default null, p_date date default current_date,
  p_channel text default 'sms'
) returns table (
  guardian_id uuid, staff_id uuid, student_id uuid, recipient_name text, phone text, email text,
  student_names text, class_name text, balance numeric
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if p_channel not in ('sms', 'email') then raise exception 'unknown channel %', p_channel; end if;

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
    select g.id, null::uuid, (array_agg(k.sid order by k.sname))[1], g.full_name, g.phone, g.email,
           string_agg(k.sname, ', ' order by k.sname), (array_agg(k.cname order by k.sname))[1],
           coalesce(sum(o.amt), 0)
    from kids k
    join public.guardians g on g.id = k.gid and g.deleted_at is null
      and ((p_channel = 'sms' and not g.sms_opt_out and nullif(trim(g.phone), '') is not null)
        or (p_channel = 'email' and not g.email_opt_out and nullif(trim(g.email), '') is not null))
    left join owed o on o.sid = k.sid
    where p_kind = 'all_parents'
       or (p_kind = 'class_parents' and k.cid = p_class)
       or (p_kind = 'fee_balance' and coalesce(o.amt, 0) > 0)
       or (p_kind = 'absent_today' and exists (
             select 1 from public.attendance a
             join public.enrollments e on e.id = a.enrollment_id
             where e.student_id = k.sid and a.date = p_date and a.status = 'absent'))
    group by g.id, g.full_name, g.phone, g.email;

  elsif p_kind in ('staff', 'teachers') then
    return query
    select null::uuid, st.id, null::uuid, st.full_name, st.phone, st.email, null::text, null::text, null::numeric
    from public.staff st
    where st.school_id = p_school and st.status = 'active' and st.deleted_at is null
      and ((p_channel = 'sms' and nullif(trim(st.phone), '') is not null)
        or (p_channel = 'email' and nullif(trim(st.email), '') is not null))
      and (p_kind = 'staff' or st.type = 'teaching');
  else
    raise exception 'unknown audience %', p_kind;
  end if;
end $$;
revoke execute on function public.messaging_audience(uuid, text, uuid, date, text) from public, anon, authenticated;
grant execute on function public.messaging_audience(uuid, text, uuid, date, text) to service_role;

-- ── Batch summaries now say which channel each was ───────────────────────────
drop function public.message_batch_stats(int);
create function public.message_batch_stats(p_limit int default 50)
returns table (
  batch_id uuid, title text, kind text, audience text, sandbox boolean, created_at timestamptz,
  total bigint, queued bigint, sent bigint, delivered bigint, failed bigint, channel text
)
language sql stable security invoker set search_path = public as $$
  select b.id, b.title, b.kind, b.audience, b.sandbox, b.created_at,
         count(m.id),
         count(m.id) filter (where m.status in ('queued', 'sending')),
         count(m.id) filter (where m.status = 'sent'),
         count(m.id) filter (where m.status = 'delivered'),
         count(m.id) filter (where m.status in ('failed', 'cancelled')),
         b.channel
  from public.message_batches b
  left join public.messages m on m.batch_id = b.id
  group by b.id
  order by b.created_at desc
  limit greatest(least(p_limit, 200), 1)
$$;
revoke execute on function public.message_batch_stats(int) from public, anon;
grant execute on function public.message_batch_stats(int) to authenticated, service_role;

-- ── Feature switches: Messages is the module; SMS and email are ways of sending ──
update public.app_features
   set label = 'Messages',
       description = 'Send messages to parents and staff. Choose below which ways to send.',
       kind = 'module'
 where key = 'messages';

insert into public.app_features (key, label, description, kind, requires, sort) values
  ('sms', 'Text messages (SMS)', 'Send SMS to parents and staff, including absence alerts and fee reminders. Costs SMS credit.', 'channel', '{messages}', 81),
  ('email', 'Email', 'Send email to parents and staff from PhiNova. Replies go to the school''s own email address. Free to send.', 'channel', '{messages}', 82);
