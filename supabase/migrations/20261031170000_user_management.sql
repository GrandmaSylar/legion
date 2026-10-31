-- User management support.

-- is_active: a deactivated account keeps its history but can no longer reach any
-- data. modules: which sections a user has switched on. NULL means every section
-- their role allows. Modules only narrow what the role permits; row level
-- security is still decided by role.
alter table public.profiles
  add column is_active boolean not null default true,
  add column modules text[];

-- A deactivated user has no school, so every school-scoped policy denies them
-- immediately, even while an old session token is still valid.
create or replace function public.current_school_id() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.profiles where id = auth.uid() and is_active
$$;

create trigger audit_row after insert or update or delete on public.profiles
for each row execute function public.audit_row();
