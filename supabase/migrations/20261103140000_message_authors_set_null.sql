-- Deleting a login must not be blocked because that person once sent a message or
-- saved the sender ID. Keep the history and forget who did it, as the other tables do.

alter table public.message_settings drop constraint message_settings_updated_by_fkey,
  add constraint message_settings_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null;
alter table public.message_batches drop constraint message_batches_created_by_fkey,
  add constraint message_batches_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;
alter table public.messages drop constraint messages_created_by_fkey,
  add constraint messages_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;
