-- Address security advisor findings on the first release.

-- Pin search_path on the two plain trigger functions.
alter function public.set_updated_at() set search_path = public;
alter function public.scores_check_max() set search_path = public;

-- RLS helper functions are only needed by signed-in users (policies are
-- `to authenticated`). Remove anonymous RPC access to them.
revoke execute on function public.current_school_id() from public, anon;
revoke execute on function public.has_role(public.app_role) from public, anon;
revoke execute on function public.has_any_role(public.app_role[]) from public, anon;
revoke execute on function public.my_staff_id() from public, anon;
revoke execute on function public.my_student_id() from public, anon;
revoke execute on function public.is_guardian_of(uuid) from public, anon;
revoke execute on function public.teaches_class(uuid) from public, anon;
revoke execute on function public.teaches_class_subject(uuid) from public, anon;
revoke execute on function public.can_view_enrollment(uuid) from public, anon;
revoke execute on function public.can_teach_enrollment(uuid) from public, anon;

grant execute on function public.current_school_id() to authenticated;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.has_any_role(public.app_role[]) to authenticated;
grant execute on function public.my_staff_id() to authenticated;
grant execute on function public.my_student_id() to authenticated;
grant execute on function public.is_guardian_of(uuid) to authenticated;
grant execute on function public.teaches_class(uuid) to authenticated;
grant execute on function public.teaches_class_subject(uuid) to authenticated;
grant execute on function public.can_view_enrollment(uuid) to authenticated;
grant execute on function public.can_teach_enrollment(uuid) to authenticated;
