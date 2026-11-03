-- Access by module and action.
--
-- Today a person's access comes from a fixed role. This adds the model that replaces
-- it: a catalogue of every module and the actions inside it (see, create, edit, delete,
-- approve, download ...), and a grant per person per action. A developer holds every
-- action by default. Everyone else holds only what has been switched on for them.
--
-- This migration adds the model and fills it from today's roles, so the new answer
-- matches the old one for every existing person. It does NOT change any existing rule:
-- the current role-based policies keep working until each is moved over and proven equal.
--
-- Parents and students are portal accounts and keep their fixed access; this is for staff.

-- ── The catalogue: every module and the actions inside it ───────────────────
create table public.access_capabilities (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module text not null,
  action text not null,
  label text not null,        -- plain words, shown on the Access screen
  description text not null,
  sensitive boolean not null default false,
  sort int not null default 0
);

insert into public.access_capabilities (key, module, action, label, description, sensitive, sort)
select t.k, split_part(t.k, '.', 1), split_part(t.k, '.', 2), t.l, t.d, t.s, (row_number() over ())::int
from (values
  ('students.view', 'See all students', 'Open the student list and any student''s profile, parents and class.', false),
  ('students.view_own_classes', 'See students in their own classes', 'See only the students in classes they teach.', false),
  ('students.create', 'Admit students', 'Add new students and parents, and import lists.', false),
  ('students.edit', 'Edit students and parents', 'Change details, move a student to another class, manage parents.', false),
  ('students.delete', 'Remove students', 'Delete or archive a student.', true),
  ('students.download', 'Download student lists', 'Export student data as a file.', false),

  ('attendance.view', 'See attendance for every class', 'View registers and attendance figures for all classes.', false),
  ('attendance.take_own_classes', 'Take attendance for their own classes', 'Mark the register for classes they teach.', false),
  ('attendance.take_any', 'Take attendance for any class', 'Mark the register for any class, for example when covering.', false),
  ('attendance.download', 'Download attendance', 'Export attendance as a file.', false),

  ('grades.view', 'See grades', 'View marks, results and report cards.', false),
  ('grades.enter_own_classes', 'Enter marks for their own classes', 'Add assessments and scores for classes and subjects they teach.', false),
  ('grades.enter_any', 'Enter marks for any class', 'Add assessments and scores for any class.', false),
  ('grades.publish', 'Approve and publish results', 'Release report cards and results.', false),
  ('grades.download', 'Download grades and report cards', 'Export results and report cards.', false),

  ('fees.view', 'See fees, invoices and receipts', 'View billing, payments and balances.', false),
  ('fees.bill', 'Bill students', 'Create invoices and bill whole classes.', false),
  ('fees.record_payment', 'Record payments', 'Take a payment and issue a receipt.', false),
  ('fees.cancel_receipt', 'Cancel a receipt', 'Cancel an issued receipt, with a reason.', true),
  ('fees.configure', 'Set up fees and discounts', 'Change fee amounts, discounts and instalment plans.', false),
  ('fees.review_online', 'Review online payments', 'See online payments, handle the ones needing attention, and check against the payment provider.', false),
  ('fees.download', 'Download fees and receipts', 'Export billing and payment records.', false),

  ('expenses.view', 'See expenses', 'View the school''s expenses.', false),
  ('expenses.create', 'Record expenses', 'Add an expense for approval.', false),
  ('expenses.approve', 'Approve expenses', 'Approve or reject expenses.', false),
  ('expenses.delete', 'Delete expenses', 'Remove an expense record.', true),
  ('expenses.download', 'Download expenses', 'Export expense records.', false),

  ('analytics.view_finance', 'See finance analytics', 'Collections, outstanding fees and payment methods.', false),
  ('analytics.view_academic', 'See academic analytics', 'Attendance and grade summaries.', false),
  ('analytics.view_staff', 'See staff analytics', 'Staff numbers and teaching load.', false),
  ('analytics.download', 'Download analytics reports', 'Export reports and charts.', false),

  ('staff.view', 'See the staff directory', 'View staff records.', false),
  ('staff.create', 'Add staff', 'Add a new staff member.', false),
  ('staff.edit', 'Edit staff', 'Change staff details.', false),
  ('staff.delete', 'Remove staff', 'Delete or archive a staff record.', true),
  ('staff.download', 'Download staff lists', 'Export staff data.', false),

  ('messages.view_log', 'See sent messages', 'View the history of SMS sent by the school.', false),
  ('messages.send_all', 'Send messages to anyone', 'Send SMS to any group of parents or staff.', false),
  ('messages.send_fee_reminders', 'Send fee reminders only', 'Send reminders to parents who owe fees.', false),
  ('messages.manage_templates', 'Manage message templates', 'Create and edit standard wording.', false),
  ('messages.manage_setup', 'Manage messaging setup', 'Change the sender name and send tests.', false),
  ('messages.download', 'Download message history', 'Export the message log.', false),

  ('notices.post', 'Post notices to everyone', 'Post to all, staff or parents.', false),
  ('notices.post_class', 'Post notices to their own classes', 'Post to classes they teach.', false),
  ('notices.manage', 'Edit or remove any notice', 'Change or delete notices posted by others.', false),

  ('timetable.view', 'See timetables', 'View class and teacher timetables.', false),
  ('timetable.edit', 'Edit timetables', 'Change timetable slots.', false),
  ('timetable.download', 'Download timetables', 'Export timetables.', false),

  ('users.view', 'See logins', 'View the list of people who can sign in.', false),
  ('users.create', 'Create logins', 'Add a new person who can sign in.', true),
  ('users.edit', 'Edit logins', 'Change a person''s details and roles.', true),
  ('users.reset_password', 'Reset passwords', 'Set a temporary password for someone.', true),
  ('users.delete', 'Delete logins', 'Remove a login.', true),

  ('settings.view', 'See school settings', 'View the school, year, class and fee settings.', false),
  ('settings.edit', 'Change school settings', 'Edit school details, years, classes and subjects.', true),

  ('access.manage', 'Decide who can do what', 'Change other people''s access. Only give this to someone you trust fully.', true),
  ('audit.view', 'See the audit trail', 'See who changed what, and when.', true)
) as t(k, l, d, s);

alter table public.access_capabilities enable row level security;
create policy access_capabilities_read on public.access_capabilities for select to authenticated using (true);

-- ── Presets: what each familiar job starts with ─────────────────────────────
-- Used to fill someone's access when they are given a job, and by the Access screen's
-- "start from" choice. They mirror what each role can do today. They are only a starting
-- point: what a person actually holds is stored per person, below.
create table public.access_preset_capabilities (
  role public.app_role not null,
  capability text not null references public.access_capabilities (key) on delete cascade,
  primary key (role, capability)
);
alter table public.access_preset_capabilities enable row level security;
create policy access_presets_read on public.access_preset_capabilities for select to authenticated using (true);

insert into public.access_preset_capabilities (role, capability)
select 'school_admin', key from public.access_capabilities;

insert into public.access_preset_capabilities (role, capability)
select v.r::public.app_role, c from (values
  ('principal', array['students.view','students.download','attendance.view','attendance.download','grades.view','grades.publish','grades.download',
     'expenses.view','expenses.create','expenses.approve','expenses.download','analytics.view_finance','analytics.view_academic','analytics.view_staff','analytics.download',
     'staff.view','staff.download','messages.view_log','messages.send_all','messages.manage_templates','messages.manage_setup',
     'notices.post','notices.manage','timetable.view','timetable.edit','timetable.download']),
  ('teacher', array['students.view_own_classes','attendance.take_own_classes','grades.view','grades.enter_own_classes','notices.post_class','timetable.view','timetable.edit']),
  ('accountant', array['students.view','fees.view','fees.bill','fees.record_payment','fees.cancel_receipt','fees.configure','fees.review_online','fees.download',
     'expenses.view','expenses.create','expenses.delete','expenses.download','analytics.view_finance','analytics.download','staff.view',
     'messages.view_log','messages.send_fee_reminders']),
  ('hr_officer', array['staff.view','staff.create','staff.edit','staff.delete','staff.download','analytics.view_staff','analytics.download']),
  ('receptionist', array['students.view','students.create','students.edit','students.download','grades.view','staff.view']),
  ('librarian', array['staff.view'])
) as v(r, caps), unnest(v.caps) as c;

-- ── What each person actually holds ─────────────────────────────────────────
create table public.user_capabilities (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  capability text not null references public.access_capabilities (key) on delete cascade,
  school_id uuid not null references public.schools (id),
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  -- Optional end date, for cover ("deputy head, for two weeks"). Null means no end.
  expires_at timestamptz,
  primary key (profile_id, capability)
);
create index on public.user_capabilities (school_id);
alter table public.user_capabilities enable row level security;

-- ── The checks ──────────────────────────────────────────────────────────────
-- Does the signed-in person hold this action? A developer holds every one.
create function public.has_capability(p_cap text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_developer() or exists (
    select 1 from public.user_capabilities uc
    where uc.profile_id = auth.uid() and uc.capability = p_cap
      and (uc.expires_at is null or uc.expires_at > now())
  )
$$;

-- Everything the signed-in person holds, for the app to decide what to show.
create function public.my_capabilities() returns text[]
language sql stable security definer set search_path = public as $$
  select case when public.is_developer()
    then (select coalesce(array_agg(key order by sort), '{}') from public.access_capabilities)
    else (select coalesce(array_agg(capability order by capability), '{}') from public.user_capabilities
          where profile_id = auth.uid() and (expires_at is null or expires_at > now()))
  end
$$;

-- A person can read their own grants; people who manage access can read everyone's in the school.
-- Nobody writes this table directly: changes go through set_user_capabilities below.
create policy user_capabilities_read on public.user_capabilities for select to authenticated
  using (school_id = public.current_school_id()
         and (profile_id = auth.uid() or public.has_capability('access.manage')));

-- Replace one person's access with exactly this list.
--   - the caller must be allowed to manage access;
--   - nobody can change their own access (a developer excepted);
--   - only a developer can change a developer's or super admin's access;
--   - the caller cannot give an action they do not hold themselves (a developer excepted);
--   - every change is written to the audit trail.
create function public.set_user_capabilities(p_user uuid, p_caps text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid := public.current_school_id();
  v_dev boolean := public.is_developer();
  v_after text[];
  v_before text[];
  k text;
begin
  if auth.uid() is null or not public.has_capability('access.manage') then
    raise exception 'You do not have permission to change access.' using errcode = '42501';
  end if;
  if p_user = auth.uid() and not v_dev then
    raise exception 'You cannot change your own access.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and school_id = v_school) then
    raise exception 'That person was not found.' using errcode = 'P0002';
  end if;
  if not v_dev and exists (select 1 from public.user_roles where profile_id = p_user and role in ('developer', 'super_admin')) then
    raise exception 'Only a developer can change this person''s access.' using errcode = '42501';
  end if;

  v_after := coalesce(array(select distinct x from unnest(coalesce(p_caps, '{}'::text[])) as x order by x), '{}');
  foreach k in array v_after loop
    if not exists (select 1 from public.access_capabilities where key = k) then
      raise exception 'Unknown permission: %', k using errcode = '22023';
    end if;
    if not v_dev and not public.has_capability(k) then
      raise exception 'You cannot give access you do not have yourself: %', k using errcode = '42501';
    end if;
  end loop;

  select coalesce(array_agg(capability order by capability), '{}') into v_before
    from public.user_capabilities where profile_id = p_user;

  delete from public.user_capabilities where profile_id = p_user and not (capability = any (v_after));
  insert into public.user_capabilities (profile_id, capability, school_id, granted_by)
    select p_user, c, v_school, auth.uid() from unnest(v_after) as c
    on conflict (profile_id, capability) do nothing;

  if v_before is distinct from v_after then
    insert into public.audit_log (school_id, actor_id, action, table_name, row_id, before, after)
    values (v_school, auth.uid(), 'ACCESS_CHANGE', 'user_capabilities', p_user, to_jsonb(v_before), to_jsonb(v_after));
  end if;
end $$;

revoke all on function public.has_capability(text) from public, anon;
revoke all on function public.my_capabilities() from public, anon;
revoke all on function public.set_user_capabilities(uuid, text[]) from public, anon;
grant execute on function public.has_capability(text) to authenticated;
grant execute on function public.my_capabilities() to authenticated;
grant execute on function public.set_user_capabilities(uuid, text[]) to authenticated;

-- ── Fill from today's roles, so nobody gains or loses anything ──────────────
-- A developer needs no rows (they hold everything). Parents and students are portal accounts.
insert into public.user_capabilities (profile_id, capability, school_id)
select distinct ur.profile_id, p.capability, ur.school_id
from public.user_roles ur
join public.access_preset_capabilities p on p.role = ur.role
on conflict (profile_id, capability) do nothing;
