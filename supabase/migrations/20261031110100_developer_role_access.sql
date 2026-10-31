-- `developer` supersedes `school_admin`: anything school_admin may do, a
-- developer may do, because both role helpers treat developer as satisfying a
-- school_admin check. Policies need no changes for that.

create or replace function public.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where profile_id = auth.uid()
      and (role = r or (r = 'school_admin' and role = 'developer'))
  )
$$;

create or replace function public.has_any_role(roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where profile_id = auth.uid()
      and (role = any (roles)
           or (role = 'developer' and 'school_admin' = any (roles)))
  )
$$;

-- True only for an actual developer (not for a school_admin).
create function public.is_developer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where profile_id = auth.uid() and role = 'developer'
  )
$$;

revoke execute on function public.is_developer() from public, anon;
grant execute on function public.is_developer() to authenticated;

-- Closing a privilege-escalation gap: a school_admin could previously grant any
-- role, including super_admin. Now only a developer may grant, change or remove
-- the developer and super_admin roles.
drop policy user_roles_write on public.user_roles;

create policy user_roles_write on public.user_roles for all to authenticated
  using (
    school_id = public.current_school_id()
    and public.has_role('school_admin')
    and (role not in ('developer', 'super_admin') or public.is_developer())
  )
  with check (
    school_id = public.current_school_id()
    and public.has_role('school_admin')
    and (role not in ('developer', 'super_admin') or public.is_developer())
  );
