-- Per-school messaging settings. For now: the SMS sender ID, so it can be set in
-- the app instead of only as a server secret. The API key stays a server secret:
-- anything stored where the browser can read it is readable by anyone.
--
-- When a school has no sender ID of its own the messaging function falls back to
-- the server-wide ARKESEL_SENDER_ID secret.

create table public.message_settings (
  school_id uuid primary key default public.current_school_id() references public.schools (id),
  -- What recipients see as the sender. Arkesel sender IDs are 3 to 11 letters or
  -- digits and must be approved in the Arkesel dashboard before they will deliver.
  sender_id text check (sender_id ~ '^[A-Za-z0-9]{3,11}$'),
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.message_settings
  for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.message_settings
  for each row execute function public.audit_row();

alter table public.message_settings enable row level security;

-- Everyone who can use messaging may see which sender ID is in force; only an
-- administrator or principal (or a developer) may change it.
create policy message_settings_read on public.message_settings for select to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','principal','accountant']::public.app_role[]));
create policy message_settings_write on public.message_settings for all to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','principal']::public.app_role[]))
  with check (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','principal']::public.app_role[]));
