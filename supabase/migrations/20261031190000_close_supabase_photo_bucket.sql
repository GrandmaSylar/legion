-- Photos now live in Cloudinary, reached only through the student-photo Edge
-- Function. Remove every client access rule on the old Supabase bucket so it
-- cannot be used. (Supabase does not allow deleting a bucket with SQL; the empty
-- `student-photos` bucket can be removed from the dashboard.)
drop policy student_photos_read on storage.objects;
drop policy student_photos_write on storage.objects;
