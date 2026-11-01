-- Support for the Notice Board (announcements) and Parent/Student Portal.

alter table public.announcements
  add column if not exists author_name text,
  add column if not exists pinned boolean not null default false;

-- Stamp posted_by and author_name automatically from public.profiles so all
-- readers (including parents and students) can see who posted the notice.
create or replace function public.announcements_stamp_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.posted_by is null then
    new.posted_by := auth.uid();
  end if;
  if new.posted_by is not null and (new.author_name is null or new.author_name = '') then
    select full_name into new.author_name
    from public.profiles
    where id = new.posted_by;
  end if;
  return new;
end $$;

drop trigger if exists announcements_stamp_author on public.announcements;
create trigger announcements_stamp_author
before insert or update on public.announcements
for each row execute function public.announcements_stamp_author();

-- Backfill author_name for any existing rows.
update public.announcements a
set author_name = p.full_name
from public.profiles p
where a.posted_by = p.id
  and a.author_name is null;

-- Update RLS policies on public.announcements:
-- 1. school_admin and principal can read & write all school announcements (including drafts).
-- 2. teachers can read/write class announcements for classes they teach (including their own drafts),
--    and read published 'all' and 'staff' announcements.
-- 3. parents can read published 'all', 'parents', and their children's 'class' announcements.
-- 4. students can read published 'all' and their enrolled 'class' announcements.
-- 5. other staff can read published 'all' and 'staff' announcements.

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (
    school_id = public.current_school_id()
    and (
      public.has_any_role(array['school_admin','principal']::public.app_role[])
      or (
        public.has_role('teacher')
        and audience = 'class'
        and public.teaches_class(class_id)
      )
      or (
        published_at is not null and published_at <= now()
        and (
          audience = 'all'
          or (audience = 'staff' and public.has_any_role(array[
                'principal','teacher','hr_officer','accountant','librarian','receptionist'
              ]::public.app_role[]))
          or (audience = 'parents' and public.has_role('parent'))
          or (audience = 'class' and (
                (public.has_role('teacher') and public.teaches_class(class_id))
                or (public.has_role('parent') and exists (
                      select 1 from public.enrollments e
                      where e.class_id = announcements.class_id
                        and public.is_guardian_of(e.student_id)))
                or (public.has_role('student') and exists (
                      select 1 from public.enrollments e
                      where e.class_id = announcements.class_id
                        and e.student_id = public.my_student_id()))
             ))
        )
      )
    )
  );

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all to authenticated
  using (
    school_id = public.current_school_id()
    and (
      public.has_any_role(array['school_admin','principal']::public.app_role[])
      or (
        public.has_role('teacher')
        and audience = 'class'
        and class_id is not null
        and public.teaches_class(class_id)
      )
    )
  )
  with check (
    school_id = public.current_school_id()
    and (
      public.has_any_role(array['school_admin','principal']::public.app_role[])
      or (
        public.has_role('teacher')
        and audience = 'class'
        and class_id is not null
        and public.teaches_class(class_id)
      )
    )
  );

revoke execute on function public.announcements_stamp_author() from public, anon, authenticated;
