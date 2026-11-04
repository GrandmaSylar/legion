-- The clock-in register leaves out holidays.
--
-- It already left out weekends. It now also leaves out any weekday the school calendar marks as a holiday for staff
-- (a PUBLISHED calendar event of the kind "holiday", for everyone or for staff), so nobody is shown as absent on a
-- day the school was closed. A day on which someone did clock in or was marked in is still shown, so work done on a
-- holiday is never hidden. If the calendar module is switched off, no holidays are known and only weekends are left out.
create or replace function public.clockin_roster(p_from date, p_to date)
returns table (day date, profile_id uuid, full_name text, first_in timestamptz, last_out timestamptz, flags text[], events int, status text, marked boolean)
language plpgsql stable security definer set search_path = public as $$
declare s public.clockin_settings; v_cal boolean;
begin
  if not public.feature_enabled('clockin') then raise exception 'not allowed' using errcode = '42501'; end if;
  s := public._clockin_settings();
  if not (public.has_capability('clockin.view_all') or public.has_capability('clockin.manage')
          or (s.mode in ('taker', 'both') and public.is_clockin_taker())) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_to < p_from or p_to - p_from > 92 then raise exception 'Choose up to 92 days.' using errcode = 'CLK01'; end if;
  if not (public.has_capability('clockin.view_all') or public.has_capability('clockin.manage')) and p_from < public._clockin_today() - 14 then
    raise exception 'You can see up to 14 days back.' using errcode = 'CLK01';
  end if;
  v_cal := public.feature_enabled('calendar');
  return query
  with staff as (
    select p.id, p.full_name from public.profiles p join public.user_roles ur on ur.profile_id = p.id
     where p.school_id = public.current_school_id() and p.is_active
       and ur.role in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
     group by p.id, p.full_name),
  days as (
    select d::date as d from generate_series(p_from, least(p_to, public._clockin_today()), interval '1 day') g(d)
     where extract(isodow from d) <= 5
       and (not v_cal
            or not exists (select 1 from public.calendar_events h
                            where h.school_id = public.current_school_id() and h.kind = 'holiday' and h.published and h.audience in ('all', 'staff')
                              and h.starts_on <= d::date and h.ends_on >= d::date)
            or exists (select 1 from public.clockin_events c where c.school_id = public.current_school_id() and c.day = d::date))),
  ev as (
    select e.day, e.profile_id, min(e.captured_at) filter (where e.kind = 'in') as fi, max(e.captured_at) filter (where e.kind = 'out') as lo,
           count(*)::int as n, bool_or(e.source = 'marked') as mk,
           coalesce(array_agg(distinct f) filter (where f is not null), '{}') as fl
      from public.clockin_events e left join lateral unnest(e.flags) f on true
     where e.school_id = public.current_school_id() and e.day between p_from and p_to
     group by e.day, e.profile_id)
  select days.d, staff.id, staff.full_name, ev.fi, ev.lo, coalesce(ev.fl, '{}'::text[]), coalesce(ev.n, 0),
         case when ev.n is null then 'absent' when 'late' = any (ev.fl) then 'late' else 'present' end,
         coalesce(ev.mk, false)
    from days cross join staff left join ev on ev.day = days.d and ev.profile_id = staff.id
   order by days.d desc, staff.full_name;
end $$;
