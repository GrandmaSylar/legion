-- Switching an exam timetable off quietly takes it back to a draft. The guard that stops a timetable being
-- published by editing the period directly must not count that as an unauthorised change.
create or replace function public.exam_periods_guard_publish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.use_timetable then
    new.timetable_published := false;
    return new;
  end if;
  if new.timetable_published is distinct from old.timetable_published and coalesce(current_setting('legion.exam_publish', true), '') <> 'on' then
    raise exception 'Publish the timetable from the exam timetable screen, so parents and pupils are told.' using errcode = 'EXT01';
  end if;
  return new;
end $$;
