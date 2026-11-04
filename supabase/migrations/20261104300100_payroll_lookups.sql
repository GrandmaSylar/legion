-- Names for payroll screens, without opening the tables behind them.

-- People who hold the approve action: who a school may name at an approval step.
create function public.payroll_approver_choices() returns table (id uuid, full_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._payroll_on() or not public.has_any_capability(array['payroll.configure', 'payroll.view_all']) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select distinct p.id, p.full_name from public.user_capabilities uc join public.profiles p on p.id = uc.profile_id and p.is_active
   where uc.school_id = public.current_school_id() and uc.capability = 'payroll.approve' order by p.full_name;
end $$;

-- What was done to a run, with who did it.
create function public.payroll_run_history(p_run uuid) returns table (actor_name text, action text, detail text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.full_name, l.action, l.detail, l.at from public.payroll_log l left join public.profiles p on p.id = l.actor_id
   where l.run_id = p_run and l.school_id = public.current_school_id() and public._payroll_sees() order by l.at $$;

-- Who has signed a run, at which step.
create function public.payroll_run_signatures(p_run uuid) returns table (step_label text, signed_by text, at timestamptz, comment text)
language sql stable security definer set search_path = public as $$
  select s.label, p.full_name, a.at, a.comment from public.payroll_run_approvals a
    left join public.payroll_approval_steps s on s.id = a.step_id left join public.profiles p on p.id = a.approved_by
   where a.run_id = p_run and a.school_id = public.current_school_id() and public._payroll_sees() order by a.at $$;

revoke execute on function public.payroll_approver_choices() from public, anon;
revoke execute on function public.payroll_run_history(uuid) from public, anon;
revoke execute on function public.payroll_run_signatures(uuid) from public, anon;
grant execute on function public.payroll_approver_choices() to authenticated;
grant execute on function public.payroll_run_history(uuid) to authenticated;
grant execute on function public.payroll_run_signatures(uuid) to authenticated;
