-- Automatic SMS and email for the things the school already tells parents about in the app.
--
-- Four events notify parents without anyone sending anything: a payment is received, a pupil is marked
-- absent, report cards are published, and a notice is published for parents. Until now that reached only the
-- bell. A school can now also have each of them go out as an SMS and/or an email.
--
--  * Each event has its OWN switch for each channel, and every one starts OFF: SMS costs money, and a school
--    must choose it. A channel that is switched off for the whole school (Features) sends nothing either.
--  * Messages go to a pupil's guardians by their own phone number or email, whether or not they have a login,
--    and never to a guardian who has opted out of that channel.
--  * A guardian never gets the same message twice (a repeat of the same event is ignored), and a school has a
--    daily limit on automatic messages per channel, so a slip (a whole class marked absent by mistake) cannot
--    send hundreds of texts.
--  * Messages are only QUEUED here, in the same log manual sends use. A separate step actually sends them.

-- ── Switches ────────────────────────────────────────────────────────────────
alter table public.notification_settings
  add column sms_enabled boolean not null default false,
  add column email_enabled boolean not null default false;

-- Which events can reach a parent's phone or inbox (the others concern staff, or are only for the bell).
alter table public.notification_events add column can_message boolean not null default false;
update public.notification_events set can_message = true where key in ('notice_posted', 'payment_received', 'absence_marked', 'report_published');

create table public.auto_message_settings (
  school_id uuid primary key default public.current_school_id() references public.schools (id),
  daily_limit int not null default 300 check (daily_limit between 0 and 5000),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.auto_message_settings enable row level security;
create policy auto_message_settings_read on public.auto_message_settings for select to authenticated using (school_id = public.current_school_id());
create policy auto_message_settings_write on public.auto_message_settings for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('settings.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create trigger audit_row after insert or update or delete on public.auto_message_settings for each row execute function public.audit_row();

-- A repeat of the same event for the same guardian is the same message.
alter table public.messages add column dedupe_key text;
create unique index messages_dedupe on public.messages (school_id, guardian_id, kind, channel, dedupe_key) where dedupe_key is not null;

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- The same rules as the app's phone cleaning (src/lib/sms.ts normalizePhone): digits only, Ghana's 233 code.
create function public.normalize_phone(p_in text) returns text
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p_in, ''), '[\s\-().]', '', 'g');
begin
  if left(d, 1) = '+' then d := substr(d, 2); end if;
  if left(d, 2) = '00' then d := substr(d, 3); end if;
  if d !~ '^[0-9]+$' then return null; end if;
  if left(d, 3) = '233' then return case when length(d) = 12 then d end; end if;
  if left(d, 1) = '0' then return case when length(d) = 10 then '233' || substr(d, 2) end; end if;
  if length(d) = 9 then return '233' || d; end if;
  return case when length(d) between 11 and 15 then d end;
end $$;

create function public.normalize_email(p_in text) returns text
language sql immutable as $$
  select case when lower(btrim(coalesce(p_in, ''))) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and length(btrim(p_in)) <= 254 then lower(btrim(p_in)) end $$;

-- Is this event switched on for this channel? Off by default; also needs the event, its feature and the channel itself on.
create function public.notification_channel_on(p_school uuid, p_event text, p_channel text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.notification_enabled(p_school, p_event)
     and coalesce((select case p_channel when 'sms' then s.sms_enabled else s.email_enabled end
                     from public.notification_settings s where s.school_id = p_school and s.event = p_event), false)
     and coalesce(public.school_feature_enabled(p_school, p_channel), false)
     and coalesce(public.school_feature_enabled(p_school, 'messages'), false) $$;

-- Today's automatic batch for an event and channel: all that day's messages of one kind sit in one batch.
create function public._auto_batch(p_school uuid, p_event text, p_channel text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.message_batches
   where school_id = p_school and kind = 'auto_' || p_event and channel = p_channel and created_at::date = current_date limit 1;
  if v_id is null then
    insert into public.message_batches (school_id, title, kind, audience, body_template, created_by, channel)
    values (p_school, 'Automatic: ' || (select label from public.notification_events where key = p_event), 'auto_' || p_event, 'custom', '', null, p_channel)
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Queue a message to each guardian of the given guardians, on each channel the school has switched on for this event.
-- Returns how many were queued. Never raises: a problem here must not stop a payment or a register being saved.
create function public._queue_auto_messages(p_school uuid, p_event text, p_guardians uuid[], p_student uuid, p_title text, p_body text, p_key text) returns int
language plpgsql security definer set search_path = public as $$
declare
  ch text; v_name text; v_limit int; v_today int; v_batch uuid; v_added int := 0; v_total int := 0; v_text text; r record;
begin
  if p_guardians is null or cardinality(p_guardians) = 0 then return 0; end if;
  select name into v_name from public.schools where id = p_school;
  select coalesce((select daily_limit from public.auto_message_settings where school_id = p_school), 300) into v_limit;
  foreach ch in array array['sms', 'email'] loop
    continue when not public.notification_channel_on(p_school, p_event, ch);
    select count(*) into v_today from public.messages where school_id = p_school and channel = ch and kind like 'auto\_%' and created_at::date = current_date;
    continue when v_today >= v_limit;
    v_batch := public._auto_batch(p_school, p_event, ch);
    v_text := case when ch = 'sms' then left(coalesce(v_name, 'School') || ': ' || p_title || '. ' || coalesce(p_body, ''), 459) else coalesce(p_body, '') end;
    for r in
      select g.id, g.full_name, public.normalize_phone(g.phone) phone, public.normalize_email(g.email) email
        from public.guardians g
       where g.id = any (p_guardians) and g.school_id = p_school and g.deleted_at is null
         and case ch when 'sms' then not g.sms_opt_out else not g.email_opt_out end
    loop
      continue when (ch = 'sms' and r.phone is null) or (ch = 'email' and r.email is null);
      exit when v_today + v_added >= v_limit;
      insert into public.messages (school_id, batch_id, kind, recipient_name, channel, recipient_phone, recipient_email, subject, guardian_id, student_id, body, segments, dedupe_key)
      values (p_school, v_batch, 'auto_' || p_event, r.full_name, ch, case when ch = 'sms' then r.phone end, case when ch = 'email' then r.email end,
              case when ch = 'email' then left(p_title, 150) end, r.id, p_student, v_text, case when ch = 'sms' then greatest(1, ceil(length(v_text) / 153.0)::int) else 1 end, p_key)
      on conflict do nothing;
      get diagnostics v_added = row_count;
      v_total := v_total + v_added; v_today := v_today + v_added; v_added := 0;
    end loop;
  end loop;
  return v_total;
exception when others then
  raise warning 'automatic message not queued: %', sqlerrm;
  return v_total;
end $$;

-- A student-centred event: the bell for guardians with a login, and the channels for every guardian with a number.
create function public.notify_student_parents(p_school uuid, p_event text, p_student uuid, p_title text, p_body text, p_link text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_profiles(p_school, p_event, public.student_parent_profiles(p_student), p_title, p_body, p_link);
  perform public._queue_auto_messages(p_school, p_event,
    (select coalesce(array_agg(sg.guardian_id), '{}') from public.student_guardians sg where sg.student_id = p_student), p_student, p_title, p_body, p_key);
end $$;

-- ── The events now use it ───────────────────────────────────────────────────
create or replace function public.trg_notify_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare sid uuid; sname text;
begin
  if new.voided_at is not null then return new; end if;
  select i.student_id, s.first_name into sid, sname
    from public.invoices i join public.students s on s.id = i.student_id where i.id = new.invoice_id;
  if sid is null then return new; end if;
  perform public.notify_student_parents(
    new.school_id, 'payment_received', sid, 'Payment received',
    format('GHS %s received for %s. Receipt %s.', to_char(new.amount, 'FM999,999,990.00'), sname, coalesce(new.receipt_no, '')), '/fees', new.id::text);
  return new;
exception when others then
  raise warning 'payment notification failed: %', sqlerrm;
  return new;
end $$;

create or replace function public.trg_notify_absence() returns trigger
language plpgsql security definer set search_path = public as $$
declare sid uuid; sname text;
begin
  if new.status <> 'absent' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'absent' then return new; end if;
  -- fixing an old register is not news
  if new.date < current_date - 2 then return new; end if;
  select e.student_id, s.first_name into sid, sname
    from public.enrollments e join public.students s on s.id = e.student_id where e.id = new.enrollment_id;
  if sid is null then return new; end if;
  perform public.notify_student_parents(
    new.school_id, 'absence_marked', sid, 'Marked absent',
    format('%s was marked absent on %s.', sname, to_char(new.date, 'Dy DD Mon')), '/', new.enrollment_id::text || ':' || new.date::text);
  return new;
exception when others then
  raise warning 'absence notification failed: %', sqlerrm;
  return new;
end $$;

create or replace function public.trg_notify_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare sch uuid; r record;
begin
  if not new.is_published then return new; end if;
  if tg_op = 'UPDATE' and old.is_published then return new; end if;
  select c.school_id into sch from public.classes c where c.id = new.class_id;
  for r in
    select e.student_id, s.first_name
      from public.enrollments e join public.students s on s.id = e.student_id and s.status = 'active'
     where e.class_id = new.class_id
  loop
    perform public.notify_student_parents(
      sch, 'report_published', r.student_id, 'Report card ready',
      format('%s''s term report is ready to view.', r.first_name), '/grades', new.class_id::text || ':' || new.term_id::text || ':' || r.student_id::text);
  end loop;
  return new;
exception when others then
  raise warning 'report notification failed: %', sqlerrm;
  return new;
end $$;

-- A notice for parents (or everyone, or one class) also goes to parents' phones and inboxes, once each.
create or replace function public.trg_notify_notice() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[]; gids uuid[];
begin
  if new.published_at is null or new.published_at > now() then return new; end if;
  -- an edit to a notice that was already out is not a new notice
  if tg_op = 'UPDATE' and old.published_at is not null and old.published_at <= now() then return new; end if;

  if new.audience = 'all' then
    select array_agg(p.id) into ids from public.profiles p where p.school_id = new.school_id and p.is_active;
  elsif new.audience = 'staff' then
    select array_agg(distinct ur.profile_id) into ids from public.user_roles ur
     where ur.school_id = new.school_id
       and ur.role in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist');
  elsif new.audience = 'parents' then
    select array_agg(distinct ur.profile_id) into ids from public.user_roles ur
     where ur.school_id = new.school_id and ur.role = 'parent';
  else
    select array_agg(distinct g.profile_id) into ids
      from public.enrollments e
      join public.students s on s.id = e.student_id and s.status = 'active'
      join public.student_guardians sg on sg.student_id = e.student_id
      join public.guardians g on g.id = sg.guardian_id and g.profile_id is not null and g.deleted_at is null
     where e.class_id = new.class_id;
  end if;
  ids := array_remove(ids, new.posted_by);
  perform public.notify_profiles(new.school_id, 'notice_posted', ids, 'New notice: ' || new.title, new.body, '/notices');

  if new.audience in ('all', 'parents') then
    select coalesce(array_agg(distinct sg.guardian_id), '{}') into gids from public.student_guardians sg
      join public.students s on s.id = sg.student_id and s.status = 'active' where s.school_id = new.school_id;
  elsif new.audience <> 'staff' then
    select coalesce(array_agg(distinct sg.guardian_id), '{}') into gids from public.enrollments e
      join public.students s on s.id = e.student_id and s.status = 'active'
      join public.student_guardians sg on sg.student_id = e.student_id where e.class_id = new.class_id;
  end if;
  if gids is not null then
    perform public._queue_auto_messages(new.school_id, 'notice_posted', gids, null, 'New notice: ' || new.title, 'Open the app to read it.', new.id::text);
  end if;
  return new;
exception when others then
  raise warning 'notice notification failed: %', sqlerrm;
  return new;
end $$;

-- ── Settings the screens read and write ─────────────────────────────────────
-- Internal only: the database calls these; the browser never can.
revoke execute on function public.notification_channel_on(uuid, text, text) from public, anon, authenticated;
revoke execute on function public._auto_batch(uuid, text, text) from public, anon, authenticated;
revoke execute on function public._queue_auto_messages(uuid, text, uuid[], uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_student_parents(uuid, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.normalize_phone(text) from public, anon;
revoke execute on function public.normalize_email(text) from public, anon;
grant execute on function public.normalize_phone(text) to authenticated;
grant execute on function public.normalize_email(text) to authenticated;
