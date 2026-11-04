-- The staff a person may mark, or choose to take attendance: for those who set clock-in up or take attendance.
create function public.clockin_staff() returns table (id uuid, full_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.feature_enabled('clockin') or not (public.has_capability('clockin.manage') or public.is_clockin_taker()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select p.id, p.full_name from public.profiles p join public.user_roles ur on ur.profile_id = p.id
   where p.school_id = public.current_school_id() and p.is_active
     and ur.role in ('school_admin', 'principal', 'teacher', 'hr_officer', 'accountant', 'librarian', 'receptionist')
   group by p.id, p.full_name order by p.full_name;
end $$;
revoke execute on function public.clockin_staff() from public, anon;
grant execute on function public.clockin_staff() to authenticated;
