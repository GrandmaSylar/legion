-- Step 2 of the move from roles to actions.
--
-- 1. Giving a person a role gives them that role's preset of actions, and taking a role away
--    removes the actions only that role provided. Actions added to a person by hand stay.
--    This keeps new logins working whichever way they are created.
-- 2. The Messages module is the first to be decided by actions instead of roles. Every
--    existing role holds exactly the actions it needs to behave as before (see the presets).

-- ── Roles keep the presets in step ──────────────────────────────────────────
create function public.user_roles_sync_capabilities() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.user_capabilities (profile_id, capability, school_id)
      select new.profile_id, p.capability, new.school_id
      from public.access_preset_capabilities p where p.role = new.role
      on conflict (profile_id, capability) do nothing;
  else
    -- After a role is removed, drop only the actions that no remaining role still provides.
    delete from public.user_capabilities uc
     where uc.profile_id = old.profile_id
       and uc.capability in (select capability from public.access_preset_capabilities where role = old.role)
       and not exists (
         select 1 from public.user_roles r
         join public.access_preset_capabilities p on p.role = r.role
         where r.profile_id = old.profile_id and p.capability = uc.capability
       );
  end if;
  return null;
end $$;

create trigger user_roles_sync_capabilities_ins after insert on public.user_roles
  for each row execute function public.user_roles_sync_capabilities();
create trigger user_roles_sync_capabilities_del after delete on public.user_roles
  for each row execute function public.user_roles_sync_capabilities();
revoke all on function public.user_roles_sync_capabilities() from public, anon, authenticated;

-- Holds at least one of these actions? (A developer holds every action.)
create function public.has_any_capability(p_caps text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_developer() or exists (
    select 1 from public.user_capabilities uc
    where uc.profile_id = auth.uid() and uc.capability = any (p_caps)
      and (uc.expires_at is null or uc.expires_at > now())
  )
$$;
revoke all on function public.has_any_capability(text[]) from public, anon;
grant execute on function public.has_any_capability(text[]) to authenticated;

-- ── Messages, decided by actions ────────────────────────────────────────────
drop policy message_templates_read on public.message_templates;
drop policy message_templates_write on public.message_templates;
drop policy message_batches_read on public.message_batches;
drop policy messages_read on public.messages;
drop policy message_settings_read on public.message_settings;
drop policy message_settings_write on public.message_settings;

create policy message_templates_read on public.message_templates for select to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_capability(array['messages.view_log','messages.send_all','messages.send_fee_reminders','messages.manage_templates']));
create policy message_templates_write on public.message_templates for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('messages.manage_templates'))
  with check (school_id = public.current_school_id() and public.has_capability('messages.manage_templates'));

create policy message_batches_read on public.message_batches for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('messages.view_log'));
create policy messages_read on public.messages for select to authenticated
  using (school_id = public.current_school_id() and public.has_capability('messages.view_log'));

create policy message_settings_read on public.message_settings for select to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_capability(array['messages.view_log','messages.send_all','messages.send_fee_reminders','messages.manage_setup']));
create policy message_settings_write on public.message_settings for all to authenticated
  using (school_id = public.current_school_id() and public.has_capability('messages.manage_setup'))
  with check (school_id = public.current_school_id() and public.has_capability('messages.manage_setup'));
