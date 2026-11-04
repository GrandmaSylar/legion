-- A deactivated account holds no school, so it must not get as far as the clock-in set-up.
-- Every clock-in function that writes or reads the set-up goes through this helper.
create or replace function public._clockin_settings() returns public.clockin_settings
language plpgsql security definer set search_path = public as $$
declare s public.clockin_settings;
begin
  if public.current_school_id() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into s from public.clockin_settings where school_id = public.current_school_id();
  if not found then
    insert into public.clockin_settings (school_id) values (public.current_school_id()) on conflict do nothing;
    select * into s from public.clockin_settings where school_id = public.current_school_id();
  end if;
  return s;
end $$;
