-- Complaints: anyone can raise one, openly or anonymously.
--
-- The promise this file keeps: a person who complains anonymously cannot be identified by anyone who handles
-- the complaint. The complaint, what is said about it and the link to the person who made it live in
-- separate tables that nobody can read directly. Everything is read and written through functions, and the
-- functions that serve handlers never return the link for an anonymous complaint. The one exception is the
-- developer, as a last resort (for example a threat to someone's safety, or abuse of anonymity): it needs a
-- typed reason, is recorded in a log, and that log never contains the name.
--
-- The person who complained can still read the replies and answer, because their own account is matched to
-- their complaint inside the functions, without the handlers ever being shown it.
--
-- These tables have NO audit trigger on purpose: the audit log records who made each change, which for a
-- complaint is exactly the thing to protect. Handlers' own actions are kept in complaint_log instead.
-- A complaint whose category is "safeguarding" can be seen only by people who hold the safeguarding action.

-- ── Feature and actions ─────────────────────────────────────────────────────
insert into public.app_features (key, label, description, kind, requires, sort) values
  ('complaints', 'Complaints', 'Staff, parents and pupils can raise a complaint, openly or anonymously, and the school answers it.', 'module', '{}', 99);

insert into public.access_capabilities (key, module, action, label, description, sensitive, sort) values
  ('complaints.submit', 'complaints', 'submit', 'Raise a complaint', 'Raise a complaint, openly or anonymously, and follow the replies.', false, 1300),
  ('complaints.handle', 'complaints', 'handle', 'Handle complaints', 'See complaints, reply, add private notes, give them to someone and change their status. Never sees who made an anonymous one.', true, 1310),
  ('complaints.safeguarding', 'complaints', 'safeguarding', 'Handle safeguarding complaints', 'The same for complaints about a child''s safety, which no one else can see.', true, 1320)
on conflict (key) do nothing;

insert into public.access_preset_capabilities (role, capability)
  select r, 'complaints.submit' from unnest(enum_range(null::public.app_role)) as r
  where r in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
  on conflict do nothing;
insert into public.access_preset_capabilities (role, capability) values
  ('school_admin', 'complaints.handle'), ('principal', 'complaints.handle'),
  ('school_admin', 'complaints.safeguarding'), ('principal', 'complaints.safeguarding')
  on conflict do nothing;
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, p.capability, ur.school_id
  from public.user_roles ur
  join public.access_preset_capabilities p on p.role::text = ur.role::text and p.capability like 'complaints.%'
  on conflict (profile_id, capability) do nothing;

insert into public.notification_events (key, label, description, feature, sort) values
  ('complaint_received', 'A complaint or a reply to one arrives', 'Tell the people who handle complaints when a new one is raised or the person answers a reply. Never says who it is from.', 'complaints', 70),
  ('complaint_answered', 'The school answers your complaint', 'Tell the person who complained when the school replies to them or closes it.', 'complaints', 71);

-- ── Tables (nobody reads these directly) ────────────────────────────────────
create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  ref text not null,
  category text not null check (category in ('general', 'academic', 'fees', 'staff_conduct', 'facilities', 'bullying', 'safeguarding', 'other')),
  subject text not null check (length(btrim(subject)) between 3 and 120),
  body text not null check (length(btrim(body)) between 10 and 4000),
  anonymous boolean not null default false,
  status text not null default 'new' check (status in ('new', 'in_review', 'waiting', 'resolved', 'closed')),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (school_id, ref)
);
create index on public.complaints (school_id, status);

-- Who made it. Locked: there is no policy and no privilege for any signed-in user.
create table public.complaint_submitters (
  complaint_id uuid primary key references public.complaints (id) on delete cascade,
  school_id uuid not null,
  profile_id uuid not null references public.profiles (id) on delete cascade
);
create index on public.complaint_submitters (profile_id);

create table public.complaint_messages (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  school_id uuid not null,
  from_handler boolean not null,
  author_id uuid references public.profiles (id) on delete set null,
  internal boolean not null default false,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  check (not internal or from_handler),
  check (from_handler or author_id is null)
);
create index on public.complaint_messages (complaint_id, created_at);

-- What handlers did. Never contains who made the complaint.
create table public.complaint_log (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  school_id uuid not null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  detail text,
  at timestamptz not null default now()
);

-- Every time the developer looked behind an anonymous complaint, and why. Never contains the name.
create table public.complaint_reveals (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  school_id uuid not null,
  revealed_by uuid references public.profiles (id) on delete set null,
  reason text not null check (length(btrim(reason)) between 10 and 500),
  at timestamptz not null default now()
);

alter table public.complaints enable row level security;
alter table public.complaint_submitters enable row level security;
alter table public.complaint_messages enable row level security;
alter table public.complaint_log enable row level security;
alter table public.complaint_reveals enable row level security;
revoke all on public.complaints, public.complaint_submitters, public.complaint_messages, public.complaint_log, public.complaint_reveals from anon, authenticated;

-- ── Helpers ─────────────────────────────────────────────────────────────────
create function public._complaint_can_submit() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_school_id() is not null and public.feature_enabled('complaints')
    and (public.has_capability('complaints.submit') or public.has_role('parent') or public.has_role('student')) $$;

-- May the signed-in person handle a complaint of this category? Safeguarding needs its own action.
create function public._complaint_can_handle(p_category text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_school_id() is not null and public.feature_enabled('complaints')
    and case when p_category = 'safeguarding' then public.has_capability('complaints.safeguarding') else public.has_capability('complaints.handle') end $$;

-- Who to tell: the people who hold the action for the category.
create function public._complaint_handlers(p_school uuid, p_category text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct uc.profile_id), '{}') from public.user_capabilities uc
    join public.profiles p on p.id = uc.profile_id and p.is_active
   where uc.school_id = p_school
     and uc.capability = case when p_category = 'safeguarding' then 'complaints.safeguarding' else 'complaints.handle' end $$;

create function public._complaint_owner(p_complaint uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select profile_id from public.complaint_submitters where complaint_id = p_complaint $$;

-- ── Raising one ─────────────────────────────────────────────────────────────
create function public.submit_complaint(p_category text, p_subject text, p_body text, p_anonymous boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_school uuid := public.current_school_id(); v_id uuid; v_ref text; i int := 0;
begin
  if auth.uid() is null or not public._complaint_can_submit() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_category not in ('general', 'academic', 'fees', 'staff_conduct', 'facilities', 'bullying', 'safeguarding', 'other') then
    raise exception 'Choose what the complaint is about.' using errcode = 'CMP01'; end if;
  if length(btrim(coalesce(p_subject, ''))) not between 3 and 120 then raise exception 'Give the complaint a short title (3 to 120 characters).' using errcode = 'CMP01'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 10 and 4000 then raise exception 'Say what happened, in at least a sentence (up to 4000 characters).' using errcode = 'CMP01'; end if;
  if (select count(*) from public.complaint_submitters s join public.complaints c on c.id = s.complaint_id
       where s.profile_id = auth.uid() and c.created_at > now() - interval '1 day') >= 5 then
    raise exception 'You have sent several complaints today. Please wait until tomorrow, or speak to the school office.' using errcode = 'CMP01';
  end if;
  loop
    v_ref := 'C' || to_char(now(), 'YY') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 5));
    exit when not exists (select 1 from public.complaints where school_id = v_school and ref = v_ref);
    i := i + 1; exit when i > 8;
  end loop;
  insert into public.complaints (school_id, ref, category, subject, body, anonymous)
    values (v_school, v_ref, p_category, btrim(p_subject), btrim(p_body), coalesce(p_anonymous, false)) returning id into v_id;
  insert into public.complaint_submitters (complaint_id, school_id, profile_id) values (v_id, v_school, auth.uid());
  begin
    perform public.notify_profiles(v_school, 'complaint_received', public._complaint_handlers(v_school, p_category),
      case when p_category = 'safeguarding' then 'New safeguarding complaint' else 'New complaint' end, btrim(p_subject), '/complaints');
  exception when others then raise warning 'complaint notification failed: %', sqlerrm; end;
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

-- ── The person who complained ───────────────────────────────────────────────
create function public.my_complaints()
returns table (id uuid, ref text, category text, subject text, body text, anonymous boolean, status text, created_at timestamptz, last_activity_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.ref, c.category, c.subject, c.body, c.anonymous, c.status, c.created_at, c.last_activity_at
    from public.complaints c join public.complaint_submitters s on s.complaint_id = c.id
   where s.profile_id = auth.uid() and c.school_id = public.current_school_id() and public.feature_enabled('complaints')
   order by c.last_activity_at desc $$;

-- The replies they can see: never a handler's private notes, never a handler's name.
create function public.my_complaint_thread(p_id uuid)
returns table (id uuid, from_handler boolean, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.from_handler, m.body, m.created_at from public.complaint_messages m
   where m.complaint_id = p_id and not m.internal and public.feature_enabled('complaints')
     and public._complaint_owner(p_id) = auth.uid() and m.school_id = public.current_school_id()
   order by m.created_at $$;

create function public.reply_to_complaint(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.complaints;
begin
  select * into c from public.complaints where id = p_id and school_id = public.current_school_id();
  if not found or not public.feature_enabled('complaints') or public._complaint_owner(p_id) is distinct from auth.uid() then
    raise exception 'not allowed' using errcode = '42501'; end if;
  if c.status = 'closed' then raise exception 'This complaint is closed. Raise a new one if you still need help.' using errcode = 'CMP01'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'Write your reply (up to 4000 characters).' using errcode = 'CMP01'; end if;
  insert into public.complaint_messages (complaint_id, school_id, from_handler, body) values (p_id, c.school_id, false, btrim(p_body));
  update public.complaints set last_activity_at = now(), status = case when status in ('waiting', 'resolved') then 'in_review' else status end,
    resolved_at = case when status = 'resolved' then null else resolved_at end where id = p_id;
  begin
    perform public.notify_profiles(c.school_id, 'complaint_received', public._complaint_handlers(c.school_id, c.category), 'A reply to a complaint', c.subject, '/complaints');
  exception when others then raise warning 'complaint notification failed: %', sqlerrm; end;
end $$;

-- ── Those who handle complaints ─────────────────────────────────────────────
-- The submitter's name appears only when the complaint was not anonymous.
create function public.complaints_list()
returns table (id uuid, ref text, category text, subject text, body text, anonymous boolean, submitter_name text, status text,
               assigned_to uuid, assigned_name text, created_at timestamptz, last_activity_at timestamptz, messages int)
language sql stable security definer set search_path = public as $$
  select c.id, c.ref, c.category, c.subject, c.body, c.anonymous,
         case when c.anonymous then null else (select p.full_name from public.complaint_submitters s join public.profiles p on p.id = s.profile_id where s.complaint_id = c.id) end,
         c.status, c.assigned_to, ap.full_name, c.created_at, c.last_activity_at,
         (select count(*)::int from public.complaint_messages m where m.complaint_id = c.id and not m.internal)
    from public.complaints c left join public.profiles ap on ap.id = c.assigned_to
   where c.school_id = public.current_school_id() and public._complaint_can_handle(c.category)
   order by (c.status in ('resolved', 'closed')), c.last_activity_at desc $$;

create function public.complaint_thread(p_id uuid)
returns table (id uuid, from_handler boolean, internal boolean, author_name text, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.from_handler, m.internal, case when m.from_handler then hp.full_name else null end, m.body, m.created_at
    from public.complaint_messages m join public.complaints c on c.id = m.complaint_id
    left join public.profiles hp on hp.id = m.author_id
   where m.complaint_id = p_id and c.school_id = public.current_school_id() and public._complaint_can_handle(c.category)
   order by m.created_at $$;

create function public.complaint_history(p_id uuid)
returns table (actor_name text, action text, detail text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.full_name, l.action, l.detail, l.at from public.complaint_log l join public.complaints c on c.id = l.complaint_id
    left join public.profiles p on p.id = l.actor_id
   where l.complaint_id = p_id and c.school_id = public.current_school_id() and public._complaint_can_handle(c.category)
   order by l.at $$;

create function public.handle_reply(p_id uuid, p_body text, p_internal boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c public.complaints; v_owner uuid;
begin
  select * into c from public.complaints where id = p_id and school_id = public.current_school_id();
  if not found or not public._complaint_can_handle(c.category) then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'Write your reply (up to 4000 characters).' using errcode = 'CMP01'; end if;
  insert into public.complaint_messages (complaint_id, school_id, from_handler, author_id, internal, body)
    values (p_id, c.school_id, true, auth.uid(), coalesce(p_internal, false), btrim(p_body));
  update public.complaints set last_activity_at = now(), status = case when status = 'new' then 'in_review' else status end where id = p_id;
  insert into public.complaint_log (complaint_id, school_id, actor_id, action) values (p_id, c.school_id, auth.uid(), case when coalesce(p_internal, false) then 'added a private note' else 'replied' end);
  if not coalesce(p_internal, false) then
    v_owner := public._complaint_owner(p_id);
    begin
      perform public.notify_profiles(c.school_id, 'complaint_answered', array[v_owner], 'The school has replied to your complaint', c.ref || ': ' || c.subject, '/complaints');
    exception when others then raise warning 'complaint notification failed: %', sqlerrm; end;
  end if;
end $$;

create function public.set_complaint_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.complaints;
begin
  select * into c from public.complaints where id = p_id and school_id = public.current_school_id();
  if not found or not public._complaint_can_handle(c.category) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('new', 'in_review', 'waiting', 'resolved', 'closed') then raise exception 'Choose a status.' using errcode = 'CMP01'; end if;
  if p_status = c.status then return; end if;
  update public.complaints set status = p_status, last_activity_at = now(),
    resolved_at = case when p_status in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end where id = p_id;
  insert into public.complaint_log (complaint_id, school_id, actor_id, action, detail) values (p_id, c.school_id, auth.uid(), 'changed the status', c.status || ' to ' || p_status);
  if p_status in ('resolved', 'closed') then
    begin
      perform public.notify_profiles(c.school_id, 'complaint_answered', array[public._complaint_owner(p_id)],
        case when p_status = 'resolved' then 'Your complaint has been resolved' else 'Your complaint has been closed' end, c.ref || ': ' || c.subject, '/complaints');
    exception when others then raise warning 'complaint notification failed: %', sqlerrm; end;
  end if;
end $$;

create function public.assign_complaint(p_id uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.complaints; cap text;
begin
  select * into c from public.complaints where id = p_id and school_id = public.current_school_id();
  if not found or not public._complaint_can_handle(c.category) then raise exception 'not allowed' using errcode = '42501'; end if;
  cap := case when c.category = 'safeguarding' then 'complaints.safeguarding' else 'complaints.handle' end;
  if p_profile is not null and not exists (select 1 from public.user_capabilities uc join public.profiles p on p.id = uc.profile_id and p.is_active
                                            where uc.profile_id = p_profile and uc.school_id = c.school_id and uc.capability = cap) then
    raise exception 'That person cannot handle this kind of complaint.' using errcode = 'CMP01'; end if;
  update public.complaints set assigned_to = p_profile, last_activity_at = now() where id = p_id;
  insert into public.complaint_log (complaint_id, school_id, actor_id, action, detail)
    values (p_id, c.school_id, auth.uid(), case when p_profile is null then 'removed the assignment' else 'assigned it' end,
            (select full_name from public.profiles where id = p_profile));
end $$;

-- Who a complaint can be given to.
create function public.complaint_handlers_list(p_id uuid) returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select distinct p.id, p.full_name from public.complaints c
    join public.user_capabilities uc on uc.school_id = c.school_id
      and uc.capability = case when c.category = 'safeguarding' then 'complaints.safeguarding' else 'complaints.handle' end
    join public.profiles p on p.id = uc.profile_id and p.is_active
   where c.id = p_id and c.school_id = public.current_school_id() and public._complaint_can_handle(c.category)
   order by p.full_name $$;

-- ── The last resort ─────────────────────────────────────────────────────────
-- Only the developer, only with a typed reason, always logged. The log keeps the reason and who asked, never the name.
create function public.reveal_complaint_submitter(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.complaints; p public.profiles;
begin
  if not public.is_developer() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into c from public.complaints where id = p_id and school_id = public.current_school_id();
  if not found then raise exception 'There is no such complaint.' using errcode = 'CMP01'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Give the reason (10 to 500 characters). It is kept in a log.' using errcode = 'CMP01'; end if;
  select pr.* into p from public.complaint_submitters s join public.profiles pr on pr.id = s.profile_id where s.complaint_id = p_id;
  if not found then raise exception 'The person who made this complaint no longer has an account.' using errcode = 'CMP01'; end if;
  insert into public.complaint_reveals (complaint_id, school_id, revealed_by, reason) values (p_id, c.school_id, auth.uid(), btrim(p_reason));
  insert into public.complaint_log (complaint_id, school_id, actor_id, action, detail) values (p_id, c.school_id, auth.uid(), 'revealed the submitter', btrim(p_reason));
  return jsonb_build_object('name', p.full_name, 'email', p.email,
    'roles', (select coalesce(array_agg(role::text order by role::text), '{}') from public.user_roles where profile_id = p.id));
end $$;

create function public.complaint_reveals_list()
returns table (id uuid, ref text, subject text, revealed_by_name text, reason text, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select r.id, c.ref, c.subject, p.full_name, r.reason, r.at from public.complaint_reveals r
    join public.complaints c on c.id = r.complaint_id left join public.profiles p on p.id = r.revealed_by
   where r.school_id = public.current_school_id() order by r.at desc;
end $$;

-- ── Lock the functions down ─────────────────────────────────────────────────
revoke execute on function public._complaint_can_submit() from public, anon;
revoke execute on function public._complaint_can_handle(text) from public, anon;
revoke execute on function public._complaint_handlers(uuid, text) from public, anon, authenticated;
revoke execute on function public._complaint_owner(uuid) from public, anon, authenticated;
revoke execute on function public.submit_complaint(text, text, text, boolean) from public, anon;
revoke execute on function public.my_complaints() from public, anon;
revoke execute on function public.my_complaint_thread(uuid) from public, anon;
revoke execute on function public.reply_to_complaint(uuid, text) from public, anon;
revoke execute on function public.complaints_list() from public, anon;
revoke execute on function public.complaint_thread(uuid) from public, anon;
revoke execute on function public.complaint_history(uuid) from public, anon;
revoke execute on function public.handle_reply(uuid, text, boolean) from public, anon;
revoke execute on function public.set_complaint_status(uuid, text) from public, anon;
revoke execute on function public.assign_complaint(uuid, uuid) from public, anon;
revoke execute on function public.complaint_handlers_list(uuid) from public, anon;
revoke execute on function public.reveal_complaint_submitter(uuid, text) from public, anon;
revoke execute on function public.complaint_reveals_list() from public, anon;
grant execute on function public._complaint_can_submit() to authenticated;
grant execute on function public._complaint_can_handle(text) to authenticated;
grant execute on function public.submit_complaint(text, text, text, boolean) to authenticated;
grant execute on function public.my_complaints() to authenticated;
grant execute on function public.my_complaint_thread(uuid) to authenticated;
grant execute on function public.reply_to_complaint(uuid, text) to authenticated;
grant execute on function public.complaints_list() to authenticated;
grant execute on function public.complaint_thread(uuid) to authenticated;
grant execute on function public.complaint_history(uuid) to authenticated;
grant execute on function public.handle_reply(uuid, text, boolean) to authenticated;
grant execute on function public.set_complaint_status(uuid, text) to authenticated;
grant execute on function public.assign_complaint(uuid, uuid) to authenticated;
grant execute on function public.complaint_handlers_list(uuid) to authenticated;
grant execute on function public.reveal_complaint_submitter(uuid, text) to authenticated;
grant execute on function public.complaint_reveals_list() to authenticated;
