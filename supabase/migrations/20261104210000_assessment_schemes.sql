-- Assessment schemes: a school decides how marks add up to a term result.
--
-- A scheme is a list of parts (for example Class work 10%, Tests 20%, Exam 70%). Each part has a share
-- of the total (the shares must add up to 100), says whether it counts as continuous assessment or
-- exam, and says how the marks inside it combine: the average of all of them, the average of the best
-- N (the weakest are dropped), or all the marks pooled. Each part also says what to do about a mark a
-- pupil does not have: leave it out, or count it as zero.
--
-- A scheme is given to a level, and a class may use a different one. A class with no scheme keeps the
-- calculation it always had, to the same decimal, so nothing changes until a school chooses a scheme.
-- Changing a scheme or giving one to a class recalculates the results it touches straight away.

-- ── The action ──────────────────────────────────────────────────────────────
insert into public.access_capabilities (key, module, action, label, description, sensitive, sort) values
  ('grades.manage_assessment_schemes', 'grades', 'manage_assessment_schemes', 'Set up how marks add up',
   'Create assessment schemes (the parts of a result and their shares) and choose which levels and classes use them.', true, 216)
on conflict (key) do nothing;
insert into public.access_preset_capabilities (role, capability) values
  ('school_admin', 'grades.manage_assessment_schemes'), ('principal', 'grades.manage_assessment_schemes')
on conflict do nothing;
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, 'grades.manage_assessment_schemes', ur.school_id from public.user_roles ur
  where ur.role in ('school_admin', 'principal')
on conflict (profile_id, capability) do nothing;

-- ── Schemes and their parts ─────────────────────────────────────────────────
create table public.assessment_schemes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  name text not null check (length(btrim(name)) between 1 and 60),
  description text check (description is null or length(description) <= 200),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table public.assessment_components (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  scheme_id uuid not null references public.assessment_schemes (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  feeds text not null default 'ca' check (feeds in ('ca', 'exam')),
  weight numeric not null check (weight > 0 and weight <= 100),
  method text not null default 'average' check (method in ('average', 'best_n', 'total_marks')),
  best_n int check (best_n is null or best_n between 1 and 20),
  missing text not null default 'skip' check (missing in ('skip', 'zero')),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (method <> 'best_n' or best_n is not null),
  unique (scheme_id, name) deferrable initially deferred
);
create index on public.assessment_components (scheme_id);

create trigger set_updated_at before update on public.assessment_schemes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.assessment_components
  for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.assessment_schemes
  for each row execute function public.audit_row();
create trigger audit_row after insert or update or delete on public.assessment_components
  for each row execute function public.audit_row();

alter table public.assessment_schemes enable row level security;
alter table public.assessment_components enable row level security;
-- Anyone who works with marks can read the schemes. Nobody writes them directly: see save_assessment_scheme.
create policy assessment_schemes_read on public.assessment_schemes for select to authenticated
  using (school_id = public.current_school_id() and public.has_any_capability(
    array['grades.view', 'grades.enter_own_classes', 'grades.enter_any', 'grades.manage_assessment_schemes']));
create policy assessment_components_read on public.assessment_components for select to authenticated
  using (school_id = public.current_school_id() and public.has_any_capability(
    array['grades.view', 'grades.enter_own_classes', 'grades.enter_any', 'grades.manage_assessment_schemes']));

-- ── Who uses which scheme ───────────────────────────────────────────────────
alter table public.levels add column assessment_scheme_id uuid references public.assessment_schemes (id) on delete restrict;
alter table public.classes add column assessment_scheme_id uuid references public.assessment_schemes (id) on delete restrict;
alter table public.assessments add column component_id uuid references public.assessment_components (id) on delete restrict;
create index on public.assessments (component_id) where component_id is not null;

-- The scheme a class uses: its own, else its level's, else none (marks counted the original way).
create function public._scheme_of_class(p_class uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(c.assessment_scheme_id, l.assessment_scheme_id)
  from public.classes c join public.levels l on l.id = c.level_id where c.id = p_class
$$;

-- ── The calculation ─────────────────────────────────────────────────────────
-- Assessments that belong to a part of the class's scheme are combined by that part's rule. Any other
-- assessment (every one, in a class with no scheme) counts the original way: score / max x its own
-- weight, into continuous assessment unless it is an exam.
create or replace function public.recompute_term_result(
  p_enrollment uuid, p_term uuid, p_class_subject uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_subject uuid;
  v_class uuid;
  v_scheme uuid;
  v_count int;
  v_ca numeric := 0;
  v_exam numeric := 0;
  v_part_ca numeric := 0;
  v_part_exam numeric := 0;
  v_total numeric;
  v_scale uuid;
  v_type public.grading_type;
  v_grade text;
  v_remark text;
begin
  select cs.school_id, cs.subject_id, cs.class_id into v_school, v_subject, v_class
  from public.class_subjects cs where cs.id = p_class_subject;

  if v_subject is null then
    return;
  end if;

  select count(*) into v_count
  from public.scores s join public.assessments a on a.id = s.assessment_id
  where s.enrollment_id = p_enrollment and a.term_id = p_term and a.class_subject_id = p_class_subject;

  if coalesce(v_count, 0) = 0 then
    delete from public.term_results
    where enrollment_id = p_enrollment and term_id = p_term and subject_id = v_subject;
    return;
  end if;

  v_scheme := public._scheme_of_class(v_class);

  -- Assessments counted the original way.
  select
    coalesce(sum(s.score / a.max_score * a.weight) filter (where a.type <> 'exam'), 0),
    coalesce(sum(s.score / a.max_score * a.weight) filter (where a.type = 'exam'), 0)
  into v_ca, v_exam
  from public.scores s
  join public.assessments a on a.id = s.assessment_id
  left join public.assessment_components k on k.id = a.component_id
  where s.enrollment_id = p_enrollment
    and a.term_id = p_term
    and a.class_subject_id = p_class_subject
    and (v_scheme is null or a.component_id is null or k.scheme_id <> v_scheme);

  -- Assessments counted by the parts of the scheme.
  if v_scheme is not null then
    with items as (
      select k.id as part, k.weight, k.feeds, k.method, k.best_n, a.id as aid, a.max_score, s.score
      from public.assessment_components k
      join public.assessments a on a.component_id = k.id and a.class_subject_id = p_class_subject and a.term_id = p_term
      left join public.scores s on s.assessment_id = a.id and s.enrollment_id = p_enrollment
      where k.scheme_id = v_scheme and (s.score is not null or k.missing = 'zero')
    ),
    ranked as (
      select i.*, coalesce(i.score, 0) / i.max_score as pct,
             row_number() over (partition by i.part order by coalesce(i.score, 0) / i.max_score desc, i.aid) as rn
      from items i
    ),
    parts as (
      select part, feeds, weight,
        least(1, greatest(0, case method
          when 'average' then avg(pct)
          when 'best_n' then avg(pct) filter (where rn <= best_n)
          else sum(coalesce(score, 0)) / nullif(sum(max_score), 0)
        end)) as frac
      from ranked group by part, feeds, weight, method, best_n
    )
    select coalesce(sum(coalesce(frac, 0) * weight) filter (where feeds = 'ca'), 0),
           coalesce(sum(coalesce(frac, 0) * weight) filter (where feeds = 'exam'), 0)
    into v_part_ca, v_part_exam
    from parts;
    v_ca := v_ca + v_part_ca;
    v_exam := v_exam + v_part_exam;
  end if;

  v_total := round(v_ca + v_exam, 2);

  select l.grading_scale_id into v_scale
  from public.enrollments e
  join public.classes c on c.id = e.class_id
  join public.levels l on l.id = c.level_id
  where e.id = p_enrollment;

  select gs.type into v_type from public.grading_scales gs where gs.id = v_scale;

  if v_type in ('ges_numeric', 'custom_numeric') then
    select gb.grade, gb.remark into v_grade, v_remark
    from public.grade_bands gb
    where gb.scale_id = v_scale and v_total >= gb.min_score and v_total <= gb.max_score
    order by gb.min_score desc
    limit 1;
  end if;

  insert into public.term_results
    (school_id, enrollment_id, term_id, subject_id, ca_total, exam_score, total, grade, remark)
  values
    (v_school, p_enrollment, p_term, v_subject, round(v_ca, 2), round(v_exam, 2), v_total, v_grade, v_remark)
  on conflict (enrollment_id, term_id, subject_id) do update set
    ca_total = excluded.ca_total,
    exam_score = excluded.exam_score,
    total = excluded.total,
    grade = excluded.grade,
    remark = excluded.remark,
    updated_at = now();
end $$;

-- Recalculate every result in a class (used when a scheme changes or is given to a class).
create function public.recompute_class_results(p_class uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select e.id as enr, cs.id as cs_id, t.term_id
    from public.enrollments e
    join public.class_subjects cs on cs.class_id = e.class_id
    join (select distinct class_subject_id, term_id from public.assessments) t on t.class_subject_id = cs.id
    where e.class_id = p_class
  loop
    perform public.recompute_term_result(r.enr, r.term_id, r.cs_id);
  end loop;
end $$;

-- An assessment's weight, max, type or part changing recalculates its class (the original trigger, now watching the part too).
drop trigger if exists assessments_after_change on public.assessments;
create trigger assessments_after_change
after update of max_score, weight, type, component_id or delete on public.assessments
for each row execute function public.assessments_after_change();

-- ── An assessment must sit in a part of its own class's scheme ──────────────
create function public.assessments_check_component() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_class uuid; v_scheme uuid; v_part_scheme uuid;
begin
  select cs.class_id into v_class from public.class_subjects cs where cs.id = new.class_subject_id;
  v_scheme := public._scheme_of_class(v_class);
  if new.component_id is not null then
    select k.scheme_id into v_part_scheme from public.assessment_components k where k.id = new.component_id;
    if v_part_scheme is distinct from v_scheme then
      raise exception 'That part belongs to a different scheme from the one this class uses.' using errcode = 'ASM01';
    end if;
  elsif v_scheme is not null and tg_op = 'INSERT' then
    raise exception 'Choose which part of the result this assessment belongs to.' using errcode = 'ASM01';
  end if;
  return new;
end $$;
create trigger assessments_component before insert or update of component_id on public.assessments
  for each row execute function public.assessments_check_component();

-- ── Giving a scheme to a level or a class ───────────────────────────────────
-- Only people who manage schemes may change this, even if they could otherwise edit the level or class.
create function public.scheme_assignment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assessment_scheme_id is distinct from old.assessment_scheme_id and not public.has_capability('grades.manage_assessment_schemes') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger levels_scheme_guard before update of assessment_scheme_id on public.levels
  for each row execute function public.scheme_assignment_guard();
create trigger classes_scheme_guard before update of assessment_scheme_id on public.classes
  for each row execute function public.scheme_assignment_guard();

create function public.level_scheme_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if new.assessment_scheme_id is not distinct from old.assessment_scheme_id then return new; end if;
  for c in select id from public.classes where level_id = new.id and assessment_scheme_id is null loop
    perform public.recompute_class_results(c);
  end loop;
  return new;
end $$;
create trigger levels_scheme_changed after update of assessment_scheme_id on public.levels
  for each row execute function public.level_scheme_changed();

create function public.class_scheme_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assessment_scheme_id is not distinct from old.assessment_scheme_id then return new; end if;
  perform public.recompute_class_results(new.id);
  return new;
end $$;
create trigger classes_scheme_changed after update of assessment_scheme_id on public.classes
  for each row execute function public.class_scheme_changed();

-- Give a level (or one class) a scheme, or take it away by passing no scheme. Exactly one of level and class.
create function public.set_assessment_scheme(p_level uuid, p_class uuid, p_scheme uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_school uuid := public.current_school_id();
begin
  if not public.has_capability('grades.manage_assessment_schemes') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (p_level is null) = (p_class is null) then
    raise exception 'Choose either a level or a class.' using errcode = 'ASM01';
  end if;
  if p_scheme is not null and not exists (select 1 from public.assessment_schemes where id = p_scheme and school_id = v_school) then
    raise exception 'That scheme was not found.' using errcode = 'ASM01';
  end if;
  if p_level is not null then
    update public.levels set assessment_scheme_id = p_scheme where id = p_level and school_id = v_school;
  else
    update public.classes set assessment_scheme_id = p_scheme where id = p_class and school_id = v_school;
  end if;
  if not found then
    raise exception 'That level or class was not found.' using errcode = 'ASM01';
  end if;
end $$;

-- ── Saving a scheme and its parts together ──────────────────────────────────
-- p_components: [{id?, name, feeds, weight, method, bestN?, missing}]. The shares must add up to 100.
create function public.save_assessment_scheme(p_id uuid, p_name text, p_description text, p_components jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid := public.current_school_id();
  v_id uuid;
  c jsonb;
  v_total numeric := 0;
  v_pos int := 0;
  v_keep uuid[] := '{}';
  v_cid uuid;
  v_name text; v_feeds text; v_w numeric; v_method text; v_best int; v_missing text;
  r record;
  cls uuid;
begin
  if not public.has_capability('grades.manage_assessment_schemes') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'Give the scheme a name.' using errcode = 'ASM01';
  end if;
  if jsonb_typeof(p_components) is distinct from 'array' or jsonb_array_length(p_components) not between 1 and 10 then
    raise exception 'A scheme needs between 1 and 10 parts.' using errcode = 'ASM01';
  end if;

  for c in select value from jsonb_array_elements(p_components) loop
    v_name := btrim(coalesce(c->>'name', ''));
    v_w := (c->>'weight')::numeric;
    v_method := coalesce(c->>'method', 'average');
    v_best := nullif(c->>'bestN', '')::int;
    if length(v_name) not between 1 and 40 then raise exception 'Every part needs a name.' using errcode = 'ASM01'; end if;
    if v_w is null or v_w <= 0 or v_w > 100 then raise exception '"%" needs a share between 0 and 100.', v_name using errcode = 'ASM01'; end if;
    if v_method = 'best_n' and (v_best is null or v_best < 1) then raise exception '"%" needs a number of best marks to count.', v_name using errcode = 'ASM01'; end if;
    v_total := v_total + v_w;
  end loop;
  if v_total <> 100 then
    raise exception 'The parts must add up to 100%%. They add up to %.', v_total::text || '%' using errcode = 'ASM01';
  end if;
  if (select count(distinct lower(btrim(x->>'name'))) from jsonb_array_elements(p_components) x) <> jsonb_array_length(p_components) then
    raise exception 'Two parts have the same name.' using errcode = 'ASM01';
  end if;

  if p_id is null then
    insert into public.assessment_schemes (school_id, name, description)
    values (v_school, btrim(p_name), nullif(btrim(coalesce(p_description, '')), '')) returning id into v_id;
  else
    update public.assessment_schemes set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), '')
     where id = p_id and school_id = v_school returning id into v_id;
    if v_id is null then raise exception 'That scheme was not found.' using errcode = 'ASM01'; end if;
  end if;

  for c in select value from jsonb_array_elements(p_components) loop
    v_pos := v_pos + 1;
    v_name := btrim(c->>'name');
    v_feeds := case when c->>'feeds' = 'exam' then 'exam' else 'ca' end;
    v_w := (c->>'weight')::numeric;
    v_method := coalesce(c->>'method', 'average');
    v_best := case when v_method = 'best_n' then nullif(c->>'bestN', '')::int else null end;
    v_missing := case when c->>'missing' = 'zero' then 'zero' else 'skip' end;
    if nullif(c->>'id', '') is not null then
      v_cid := (c->>'id')::uuid;
      update public.assessment_components
         set name = v_name, feeds = v_feeds, weight = v_w, method = v_method, best_n = v_best, missing = v_missing, sort = v_pos
       where id = v_cid and scheme_id = v_id;
      if not found then raise exception 'A part of this scheme was not found.' using errcode = 'ASM01'; end if;
    else
      insert into public.assessment_components (school_id, scheme_id, name, feeds, weight, method, best_n, missing, sort)
      values (v_school, v_id, v_name, v_feeds, v_w, v_method, v_best, v_missing, v_pos) returning id into v_cid;
    end if;
    v_keep := v_keep || v_cid;
  end loop;

  for r in select k.id, k.name from public.assessment_components k where k.scheme_id = v_id and k.id <> all (v_keep) loop
    if exists (select 1 from public.assessments a where a.component_id = r.id) then
      raise exception 'The part "%" has assessments in it. Move them to another part first.', r.name using errcode = 'ASM01';
    end if;
    delete from public.assessment_components where id = r.id;
  end loop;

  -- Everyone using this scheme gets their results recalculated.
  for cls in
    select c2.id from public.classes c2 join public.levels l on l.id = c2.level_id
     where coalesce(c2.assessment_scheme_id, l.assessment_scheme_id) = v_id
  loop
    perform public.recompute_class_results(cls);
  end loop;
  return v_id;
end $$;

create function public.delete_assessment_scheme(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_school uuid := public.current_school_id();
begin
  if not public.has_capability('grades.manage_assessment_schemes') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.levels where assessment_scheme_id = p_id) or exists (select 1 from public.classes where assessment_scheme_id = p_id) then
    raise exception 'Some levels or classes still use this scheme. Take it away from them first.' using errcode = 'ASM01';
  end if;
  if exists (select 1 from public.assessments a join public.assessment_components k on k.id = a.component_id where k.scheme_id = p_id) then
    raise exception 'Some assessments are still in this scheme. Move them first.' using errcode = 'ASM01';
  end if;
  delete from public.assessment_schemes where id = p_id and school_id = v_school;
  if not found then raise exception 'That scheme was not found.' using errcode = 'ASM01'; end if;
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function public._scheme_of_class(uuid) from public, anon, authenticated;
revoke execute on function public.recompute_class_results(uuid) from public, anon, authenticated;
revoke execute on function public.assessments_check_component() from public, anon, authenticated;
revoke execute on function public.scheme_assignment_guard() from public, anon, authenticated;
revoke execute on function public.level_scheme_changed() from public, anon, authenticated;
revoke execute on function public.class_scheme_changed() from public, anon, authenticated;
revoke execute on function public.set_assessment_scheme(uuid, uuid, uuid) from public, anon;
revoke execute on function public.save_assessment_scheme(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.delete_assessment_scheme(uuid) from public, anon;
grant execute on function public.set_assessment_scheme(uuid, uuid, uuid) to authenticated;
grant execute on function public.save_assessment_scheme(uuid, text, text, jsonb) to authenticated;
grant execute on function public.delete_assessment_scheme(uuid) to authenticated;
