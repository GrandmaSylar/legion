-- One person's entries for one day, for the register's "mark by hand" screen, so a mistaken entry can be seen
-- and removed. For those who see the register or take attendance.
create function public.clockin_day_entries(p_profile uuid, p_day date)
returns table (id uuid, kind text, captured_at timestamptz, source text, flags text[], note text, marked_by_name text)
language plpgsql stable security definer set search_path = public as $$
declare s public.clockin_settings;
begin
  if not public.feature_enabled('clockin') then raise exception 'not allowed' using errcode = '42501'; end if;
  s := public._clockin_settings();
  if not (public.has_capability('clockin.view_all') or public.has_capability('clockin.manage')
          or (s.mode in ('taker', 'both') and public.is_clockin_taker())) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select e.id, e.kind, e.captured_at, e.source, e.flags, e.note, mp.full_name
    from public.clockin_events e left join public.profiles mp on mp.id = e.marked_by
   where e.school_id = public.current_school_id() and e.profile_id = p_profile and e.day = p_day
   order by e.captured_at;
end $$;
revoke execute on function public.clockin_day_entries(uuid, date) from public, anon;
grant execute on function public.clockin_day_entries(uuid, date) to authenticated;
