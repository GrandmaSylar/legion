-- Syllabus and lesson plans.
--
-- A syllabus is a list of topics for a subject at a level, typed in or imported, each optionally pinned to
-- a term and a week. A teacher writes a short plan for a class and subject for a plan period, against a
-- topic from the syllabus or their own. The period is one week by default and is a school setting, as is
-- the day plans are due (Friday, before the period begins) and whether the head reviews them. A plan goes
-- draft, submitted, then approved or sent back with a comment; a plan sent back is edited and submitted
-- again. Teachers see and write their own plans; reviewers see all of them and decide.
--
-- Periods are counted from the first Monday of the current term, so a two-week period always starts in the
-- same weeks for everyone.

-- ── Feature and actions ─────────────────────────────────────────────────────
insert into public.app_features (key, label, description, kind, requires, sort) values
  ('lessons', 'Syllabus and lesson plans', 'Keep the syllabus for each subject, let teachers write lesson plans against it, and let the head review them.', 'module', '{}', 97);

insert into public.access_capabilities (key, module, action, label, description, sensitive, sort) values
  ('lessons.view_syllabus', 'lessons', 'view_syllabus', 'See the syllabus', 'See the topics for each subject and level.', false, 1200),
  ('lessons.manage_syllabus', 'lessons', 'manage_syllabus', 'Set up the syllabus and plan rules', 'Add, change, import and remove syllabus topics, and set how often plans are due.', false, 1210),
  ('lessons.write_own', 'lessons', 'write_own', 'Write lesson plans', 'Write and submit lesson plans for the classes and subjects they teach.', false, 1220),
  ('lessons.view_all', 'lessons', 'view_all', 'See everyone''s lesson plans', 'See every lesson plan and who has not planned yet.', false, 1230),
  ('lessons.review', 'lessons', 'review', 'Approve or comment on lesson plans', 'Approve a submitted plan or send it back with a comment.', false, 1240),
  ('lessons.download', 'lessons', 'download', 'Download the syllabus and plans', 'Download syllabus topics and lesson plans.', false, 1250)
on conflict (key) do nothing;

insert into public.access_preset_capabilities (role, capability)
  select r, 'lessons.view_syllabus' from unnest(enum_range(null::public.app_role)) as r
  where r in ('school_admin', 'principal', 'teacher', 'hr_officer', 'librarian')
  on conflict do nothing;
insert into public.access_preset_capabilities (role, capability) values
  ('teacher', 'lessons.write_own'),
  ('school_admin', 'lessons.manage_syllabus'), ('principal', 'lessons.manage_syllabus'),
  ('school_admin', 'lessons.view_all'), ('principal', 'lessons.view_all'),
  ('school_admin', 'lessons.review'), ('principal', 'lessons.review'),
  ('school_admin', 'lessons.download'), ('principal', 'lessons.download')
  on conflict do nothing;
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, p.capability, ur.school_id
  from public.user_roles ur
  join public.access_preset_capabilities p on p.role::text = ur.role::text and p.capability like 'lessons.%'
  on conflict (profile_id, capability) do nothing;

insert into public.notification_events (key, label, description, feature, sort) values
  ('lesson_plan_submitted', 'A lesson plan is submitted', 'Tell the people who review plans when a teacher submits one.', 'lessons', 70),
  ('lesson_plan_reviewed', 'A lesson plan is reviewed', 'Tell a teacher when their plan is approved or sent back with a comment.', 'lessons', 80);

-- ── The syllabus ────────────────────────────────────────────────────────────
create table public.syllabus_topics (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  level_id uuid not null references public.levels (id) on delete cascade,
  term_no smallint check (term_no between 1 and 3),
  week_no smallint check (week_no between 1 and 20),
  position int not null default 0,
  title text not null check (length(btrim(title)) between 1 and 160),
  objectives text check (objectives is null or length(objectives) <= 1000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.syllabus_topics (school_id, subject_id, level_id, position);
create trigger set_updated_at before update on public.syllabus_topics for each row execute function public.set_updated_at();

-- ── School settings for plans ───────────────────────────────────────────────
create table public.lesson_plan_settings (
  school_id uuid primary key default public.current_school_id() references public.schools (id),
  period_weeks smallint not null default 1 check (period_weeks between 1 and 12),
  due_weekday smallint not null default 5 check (due_weekday between 1 and 7),
  require_review boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

-- ── Lesson plans ────────────────────────────────────────────────────────────
create table public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  class_subject_id uuid not null references public.class_subjects (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  topic_id uuid references public.syllabus_topics (id) on delete set null,
  topic text not null check (length(btrim(topic)) between 1 and 160),
  objectives text check (objectives is null or length(objectives) <= 2000),
  activities text check (activities is null or length(activities) <= 2000),
  resources text check (resources is null or length(resources) <= 1000),
  homework text check (homework is null or length(homework) <= 1000),
  notes text check (notes is null or length(notes) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'changes_requested')),
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_comment text check (review_comment is null or length(review_comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_subject_id, week_start)
);
create index on public.lesson_plans (school_id, week_start);
create index on public.lesson_plans (author_id);
create trigger set_updated_at before update on public.lesson_plans for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.lesson_plans for each row execute function public.audit_row();
create trigger audit_row after insert or update or delete on public.syllabus_topics for each row execute function public.audit_row();

-- ── Who can see and change what ─────────────────────────────────────────────
alter table public.syllabus_topics enable row level security;
alter table public.lesson_plan_settings enable row level security;
alter table public.lesson_plans enable row level security;

create policy syllabus_read on public.syllabus_topics for select to authenticated
  using (school_id = public.current_school_id() and public.has_any_capability(
    array['lessons.view_syllabus', 'lessons.manage_syllabus', 'lessons.write_own', 'lessons.view_all']));
create policy syllabus_insert on public.syllabus_topics for insert to authenticated
  with check (school_id = public.current_school_id() and public.has_capability('lessons.manage_syllabus')
              and exists (select 1 from public.subjects s where s.id = subject_id) and exists (select 1 from public.levels l where l.id = level_id));
create policy syllabus_update on public.syllabus_topics for update to authenticated
  using (school_id = public.current_school_id() and public.has_capability('lessons.manage_syllabus'))
  with check (school_id = public.current_school_id() and public.has_capability('lessons.manage_syllabus'));
create policy syllabus_delete on public.syllabus_topics for delete to authenticated
  using (school_id = public.current_school_id() and public.has_capability('lessons.manage_syllabus'));

create policy lesson_settings_read on public.lesson_plan_settings for select to authenticated
  using (school_id = public.current_school_id() and public.has_any_capability(
    array['lessons.view_syllabus', 'lessons.manage_syllabus', 'lessons.write_own', 'lessons.view_all', 'lessons.review']));

-- Plans are written and decided through the functions below. A teacher may only remove a draft of their own.
create policy lesson_plans_read on public.lesson_plans for select to authenticated
  using (school_id = public.current_school_id() and public.feature_enabled('lessons') and (
    author_id = auth.uid() or public.has_capability('lessons.view_all') or public.has_capability('lessons.review')));
create policy lesson_plans_delete_draft on public.lesson_plans for delete to authenticated
  using (school_id = public.current_school_id() and author_id = auth.uid() and status = 'draft' and public.has_capability('lessons.write_own'));

-- ── Plan periods ────────────────────────────────────────────────────────────
create function public._monday(p_date date) returns date language sql immutable as $$
  select p_date - (extract(isodow from p_date)::int - 1)
$$;

create function public._plan_settings(p_school uuid) returns public.lesson_plan_settings
language sql stable security definer set search_path = public as $$
  select coalesce((select s from public.lesson_plan_settings s where s.school_id = p_school),
                  row(p_school, 1, 5, true, null, now())::public.lesson_plan_settings)
$$;

-- The first day of the plan period a date falls in. Periods are counted from the first Monday of the
-- current term (or of this week when no term is current), in blocks of the school's period length.
create function public._plan_period_start(p_school uuid, p_date date) returns date
language plpgsql stable security definer set search_path = public as $$
declare v_pw int := (public._plan_settings(p_school)).period_weeks; v_anchor date; v_block int;
begin
  select public._monday(coalesce((select start_date from public.terms where school_id = p_school and is_current limit 1), current_date)) into v_anchor;
  v_block := 7 * v_pw;
  return v_anchor + (floor((public._monday(p_date) - v_anchor)::numeric / v_block) * v_block)::int;
end $$;

-- When plans for a period are due: the chosen weekday before the period begins.
create function public._plan_due_on(p_school uuid, p_period_start date) returns date
language plpgsql stable security definer set search_path = public as $$
declare v_due int := (public._plan_settings(p_school)).due_weekday; v_back int;
begin
  v_back := ((1 - v_due) + 7) % 7;
  if v_back = 0 then v_back := 7; end if;
  return p_period_start - v_back;
end $$;

-- The current and the next plan period, with their due dates, and the school's rules.
create function public.lesson_plan_schedule() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_school uuid := public.current_school_id(); s public.lesson_plan_settings; cur date; nxt date;
begin
  if not public.has_any_capability(array['lessons.view_syllabus', 'lessons.manage_syllabus', 'lessons.write_own', 'lessons.view_all', 'lessons.review']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  s := public._plan_settings(v_school);
  cur := public._plan_period_start(v_school, current_date);
  nxt := cur + 7 * s.period_weeks;
  return jsonb_build_object(
    'periodWeeks', s.period_weeks, 'dueWeekday', s.due_weekday, 'requireReview', s.require_review,
    'current', jsonb_build_object('start', cur, 'end', cur + 7 * s.period_weeks - 1, 'dueOn', public._plan_due_on(v_school, cur)),
    'next', jsonb_build_object('start', nxt, 'end', nxt + 7 * s.period_weeks - 1, 'dueOn', public._plan_due_on(v_school, nxt)));
end $$;

create function public.save_lesson_plan_settings(p_period_weeks int, p_due_weekday int, p_require_review boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_capability('lessons.manage_syllabus') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_period_weeks not between 1 and 12 then raise exception 'A plan can cover between 1 and 12 weeks.' using errcode = 'LPN01'; end if;
  if p_due_weekday not between 1 and 7 then raise exception 'Choose a day of the week.' using errcode = 'LPN01'; end if;
  insert into public.lesson_plan_settings (school_id, period_weeks, due_weekday, require_review)
  values (public.current_school_id(), p_period_weeks, p_due_weekday, p_require_review)
  on conflict (school_id) do update set period_weeks = excluded.period_weeks, due_weekday = excluded.due_weekday,
    require_review = excluded.require_review, updated_by = auth.uid(), updated_at = now();
end $$;

-- ── Writing, submitting and reviewing a plan ────────────────────────────────
create function public.save_lesson_plan(
  p_id uuid, p_class_subject uuid, p_week_start date, p_topic_id uuid, p_topic text,
  p_objectives text, p_activities text, p_resources text, p_homework text, p_notes text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_school uuid := public.current_school_id(); v_id uuid; v_status text; v_author uuid;
begin
  if not public.has_capability('lessons.write_own') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not public.teaches_class_subject(p_class_subject) then
    raise exception 'You can only write plans for the classes and subjects you teach.' using errcode = 'LPN01';
  end if;
  if not exists (select 1 from public.class_subjects where id = p_class_subject and school_id = v_school) then
    raise exception 'That class and subject were not found.' using errcode = 'LPN01';
  end if;
  if length(btrim(coalesce(p_topic, ''))) not between 1 and 160 then raise exception 'Say what the topic is.' using errcode = 'LPN01'; end if;
  if p_week_start <> public._plan_period_start(v_school, p_week_start) then
    raise exception 'A plan starts on the first day of a plan period.' using errcode = 'LPN01';
  end if;
  if p_topic_id is not null and not exists (
    select 1 from public.syllabus_topics t
      join public.class_subjects cs on cs.id = p_class_subject and cs.subject_id = t.subject_id
      join public.classes c on c.id = cs.class_id and c.level_id = t.level_id
     where t.id = p_topic_id and t.school_id = v_school
  ) then
    raise exception 'That topic is not in the syllabus for this subject and level.' using errcode = 'LPN01';
  end if;

  if p_id is null then
    if exists (select 1 from public.lesson_plans where class_subject_id = p_class_subject and week_start = p_week_start) then
      raise exception 'There is already a plan for this class and subject for that period.' using errcode = 'LPN01';
    end if;
    insert into public.lesson_plans (school_id, class_subject_id, week_start, topic_id, topic, objectives, activities, resources, homework, notes)
    values (v_school, p_class_subject, p_week_start, p_topic_id, btrim(p_topic), nullif(btrim(coalesce(p_objectives, '')), ''),
            nullif(btrim(coalesce(p_activities, '')), ''), nullif(btrim(coalesce(p_resources, '')), ''),
            nullif(btrim(coalesce(p_homework, '')), ''), nullif(btrim(coalesce(p_notes, '')), '')) returning id into v_id;
  else
    select status, author_id into v_status, v_author from public.lesson_plans where id = p_id and school_id = v_school;
    if v_status is null then raise exception 'That plan was not found.' using errcode = 'LPN01'; end if;
    if v_author is distinct from auth.uid() then raise exception 'You can only change your own plans.' using errcode = 'LPN01'; end if;
    if v_status not in ('draft', 'changes_requested') then
      raise exception 'This plan has been submitted or approved and cannot be changed.' using errcode = 'LPN01';
    end if;
    update public.lesson_plans set class_subject_id = p_class_subject, week_start = p_week_start, topic_id = p_topic_id, topic = btrim(p_topic),
           objectives = nullif(btrim(coalesce(p_objectives, '')), ''), activities = nullif(btrim(coalesce(p_activities, '')), ''),
           resources = nullif(btrim(coalesce(p_resources, '')), ''), homework = nullif(btrim(coalesce(p_homework, '')), ''),
           notes = nullif(btrim(coalesce(p_notes, '')), '')
     where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.submit_lesson_plan(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_school uuid := public.current_school_id(); p public.lesson_plans; v_review boolean; v_ids uuid[]; v_label text;
begin
  if not public.has_capability('lessons.write_own') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into p from public.lesson_plans where id = p_id and school_id = v_school;
  if not found then raise exception 'That plan was not found.' using errcode = 'LPN01'; end if;
  if p.author_id is distinct from auth.uid() then raise exception 'You can only submit your own plans.' using errcode = 'LPN01'; end if;
  if p.status not in ('draft', 'changes_requested') then raise exception 'This plan has already been submitted.' using errcode = 'LPN01'; end if;
  if length(btrim(coalesce(p.objectives, ''))) = 0 then raise exception 'Add the objectives before submitting.' using errcode = 'LPN01'; end if;

  update public.lesson_plans set status = 'submitted', submitted_at = now(), reviewed_by = null, reviewed_at = null, review_comment = null where id = p_id;
  v_review := (public._plan_settings(v_school)).require_review;
  if v_review then
    select array_agg(distinct uc.profile_id) into v_ids from public.user_capabilities uc
     where uc.school_id = v_school and uc.capability = 'lessons.review' and uc.profile_id <> auth.uid()
       and (uc.expires_at is null or uc.expires_at > now());
    select l.name || ' ' || c.section || ' ' || sub.name into v_label
      from public.class_subjects cs join public.classes c on c.id = cs.class_id join public.levels l on l.id = c.level_id
      join public.subjects sub on sub.id = cs.subject_id where cs.id = p.class_subject_id;
    perform public.notify_profiles(v_school, 'lesson_plan_submitted', v_ids, 'Lesson plan to review', coalesce(v_label, '') || ': ' || p.topic, '/lessons');
  end if;
end $$;

create function public.review_lesson_plan(p_id uuid, p_decision text, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare v_school uuid := public.current_school_id(); p public.lesson_plans;
begin
  if not public.has_capability('lessons.review') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'changes_requested') then raise exception 'Approve the plan or send it back.' using errcode = 'LPN01'; end if;
  select * into p from public.lesson_plans where id = p_id and school_id = v_school;
  if not found then raise exception 'That plan was not found.' using errcode = 'LPN01'; end if;
  if p.status <> 'submitted' then raise exception 'Only a submitted plan can be reviewed.' using errcode = 'LPN01'; end if;
  if p_decision = 'changes_requested' and length(btrim(coalesce(p_comment, ''))) = 0 then
    raise exception 'Say what needs to change.' using errcode = 'LPN01';
  end if;
  update public.lesson_plans set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_comment = nullif(btrim(coalesce(p_comment, '')), '') where id = p_id;
  perform public.notify_profiles(v_school, 'lesson_plan_reviewed', array[p.author_id],
    case when p_decision = 'approved' then 'Lesson plan approved' else 'Lesson plan sent back' end,
    p.topic || case when nullif(btrim(coalesce(p_comment, '')), '') is not null then ': ' || btrim(p_comment) else '' end, '/lessons');
end $$;

-- ── Who has planned (for those who oversee plans) ───────────────────────────
create function public.lesson_plan_tracker(p_period_start date)
returns table (class_subject_id uuid, class_label text, subject_name text, teacher_name text, plan_id uuid, status text, topic text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_capability('lessons.view_all') or public.has_capability('lessons.review')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select cs.id, (l.name || ' ' || c.section)::text, sub.name, st.full_name, lp.id, lp.status, lp.topic
    from public.class_subjects cs
    join public.classes c on c.id = cs.class_id and c.school_id = public.current_school_id()
    join public.academic_years y on y.id = c.academic_year_id and y.is_current
    join public.levels l on l.id = c.level_id
    join public.subjects sub on sub.id = cs.subject_id
    join public.staff st on st.id = cs.teacher_id
    left join public.lesson_plans lp on lp.class_subject_id = cs.id and lp.week_start = p_period_start
   order by st.full_name, l.sort_order, c.section, sub.name;
end $$;

-- ── Importing a syllabus ────────────────────────────────────────────────────
-- p_rows: [{term?, week?, title, objectives?}]. Adds to the end, or replaces what is there (plans keep their topic wording).
create function public.import_syllabus_topics(p_subject uuid, p_level uuid, p_rows jsonb, p_replace boolean) returns int
language plpgsql security definer set search_path = public as $$
declare v_school uuid := public.current_school_id(); v_base int; n int;
begin
  if not public.has_capability('lessons.manage_syllabus') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.subjects where id = p_subject and school_id = v_school)
     or not exists (select 1 from public.levels where id = p_level and school_id = v_school) then
    raise exception 'That subject or level was not found.' using errcode = 'LPN01';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 300 then
    raise exception 'Import between 1 and 300 topics at a time.' using errcode = 'LPN01';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) e where length(btrim(coalesce(e->>'title', ''))) not between 1 and 160) then
    raise exception 'Every topic needs a title of up to 160 characters.' using errcode = 'LPN01';
  end if;
  if p_replace then
    delete from public.syllabus_topics where subject_id = p_subject and level_id = p_level and school_id = v_school;
  end if;
  select coalesce(max(position), 0) into v_base from public.syllabus_topics where subject_id = p_subject and level_id = p_level and school_id = v_school;
  insert into public.syllabus_topics (school_id, subject_id, level_id, term_no, week_no, position, title, objectives)
  select v_school, p_subject, p_level, nullif(e.value->>'term', '')::smallint, nullif(e.value->>'week', '')::smallint, v_base + e.ord,
         btrim(e.value->>'title'), nullif(left(btrim(coalesce(e.value->>'objectives', '')), 1000), '')
    from jsonb_array_elements(p_rows) with ordinality as e(value, ord);
  get diagnostics n = row_count;
  return n;
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function public._monday(date) from public, anon, authenticated;
revoke execute on function public._plan_settings(uuid) from public, anon, authenticated;
revoke execute on function public._plan_period_start(uuid, date) from public, anon, authenticated;
revoke execute on function public._plan_due_on(uuid, date) from public, anon, authenticated;
revoke execute on function public.lesson_plan_schedule() from public, anon;
revoke execute on function public.save_lesson_plan_settings(int, int, boolean) from public, anon;
revoke execute on function public.save_lesson_plan(uuid, uuid, date, uuid, text, text, text, text, text, text) from public, anon;
revoke execute on function public.submit_lesson_plan(uuid) from public, anon;
revoke execute on function public.review_lesson_plan(uuid, text, text) from public, anon;
revoke execute on function public.lesson_plan_tracker(date) from public, anon;
revoke execute on function public.import_syllabus_topics(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public.lesson_plan_schedule() to authenticated;
grant execute on function public.save_lesson_plan_settings(int, int, boolean) to authenticated;
grant execute on function public.save_lesson_plan(uuid, uuid, date, uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.submit_lesson_plan(uuid) to authenticated;
grant execute on function public.review_lesson_plan(uuid, text, text) to authenticated;
grant execute on function public.lesson_plan_tracker(date) to authenticated;
grant execute on function public.import_syllabus_topics(uuid, uuid, jsonb, boolean) to authenticated;
