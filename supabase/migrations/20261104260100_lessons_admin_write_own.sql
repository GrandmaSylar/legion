-- The head and the principal hold the "write lesson plans" action too.
--
-- A person may only give a role whose whole set of actions they hold, so an administrator who lacked this
-- action could no longer give anyone the Teacher role. Holding it lets them write plans only for the
-- classes and subjects they actually teach, exactly as before.
insert into public.access_preset_capabilities (role, capability) values
  ('school_admin', 'lessons.write_own'), ('principal', 'lessons.write_own')
on conflict do nothing;
insert into public.user_capabilities (profile_id, capability, school_id)
  select ur.profile_id, 'lessons.write_own', ur.school_id from public.user_roles ur
  where ur.role in ('school_admin', 'principal')
on conflict (profile_id, capability) do nothing;
