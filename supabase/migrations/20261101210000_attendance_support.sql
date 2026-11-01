-- Support for the Attendance screens, plus RPC permission hardening.

-- Harden set_my_theme so anonymous callers cannot invoke it.
revoke execute on function public.set_my_theme(jsonb) from public, anon;
grant execute on function public.set_my_theme(jsonb) to authenticated;

-- Stamp who marked or updated an attendance row on the server so the browser
-- cannot spoof marked_by.
create or replace function public.attendance_stamp_marker() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.marked_by := auth.uid();
  end if;
  return new;
end $$;

revoke execute on function public.attendance_stamp_marker() from public, anon, authenticated;

drop trigger if exists attendance_stamp_marker on public.attendance;
create trigger attendance_stamp_marker
before insert or update on public.attendance
for each row execute function public.attendance_stamp_marker();
