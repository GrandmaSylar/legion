-- In-app notifications: a bell for staff and parents, filled automatically by things that happen.
--
-- Four events notify people without anyone sending anything: a notice is published, a payment is
-- received, a pupil is marked absent, and a class's report cards are published. Each event is a
-- switch per school, and an event of a feature that is switched off never notifies.
--
-- Notifications are written only by the database itself. A person can read their own and mark them
-- read; nobody can write, edit or read anyone else's. A failure to notify never blocks the thing
-- that caused it: a payment or an attendance register is always saved.
--
-- Not here yet: sending these automatically by SMS or email. That needs a scheduler to wake up and
-- send, which is a separate decision.

-- ── The events, and which feature each belongs to ───────────────────────────
create table public.notification_events (
  key text primary key,
  label text not null,
  description text not null,
  feature text references public.app_features (key),
  sort int not null default 0
);
alter table public.notification_events enable row level security;
create policy notification_events_read on public.notification_events for select to authenticated using (true);

insert into public.notification_events (key, label, description, feature, sort) values
  ('notice_posted', 'A notice is published', 'Tell the people a notice is for, as soon as it is published.', 'notices', 10),
  ('payment_received', 'A payment is received', 'Tell a pupil''s parents when a fee payment is recorded, with the receipt number.', 'fees', 20),
  ('absence_marked', 'A pupil is marked absent', 'Tell a pupil''s parents the same day. Corrections to old registers do not notify.', 'attendance', 30),
  ('report_published', 'Report cards are published', 'Tell the parents of a class when its report cards are ready.', 'grades', 40);

-- ── What each school has chosen (everything is on until switched off) ───────
create table public.notification_settings (
  school_id uuid not null default public.current_school_id() references public.schools (id),
  event text not null references public.notification_events (key) on delete cascade,
  enabled boolean not null,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (school_id, event)
);
alter table public.notification_settings enable row level security;
create policy notification_settings_read on public.notification_settings for select to authenticated
  using (school_id = public.current_school_id());
create policy notification_settings_insert on public.notification_settings for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create policy notification_settings_update on public.notification_settings for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('settings.edit'))
  with check (school_id = public.current_school_id() and public.has_capability('settings.edit'));
create trigger audit_row after insert or update or delete on public.notification_settings
  for each row execute function public.audit_row();

-- ── The notifications themselves ────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event text not null references public.notification_events (key) on delete cascade,
  title text not null,
  body text not null default '',
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index on public.notifications (profile_id, created_at desc);
create index on public.notifications (profile_id) where read_at is null;

alter table public.notifications enable row level security;
create policy notifications_read on public.notifications for select to authenticated
  using (profile_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
-- The only thing a person may change is whether they have read it.
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ── Internal helpers (never callable from the browser) ──────────────────────
create function public.notification_enabled(p_school uuid, p_event text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.enabled from public.notification_settings s where s.school_id = p_school and s.event = p_event), true)
     and coalesce(public.school_feature_enabled(p_school, (select e.feature from public.notification_events e where e.key = p_event)), true)
$$;

create function public.student_parent_profiles(p_student uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct g.profile_id), '{}')
  from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id
  where sg.student_id = p_student and g.profile_id is not null and g.deleted_at is null
$$;

create function public.notify_profiles(
  p_school uuid, p_event text, p_profiles uuid[], p_title text, p_body text, p_link text
) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_profiles is null or cardinality(p_profiles) = 0 then return 0; end if;
  if not public.notification_enabled(p_school, p_event) then return 0; end if;
  insert into public.notifications (school_id, profile_id, event, title, body, link)
  select p_school, p.id, p_event, left(p_title, 160), left(coalesce(p_body, ''), 400), p_link
  from public.profiles p
  where p.id = any (p_profiles) and p.school_id = p_school and p.is_active;
  get diagnostics n = row_count;
  return n;
end $$;

-- ── Event: a notice is published ────────────────────────────────────────────
create function public.trg_notify_notice() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
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
  return new;
exception when others then
  raise warning 'notice notification failed: %', sqlerrm;
  return new;
end $$;
create trigger announcements_notify after insert or update of published_at on public.announcements
  for each row execute function public.trg_notify_notice();

-- ── Event: a payment is received ────────────────────────────────────────────
create function public.trg_notify_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare sid uuid; sname text;
begin
  if new.voided_at is not null then return new; end if;
  select i.student_id, s.first_name into sid, sname
    from public.invoices i join public.students s on s.id = i.student_id where i.id = new.invoice_id;
  if sid is null then return new; end if;
  perform public.notify_profiles(
    new.school_id, 'payment_received', public.student_parent_profiles(sid), 'Payment received',
    format('GHS %s received for %s. Receipt %s.', to_char(new.amount, 'FM999,999,990.00'), sname, coalesce(new.receipt_no, '')),
    '/fees');
  return new;
exception when others then
  raise warning 'payment notification failed: %', sqlerrm;
  return new;
end $$;
create trigger payments_notify after insert on public.payments
  for each row execute function public.trg_notify_payment();

-- ── Event: a pupil is marked absent ─────────────────────────────────────────
create function public.trg_notify_absence() returns trigger
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
  perform public.notify_profiles(
    new.school_id, 'absence_marked', public.student_parent_profiles(sid), 'Marked absent',
    format('%s was marked absent on %s.', sname, to_char(new.date, 'Dy DD Mon')), '/');
  return new;
exception when others then
  raise warning 'absence notification failed: %', sqlerrm;
  return new;
end $$;
create trigger attendance_notify after insert or update of status on public.attendance
  for each row execute function public.trg_notify_absence();

-- ── Event: a class's report cards are published ─────────────────────────────
create function public.trg_notify_report() returns trigger
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
    perform public.notify_profiles(
      sch, 'report_published', public.student_parent_profiles(r.student_id), 'Report card ready',
      format('%s''s term report is ready to view.', r.first_name), '/grades');
  end loop;
  return new;
exception when others then
  raise warning 'report notification failed: %', sqlerrm;
  return new;
end $$;
create trigger reports_notify after insert or update of is_published on public.term_report_publications
  for each row execute function public.trg_notify_report();

-- Internal only: the database calls these; the browser never can.
revoke execute on function public.notification_enabled(uuid, text) from public, anon, authenticated;
revoke execute on function public.student_parent_profiles(uuid) from public, anon, authenticated;
revoke execute on function public.notify_profiles(uuid, text, uuid[], text, text, text) from public, anon, authenticated;
revoke execute on function public.trg_notify_notice() from public, anon, authenticated;
revoke execute on function public.trg_notify_payment() from public, anon, authenticated;
revoke execute on function public.trg_notify_absence() from public, anon, authenticated;
revoke execute on function public.trg_notify_report() from public, anon, authenticated;
