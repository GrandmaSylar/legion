-- Tasks and duty assignments: who is doing what, and when.
--
-- A task has a title, a kind (duty, invigilation, meeting or other), dates and optionally a time and
-- place, and one or more people. Each person marks their own part done. A rota is a recurring duty
-- (morning gate duty, say) that rotates a list of staff over chosen weekdays, daily or weekly, and is
-- turned into ordinary tasks; regenerating it never touches what is already done or in the past.
-- Staff see and complete their own tasks. The head, the principal and HR see everyone's. The head and
-- the principal assign. An invigilation task can point at an exam period.

-- ── Feature and actions ─────────────────────────────────────────────────────
insert into public.app_features (key, label, description, kind, requires, sort) values
  ('tasks', 'Tasks and duties', 'Assign duties, invigilation and meetings to staff, run rotas, and let staff tick off their own tasks.', 'module', '{}', 96);

insert into public.access_capabilities (key, module, action, label, description, sensitive, sort) values
  ('tasks.view_own', 'tasks', 'view_own', 'See and tick off their own tasks', 'See the tasks assigned to them and mark them done.', false, 1100),
  ('tasks.view_all', 'tasks', 'view_all', 'See everyone''s tasks', 'See every task and who is doing it.', false, 1110),
  ('tasks.assign', 'tasks', 'assign', 'Assign tasks and run rotas', 'Create, change and remove tasks and rotas, and choose who does them.', false, 1120),
  ('tasks.download', 'tasks', 'download', 'Download the task list', 'Download the list of tasks.', false, 1130)
on conflict (key) do nothing;

insert into public.access_preset_capabilities (role, capability)
  select r, 'tasks.view_own' from unnest(enum_range(null::public.app_role)) as r
  where r in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
  on conflict do nothing;
insert into public.access_preset_capabilities (role, capability) values
  ('school_admin', 'tasks.view_all'), ('principal', 'tasks.view_all'), ('hr_officer', 'tasks.view_all'),
  ('school_admin', 'tasks.assign'), ('principal', 'tasks.assign'),
  ('school_admin', 'tasks.download'), ('principal', 'tasks.download'), ('hr_officer', 'tasks.download')
  on conflict do nothing;
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, p.capability, ur.school_id
  from public.user_roles ur
  join public.access_preset_capabilities p on p.role::text = ur.role::text and p.capability like 'tasks.%'
  on conflict (profile_id, capability) do nothing;

insert into public.notification_events (key, label, description, feature, sort) values
  ('task_assigned', 'A task is assigned to you', 'Tell a member of staff when a task or a run of rota duties is given to them.', 'tasks', 60);

-- ── Rotas, tasks and who does them ──────────────────────────────────────────
create table public.task_rotas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text check (description is null or length(description) <= 500),
  kind text not null default 'duty' check (kind in ('duty', 'invigilation', 'meeting', 'other')),
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 5 and weekdays <@ array[1, 2, 3, 4, 5]::smallint[]),
  starts_at time,
  ends_at time,
  location text check (location is null or length(location) <= 80),
  rotation text not null default 'weekly' check (rotation in ('daily', 'weekly')),
  per_slot int not null default 1 check (per_slot between 1 and 5),
  starts_on date not null,
  ends_on date not null,
  people uuid[] not null check (cardinality(people) between 1 and 50),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on <= starts_on + 365),
  check (ends_at is null or starts_at is not null),
  check (per_slot <= cardinality(people))
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text check (description is null or length(description) <= 500),
  kind text not null default 'duty' check (kind in ('duty', 'invigilation', 'meeting', 'other')),
  starts_on date not null,
  ends_on date not null,
  starts_at time,
  ends_at time,
  location text check (location is null or length(location) <= 80),
  exam_period_id uuid references public.exam_periods (id) on delete set null,
  rota_id uuid references public.task_rotas (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on <= starts_on + 120),
  check (ends_at is null or starts_at is not null)
);
create index on public.tasks (school_id, starts_on);
create index on public.tasks (rota_id) where rota_id is not null;

create table public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid not null default public.current_school_id() references public.schools (id),
  status text not null default 'todo' check (status in ('todo', 'done')),
  done_at timestamptz,
  note text check (note is null or length(note) <= 200),
  primary key (task_id, profile_id)
);
create index on public.task_assignees (profile_id, status);

create trigger set_updated_at before update on public.task_rotas for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.task_rotas for each row execute function public.audit_row();
create trigger audit_row after insert or update or delete on public.tasks for each row execute function public.audit_row();

-- Only current staff can be given a task, and only in their own school.
create function public.task_assignee_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.profiles p join public.user_roles ur on ur.profile_id = p.id
     where p.id = new.profile_id and p.school_id = new.school_id and p.is_active
       and ur.role in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
  ) then
    raise exception 'Tasks can only be given to active staff.' using errcode = 'TSK01';
  end if;
  return new;
end $$;
create trigger task_assignee_check before insert on public.task_assignees
  for each row execute function public.task_assignee_check();

-- Marking done stamps the time; marking not done clears it.
create function public.task_assignee_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.done_at := case when new.status = 'done' then coalesce(old.done_at, now()) else null end;
  return new;
end $$;
create trigger task_assignee_stamp before update on public.task_assignees
  for each row execute function public.task_assignee_stamp();

-- A person given a single task is told. A rota's duties are summarised once instead (see generate_rota_tasks).
create function public.task_assignee_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select title, starts_on, ends_on, starts_at, location, rota_id into t from public.tasks where id = new.task_id;
  if t.rota_id is null then
    perform public.notify_profiles(new.school_id, 'task_assigned', array[new.profile_id], 'New task: ' || t.title,
      to_char(t.starts_on, 'Dy DD Mon') || case when t.ends_on > t.starts_on then ' to ' || to_char(t.ends_on, 'Dy DD Mon') else '' end
      || case when t.starts_at is not null then ', ' || to_char(t.starts_at, 'HH24:MI') else '' end
      || case when t.location is not null then ' at ' || t.location else '' end, '/tasks');
  end if;
  return new;
exception when others then
  raise warning 'task notification failed: %', sqlerrm;
  return new;
end $$;
create trigger task_assignee_notify after insert on public.task_assignees
  for each row execute function public.task_assignee_notify();

-- ── Who can see and change what ─────────────────────────────────────────────
alter table public.task_rotas enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;

create policy tasks_read on public.tasks for select to authenticated
  using (school_id = public.current_school_id() and public.feature_enabled('tasks') and (
    public.has_capability('tasks.view_all') or public.has_capability('tasks.assign')
    or exists (select 1 from public.task_assignees a where a.task_id = tasks.id and a.profile_id = auth.uid())));
-- Tasks are made and changed through save_task, and only removed here.
create policy tasks_delete on public.tasks for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('tasks.assign'));

create policy task_assignees_read on public.task_assignees for select to authenticated
  using (school_id = public.current_school_id() and public.feature_enabled('tasks') and (
    profile_id = auth.uid() or public.has_capability('tasks.view_all') or public.has_capability('tasks.assign')));
-- A person ticks their own part; whoever assigns may tick for anyone. Nothing else about the row can change.
create policy task_assignees_update on public.task_assignees for update to authenticated
  using (school_id = public.current_school_id() and public.feature_enabled('tasks')
         and (profile_id = auth.uid() or public.has_capability('tasks.assign')))
  with check (school_id = public.current_school_id() and (profile_id = auth.uid() or public.has_capability('tasks.assign')));
revoke update on public.task_assignees from authenticated;
grant update (status, note) on public.task_assignees to authenticated;

create policy task_rotas_read on public.task_rotas for select to authenticated
  using (school_id = public.current_school_id() and (public.has_capability('tasks.view_all') or public.has_capability('tasks.assign')));

-- ── Who can be given a task ─────────────────────────────────────────────────
create function public.assignable_staff() returns table (id uuid, full_name text, job text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_capability('tasks.assign') or public.has_capability('tasks.view_all')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select p.id, p.full_name, coalesce(min(ur.role::text), '')
    from public.profiles p join public.user_roles ur on ur.profile_id = p.id
   where p.school_id = public.current_school_id() and p.is_active
     and ur.role in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
   group by p.id, p.full_name order by p.full_name;
end $$;

-- ── Saving a task and its people together ───────────────────────────────────
create function public.save_task(
  p_id uuid, p_title text, p_description text, p_kind text, p_starts_on date, p_ends_on date,
  p_starts_at time, p_ends_at time, p_location text, p_exam_period uuid, p_people uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_school uuid := public.current_school_id(); v_id uuid;
begin
  if not public.has_capability('tasks.assign') then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'Give the task a title.' using errcode = 'TSK01'; end if;
  if p_people is null or cardinality(p_people) not between 1 and 30 then raise exception 'Choose between 1 and 30 people.' using errcode = 'TSK01'; end if;
  if p_exam_period is not null and not exists (select 1 from public.exam_periods where id = p_exam_period and school_id = v_school) then
    raise exception 'That exam period was not found.' using errcode = 'TSK01';
  end if;

  if p_id is null then
    insert into public.tasks (school_id, title, description, kind, starts_on, ends_on, starts_at, ends_at, location, exam_period_id)
    values (v_school, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_kind, p_starts_on, p_ends_on, p_starts_at, p_ends_at,
            nullif(btrim(coalesce(p_location, '')), ''), p_exam_period) returning id into v_id;
  else
    update public.tasks set title = btrim(p_title), description = nullif(btrim(coalesce(p_description, '')), ''), kind = p_kind,
           starts_on = p_starts_on, ends_on = p_ends_on, starts_at = p_starts_at, ends_at = p_ends_at,
           location = nullif(btrim(coalesce(p_location, '')), ''), exam_period_id = p_exam_period
     where id = p_id and school_id = v_school returning id into v_id;
    if v_id is null then raise exception 'That task was not found.' using errcode = 'TSK01'; end if;
    delete from public.task_assignees where task_id = v_id and profile_id <> all (p_people);
  end if;

  insert into public.task_assignees (task_id, profile_id, school_id)
  select v_id, p, v_school from (select distinct unnest(p_people) as p) x
  on conflict (task_id, profile_id) do nothing;
  return v_id;
end $$;

-- ── Rotas ───────────────────────────────────────────────────────────────────
create function public.save_task_rota(
  p_id uuid, p_title text, p_description text, p_kind text, p_weekdays int[], p_starts_at time, p_ends_at time, p_location text,
  p_rotation text, p_per_slot int, p_starts_on date, p_ends_on date, p_people uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_school uuid := public.current_school_id(); v_id uuid; v_days smallint[];
begin
  if not public.has_capability('tasks.assign') then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'Give the rota a title.' using errcode = 'TSK01'; end if;
  if p_people is null or cardinality(p_people) < 1 then raise exception 'Choose the people who take turns.' using errcode = 'TSK01'; end if;
  if p_per_slot > cardinality(p_people) then raise exception 'You cannot put more people on a day than are in the rota.' using errcode = 'TSK01'; end if;
  v_days := array(select distinct d::smallint from unnest(p_weekdays) d order by 1);

  if p_id is null then
    insert into public.task_rotas (school_id, title, description, kind, weekdays, starts_at, ends_at, location, rotation, per_slot, starts_on, ends_on, people)
    values (v_school, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_kind, v_days, p_starts_at, p_ends_at,
            nullif(btrim(coalesce(p_location, '')), ''), p_rotation, p_per_slot, p_starts_on, p_ends_on, p_people) returning id into v_id;
  else
    update public.task_rotas set title = btrim(p_title), description = nullif(btrim(coalesce(p_description, '')), ''), kind = p_kind, weekdays = v_days,
           starts_at = p_starts_at, ends_at = p_ends_at, location = nullif(btrim(coalesce(p_location, '')), ''), rotation = p_rotation,
           per_slot = p_per_slot, starts_on = p_starts_on, ends_on = p_ends_on, people = p_people
     where id = p_id and school_id = v_school returning id into v_id;
    if v_id is null then raise exception 'That rota was not found.' using errcode = 'TSK01'; end if;
  end if;
  return v_id;
end $$;

-- Turn a rota into tasks from today on. Past days and anything already ticked off are kept; the rest is
-- laid out again, so changing the people or the weekdays and generating again is safe. People take turns
-- in order: daily moves to the next person (or group) each day, weekly each week. Returns how many tasks were made.
create function public.generate_rota_tasks(p_rota uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid := public.current_school_id();
  r public.task_rotas;
  n int; d date; slot int := 0; wk date; last_wk date; wk_idx int := -1;
  chosen uuid[]; v_task uuid; v_made int := 0; p uuid; v_counts jsonb := '{}'::jsonb;
begin
  if not public.has_capability('tasks.assign') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.task_rotas where id = p_rota and school_id = v_school;
  if not found then raise exception 'That rota was not found.' using errcode = 'TSK01'; end if;
  n := cardinality(r.people);
  foreach p in array r.people loop
    if not exists (
      select 1 from public.profiles pr join public.user_roles ur on ur.profile_id = pr.id
       where pr.id = p and pr.school_id = v_school and pr.is_active
         and ur.role in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
    ) then
      raise exception 'Someone in this rota is no longer active staff. Change the rota first.' using errcode = 'TSK01';
    end if;
  end loop;

  delete from public.tasks t where t.rota_id = p_rota and t.starts_on >= current_date
     and not exists (select 1 from public.task_assignees a where a.task_id = t.id and a.status = 'done');

  for d in select g::date from generate_series(r.starts_on, r.ends_on, interval '1 day') g loop
    continue when extract(isodow from d)::int <> all (r.weekdays);
    if r.rotation = 'weekly' then
      wk := date_trunc('week', d)::date;
      if last_wk is distinct from wk then wk_idx := wk_idx + 1; last_wk := wk; end if;
      slot := wk_idx;
    end if;
    chosen := array(select r.people[((slot * r.per_slot + gs.i) % n) + 1] from generate_series(0, r.per_slot - 1) as gs(i));
    if r.rotation = 'daily' then slot := slot + 1; end if;

    continue when d < current_date or exists (select 1 from public.tasks where rota_id = p_rota and starts_on = d);
    insert into public.tasks (school_id, title, description, kind, starts_on, ends_on, starts_at, ends_at, location, rota_id)
    values (v_school, r.title, r.description, r.kind, d, d, r.starts_at, r.ends_at, r.location, p_rota) returning id into v_task;
    insert into public.task_assignees (task_id, profile_id, school_id) select v_task, x, v_school from unnest(chosen) x;
    v_made := v_made + 1;
    foreach p in array chosen loop
      v_counts := jsonb_set(v_counts, array[p::text], to_jsonb(coalesce((v_counts->>p::text)::int, 0) + 1));
    end loop;
  end loop;

  -- One note to each person instead of one for every day.
  for p in select key::uuid from jsonb_each(v_counts) loop
    perform public.notify_profiles(v_school, 'task_assigned', array[p],
      'New rota duties: ' || r.title,
      format('You have %s new %s from %s.', (v_counts->>p::text)::int, case when (v_counts->>p::text)::int = 1 then 'duty' else 'duties' end, to_char(greatest(r.starts_on, current_date), 'DD Mon YYYY')),
      '/tasks');
  end loop;
  return v_made;
end $$;

-- Remove a rota and the days of it that are still ahead and not ticked off. History is kept.
create function public.delete_task_rota(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_capability('tasks.assign') then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.tasks t where t.rota_id = p_id and t.school_id = public.current_school_id() and t.starts_on >= current_date
     and not exists (select 1 from public.task_assignees a where a.task_id = t.id and a.status = 'done');
  delete from public.task_rotas where id = p_id and school_id = public.current_school_id();
  if not found then raise exception 'That rota was not found.' using errcode = 'TSK01'; end if;
end $$;

-- Tick off (or reopen) the signed-in person's own part of a task.
create function public.set_my_task_status(p_task uuid, p_done boolean) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update public.task_assignees set status = case when p_done then 'done' else 'todo' end
   where task_id = p_task and profile_id = auth.uid();
  get diagnostics n = row_count;
  return n;
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function public.assignable_staff() from public, anon;
revoke execute on function public.save_task(uuid, text, text, text, date, date, time, time, text, uuid, uuid[]) from public, anon;
revoke execute on function public.save_task_rota(uuid, text, text, text, int[], time, time, text, text, int, date, date, uuid[]) from public, anon;
revoke execute on function public.generate_rota_tasks(uuid) from public, anon;
revoke execute on function public.delete_task_rota(uuid) from public, anon;
revoke execute on function public.set_my_task_status(uuid, boolean) from public, anon;
revoke execute on function public.task_assignee_check() from public, anon, authenticated;
revoke execute on function public.task_assignee_stamp() from public, anon, authenticated;
revoke execute on function public.task_assignee_notify() from public, anon, authenticated;
grant execute on function public.assignable_staff() to authenticated;
grant execute on function public.save_task(uuid, text, text, text, date, date, time, time, text, uuid, uuid[]) to authenticated;
grant execute on function public.save_task_rota(uuid, text, text, text, int[], time, time, text, text, int, date, date, uuid[]) to authenticated;
grant execute on function public.generate_rota_tasks(uuid) to authenticated;
grant execute on function public.delete_task_rota(uuid) to authenticated;
grant execute on function public.set_my_task_status(uuid, boolean) to authenticated;
