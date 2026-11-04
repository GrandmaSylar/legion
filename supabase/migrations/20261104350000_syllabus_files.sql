-- Syllabus documents: a PDF of a syllabus that staff can read.
--
-- The files live in a PRIVATE storage bucket, one folder per school, then per subject and level:
--   <school id>/<subject id>/<level id>/<random>.pdf
-- Only PDFs up to 10 MB are accepted, by the bucket itself. People who manage the syllabus upload and remove files;
-- people who may see the syllabus read them, and only in their own school's folder. A file is opened through a
-- short-lived link the app asks for, never a public address. A row in syllabus_documents gives each file a title and
-- is what the screen lists; it can only be added for a file that is really in the bucket, in the right folder.

-- ── The bucket ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('syllabus-files', 'syllabus-files', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

-- Who may touch the files: the first folder of the path must be the signed-in person's own school.
create policy syllabus_files_read on storage.objects for select to authenticated
  using (bucket_id = 'syllabus-files' and (storage.foldername(name))[1] = public.current_school_id()::text
         and public.feature_enabled('lessons') and public.has_any_capability(array['lessons.view_syllabus', 'lessons.manage_syllabus']));
create policy syllabus_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'syllabus-files' and (storage.foldername(name))[1] = public.current_school_id()::text
              and public.feature_enabled('lessons') and public.has_capability('lessons.manage_syllabus') and lower(name) like '%.pdf');
create policy syllabus_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'syllabus-files' and (storage.foldername(name))[1] = public.current_school_id()::text
         and public.feature_enabled('lessons') and public.has_capability('lessons.manage_syllabus'));

-- ── What each file is ───────────────────────────────────────────────────────
create table public.syllabus_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  level_id uuid not null references public.levels (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  file_path text not null unique check (file_path like '%.pdf'),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.syllabus_documents (school_id, subject_id, level_id);
create trigger audit_row after insert or update or delete on public.syllabus_documents for each row execute function public.audit_row();
alter table public.syllabus_documents enable row level security;
create policy syllabus_documents_read on public.syllabus_documents for select to authenticated
  using (school_id = public.current_school_id() and public.feature_enabled('lessons')
         and public.has_any_capability(array['lessons.view_syllabus', 'lessons.manage_syllabus']));
revoke insert, update, delete on public.syllabus_documents from authenticated;

-- Record a file that has been uploaded. It must be in this school's folder, for this subject and level, and really be in the bucket.
create function public.add_syllabus_document(p_subject uuid, p_level uuid, p_title text, p_path text) returns uuid
language plpgsql security definer set search_path = public, storage as $$
declare v_school uuid := public.current_school_id(); v_id uuid; v_size bigint;
begin
  if v_school is null or not public.feature_enabled('lessons') or not public.has_capability('lessons.manage_syllabus') then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'Give the document a title.' using errcode = 'LPN01'; end if;
  if not exists (select 1 from public.subjects where id = p_subject and school_id = v_school) then raise exception 'That subject was not found.' using errcode = 'LPN01'; end if;
  if not exists (select 1 from public.levels where id = p_level and school_id = v_school) then raise exception 'That level was not found.' using errcode = 'LPN01'; end if;
  if p_path is null or p_path !~ ('^' || v_school::text || '/' || p_subject::text || '/' || p_level::text || '/[0-9a-f-]{36}\.pdf$') then
    raise exception 'That file is not in the right place for this subject and level.' using errcode = 'LPN01'; end if;
  select coalesce((metadata ->> 'size')::bigint, 0) into v_size from storage.objects where bucket_id = 'syllabus-files' and name = p_path;
  if not found then raise exception 'The file was not uploaded. Try again.' using errcode = 'LPN01'; end if;
  if v_size <= 0 or v_size > 10485760 then raise exception 'A syllabus file can be up to 10 MB.' using errcode = 'LPN01'; end if;
  insert into public.syllabus_documents (school_id, subject_id, level_id, title, file_path, size_bytes) values (v_school, p_subject, p_level, btrim(p_title), p_path, v_size) returning id into v_id;
  return v_id;
end $$;

-- Forget a document. The app removes the file from the bucket first; this removes the listing.
create function public.delete_syllabus_document(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.feature_enabled('lessons') or not public.has_capability('lessons.manage_syllabus') then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.syllabus_documents where id = p_id and school_id = public.current_school_id();
end $$;

revoke execute on function public.add_syllabus_document(uuid, uuid, text, text) from public, anon;
revoke execute on function public.delete_syllabus_document(uuid) from public, anon;
grant execute on function public.add_syllabus_document(uuid, uuid, text, text) to authenticated;
grant execute on function public.delete_syllabus_document(uuid) to authenticated;
