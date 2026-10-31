-- Remove a user's records in one transaction. Used only by the manage-users
-- Edge Function (service role). If anything still references the user (for
-- example attendance they marked), a foreign key stops it and nothing changes,
-- so the caller can tell the admin to deactivate instead.
create function public.delete_user_records(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.guardians set profile_id = null where profile_id = p_profile;
  update public.students set profile_id = null where profile_id = p_profile;
  delete from public.staff where profile_id = p_profile;
  delete from public.user_roles where profile_id = p_profile;
  delete from public.profiles where id = p_profile;
end $$;

revoke execute on function public.delete_user_records(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_records(uuid) to service_role;
