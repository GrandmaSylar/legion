-- One list for subjects and learning areas. A creche to KG 2 "learning area" is
-- a subject graded with written remarks; the level's grading scale decides how
-- each is graded, so a separate table only duplicated the list.

-- Keep every existing learning area as a subject.
insert into public.subjects (school_id, name, is_active)
select school_id, name, is_active from public.learning_areas
on conflict (school_id, name) do nothing;

-- Point remarks at subjects.
alter table public.term_remarks add column subject_id uuid references public.subjects (id);

update public.term_remarks tr
set subject_id = s.id
from public.learning_areas la
join public.subjects s on s.school_id = la.school_id and s.name = la.name
where la.id = tr.learning_area_id;

drop index public.term_remarks_one_per_area;
drop index public.term_remarks_one_overall;
alter table public.term_remarks drop column learning_area_id;

-- One remark per subject per term, plus one overall remark (subject_id null).
create unique index term_remarks_one_per_subject
  on public.term_remarks (enrollment_id, term_id, subject_id)
  where subject_id is not null;
create unique index term_remarks_one_overall
  on public.term_remarks (enrollment_id, term_id)
  where subject_id is null;
create index on public.term_remarks (subject_id);

drop table public.learning_areas;
