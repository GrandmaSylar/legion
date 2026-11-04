-- RLS role tests. Run against the linked project:
--   supabase db query --linked -f supabase/tests/rls.sql
--
-- Everything happens inside one transaction that always ends in an error, so
-- nothing is ever saved. The error's DETAIL lists the results: "FAIL" lines are
-- broken expectations. Users are simulated by setting the JWT subject and
-- switching to the `authenticated` role, the same path the API uses.

begin;

-- Run a count as a user (null = anonymous) and return it.
create function pg_temp.t_count(u uuid, tbl text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  if u is null then
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
  execute format('select count(*) from public.%I', tbl) into n;
  reset role;
  return n;
exception when others then
  reset role;
  return -1; -- permission denied
end $$;

-- Run a write as a user. Returns 'ok:<rows>' or 'denied'. A policy that hides
-- rows from an UPDATE/DELETE shows up as 'ok:0'.
create function pg_temp.t_try(u uuid, stmt text) returns text
language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute stmt;
  get diagnostics n = row_count;
  reset role;
  return 'ok:' || n;
exception when others then
  reset role;
  return 'denied';
end $$;

-- Evaluate a query at the moment this call runs and return its single value as text.
create function pg_temp.t_scalar(q text) returns text
language plpgsql as $$
declare v text;
begin
  execute q into v;
  return coalesce(v, 'null');
end $$;

-- Run a statement without signing in. Returns 'ok:<rows>' or 'denied'.
create function pg_temp.t_anon(stmt text) returns text
language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  execute stmt;
  get diagnostics n = row_count;
  reset role;
  return 'ok:' || n;
exception when others then
  reset role;
  return 'denied';
end $$;

do $$
declare
  a uuid; b uuid; yr uuid; term uuid; lvl uuid; c1 uuid; c2 uuid; subj uuid; cs1 uuid; asm uuid;
  s1 uuid; s2 uuid; s3 uuid; e1 uuid; e2 uuid; t1 uuid; t2 uuid; g1 uuid; g2 uuid; i1 uuid; i2 uuid;
  u_admin uuid := gen_random_uuid();  u_prin uuid := gen_random_uuid();
  u_t1 uuid := gen_random_uuid();     u_t2 uuid := gen_random_uuid();
  u_acc uuid := gen_random_uuid();    u_hr uuid := gen_random_uuid();
  u_rec uuid := gen_random_uuid();    u_p1 uuid := gen_random_uuid();
  u_p2 uuid := gen_random_uuid();     u_s1 uuid := gen_random_uuid();
  u_adminb uuid := gen_random_uuid();  u_dev uuid := gen_random_uuid();  u_off uuid := gen_random_uuid();
  fails text := ''; passes int := 0; got text;
  rs int; rg int; rst int; yr_del uuid; cls_del uuid; su uuid; eu uuid; gu uuid; ecat uuid; mb uuid; rm int; rb int; rt int; ra int; ri int; rpay int; rop int; pon uuid; pcash uuid;
  r record;
begin
  select id into a from public.schools where name = 'Pinks Academy';
  select count(*) into rs from public.students where school_id = a and deleted_at is null;
  select count(*) into rg from public.guardians where school_id = a and deleted_at is null;
  select count(*) into rst from public.staff where school_id = a and deleted_at is null;
  insert into public.schools (name) values ('Other School') returning id into b;

  -- auth users + profiles + roles
  for r in select * from (values
    (u_admin,'admin',a,'school_admin'),(u_prin,'principal',a,'principal'),
    (u_t1,'teacher1',a,'teacher'),(u_t2,'teacher2',a,'teacher'),
    (u_acc,'accountant',a,'accountant'),(u_hr,'hr',a,'hr_officer'),
    (u_rec,'reception',a,'receptionist'),(u_p1,'parent1',a,'parent'),
    (u_p2,'parent2',a,'parent'),(u_s1,'student1',a,'student'),
    (u_adminb,'adminb',b,'school_admin'),(u_dev,'developer',a,'developer'),(u_off,'deactivated',a,'school_admin')
  ) as x(id, nm, sch, rl)
  loop
    insert into auth.users (id, email, aud, role) values (r.id, r.nm || '@test.local', 'authenticated', 'authenticated');
    insert into public.profiles (id, school_id, full_name) values (r.id, r.sch, r.nm);
    insert into public.user_roles (profile_id, school_id, role) values (r.id, r.sch, r.rl::public.app_role);
  end loop;

  -- structure and people (school A)
  update public.profiles set is_active = false where id = u_off;
  insert into public.academic_years (school_id,name,start_date,end_date,is_current) values (a,'T','2026-09-01','2027-07-31',false) returning id into yr;
  insert into public.terms (school_id,academic_year_id,name,start_date,end_date) values (a,yr,'Term 1','2026-09-01','2026-12-15') returning id into term;
  select id into lvl from public.levels where school_id = a and name = 'Basic 4';
  insert into public.staff (school_id,profile_id,full_name,type) values (a,u_t1,'teacher1','teaching') returning id into t1;
  insert into public.staff (school_id,profile_id,full_name,type) values (a,u_t2,'teacher2','teaching') returning id into t2;
  insert into public.classes (school_id,level_id,academic_year_id,section,class_teacher_id) values (a,lvl,yr,'A',t1) returning id into c1;
  insert into public.classes (school_id,level_id,academic_year_id,section,class_teacher_id) values (a,lvl,yr,'B',t2) returning id into c2;
  insert into public.subjects (school_id,name) values (a,'Maths') returning id into subj;
  insert into public.class_subjects (school_id,class_id,subject_id,teacher_id) values (a,c1,subj,t1) returning id into cs1;
  insert into public.assessments (school_id,class_subject_id,term_id,type,max_score,weight) values (a,cs1,term,'ca_test',20,30) returning id into asm;

  insert into public.students (school_id,first_name,last_name,profile_id) values (a,'Ama','S1',u_s1) returning id into s1;
  insert into public.students (school_id,first_name,last_name) values (a,'Kofi','S2') returning id into s2;
  insert into public.number_sequences (school_id,kind,format) values (b,'admission_no','B/{NNNN}');
  insert into public.students (school_id,first_name,last_name) values (b,'Yaw','S3') returning id into s3;
  insert into public.guardians (school_id,profile_id,full_name) values (a,u_p1,'g1') returning id into g1;
  insert into public.guardians (school_id,profile_id,full_name) values (a,u_p2,'g2') returning id into g2;
  insert into public.student_guardians (school_id,student_id,guardian_id) values (a,s1,g1),(a,s2,g2);
  insert into public.enrollments (school_id,student_id,class_id,academic_year_id) values (a,s1,c1,yr) returning id into e1;
  insert into public.enrollments (school_id,student_id,class_id,academic_year_id) values (a,s2,c2,yr) returning id into e2;
  insert into public.attendance (school_id,enrollment_id,date,status) values (a,e1,current_date,'present'),(a,e2,current_date,'absent');
  insert into public.bece_registrations (school_id,student_id,exam_year) values (a,s1,2027);
  select count(*) into ra from public.attendance where school_id = a;
  select count(*) into ri from public.invoices where school_id = a;
  select count(*) into rpay from public.payments where school_id = a;
  select count(*) into rop from public.online_payments where school_id = a;
  select count(*) into rm from public.messages where school_id = a;
  select count(*) into rb from public.message_batches where school_id = a;
  select count(*) into rt from public.message_templates where school_id = a;
  insert into public.message_batches (school_id,title,kind,audience,body_template) values (a,'ZZ batch','custom','custom','x') returning id into mb;
  insert into public.messages (school_id,batch_id,kind,recipient_phone,body) values (a,mb,'custom','233244000000','x');
  insert into public.expense_categories (school_id,name) values (a,'ZZ Category') returning id into ecat;
  -- the staff counter is about to issue S/9000, which is already taken: it must skip it
  update public.number_sequences set next_value = 9000 where school_id = a and kind = 'staff_no';
  insert into public.staff (school_id,full_name,type,staff_no) values (a,'ZZ Taken Number','teaching','S/9000');
  insert into public.academic_years (school_id,name,start_date,end_date) values (a,'DEL','2040-09-01','2041-07-31') returning id into yr_del;
  insert into public.terms (school_id,academic_year_id,name,start_date,end_date) values (a,yr_del,'DelTerm','2040-09-01','2040-12-15');
  insert into public.classes (school_id,level_id,academic_year_id,section) values (a,lvl,yr_del,'DEL') returning id into cls_del;
  insert into public.subjects (school_id,name) values (a,'DelMe');
  insert into public.students (school_id,first_name,last_name) values (a,'Unused','Pupil') returning id into su;
  insert into public.enrollments (school_id,student_id,class_id,academic_year_id) values (a,su,c1,yr) returning id into eu;
  insert into public.guardians (school_id,full_name) values (a,'Only Parent') returning id into gu;
  insert into public.student_guardians (school_id,student_id,guardian_id) values (a,su,gu);

  insert into public.invoices (school_id,student_id,term_id) values (a,s1,term) returning id into i1;
  insert into public.invoices (school_id,student_id,term_id) values (a,s2,term) returning id into i2;
  insert into public.invoice_items (school_id,invoice_id,description,amount) values (a,i1,'Fees',500),(a,i2,'Fees',500);
  insert into public.payments (school_id,invoice_id,amount,method) values (a,i1,100,'cash'),(a,i2,100,'cash');
  insert into public.online_payments (school_id, invoice_id, initiated_by, reference, amount) values (a, i1, u_p1, 'ZZREF1', 10);
  update public.online_payments set needs_review = true, note = 'Overpaid' where reference = 'ZZREF1';
  insert into public.payments (school_id,invoice_id,amount,method,reference) values (a,i2,10,'card','ZZREF4') returning id into pon;
  insert into public.online_payments (school_id, invoice_id, initiated_by, reference, amount, status, payment_id) values (a, i2, u_p2, 'ZZREF4', 10, 'success', pon);
  select id into pcash from public.payments where invoice_id = i2 and method = 'cash' limit 1;

  -- expectation helper: (label, actual, expected)
  for r in select * from (values
    -- students
    ('students admin',      pg_temp.t_count(u_admin,'students')::text,(rs + 3)::text),
    ('students principal',  pg_temp.t_count(u_prin,'students')::text,(rs + 3)::text),
    ('students reception',  pg_temp.t_count(u_rec,'students')::text,(rs + 3)::text),
    ('students accountant', pg_temp.t_count(u_acc,'students')::text,(rs + 3)::text),
    ('students teacher1',   pg_temp.t_count(u_t1,'students')::text,'2'),
    ('students teacher2',   pg_temp.t_count(u_t2,'students')::text,'1'),
    ('students hr',         pg_temp.t_count(u_hr,'students')::text,'0'),
    ('students parent1',    pg_temp.t_count(u_p1,'students')::text,'1'),
    ('students student1',   pg_temp.t_count(u_s1,'students')::text,'1'),
    ('students other school admin', pg_temp.t_count(u_adminb,'students')::text,'1'),
    ('students anonymous',  pg_temp.t_count(null,'students')::text,'0'),
    -- attendance
    ('attendance admin',    pg_temp.t_count(u_admin,'attendance')::text,ra::text),
    ('attendance principal',pg_temp.t_count(u_prin,'attendance')::text,ra::text),
    ('attendance teacher1', pg_temp.t_count(u_t1,'attendance')::text,'1'),
    ('attendance parent1',  pg_temp.t_count(u_p1,'attendance')::text,'1'),
    ('attendance student1', pg_temp.t_count(u_s1,'attendance')::text,'1'),
    ('attendance accountant', pg_temp.t_count(u_acc,'attendance')::text,'0'),
    ('attendance hr',       pg_temp.t_count(u_hr,'attendance')::text,'0'),
    -- finance
    ('invoices admin',      pg_temp.t_count(u_admin,'invoices')::text,(ri + 2)::text),
    ('invoices accountant', pg_temp.t_count(u_acc,'invoices')::text,(ri + 2)::text),
    ('invoices principal',  pg_temp.t_count(u_prin,'invoices')::text,'0'),
    ('invoices teacher1',   pg_temp.t_count(u_t1,'invoices')::text,'0'),
    ('invoices reception',  pg_temp.t_count(u_rec,'invoices')::text,'0'),
    ('invoices parent1',    pg_temp.t_count(u_p1,'invoices')::text,'1'),
    ('payments accountant', pg_temp.t_count(u_acc,'payments')::text,(rpay + 3)::text),
    ('payments principal',  pg_temp.t_count(u_prin,'payments')::text,'0'),
    ('payments parent1',    pg_temp.t_count(u_p1,'payments')::text,'1'),
    ('payments other school admin', pg_temp.t_count(u_adminb,'payments')::text,'0'),
    -- staff, guardians, people
    ('staff admin',         pg_temp.t_count(u_admin,'staff')::text,(rst + 3)::text),
    ('staff hr',            pg_temp.t_count(u_hr,'staff')::text,(rst + 3)::text),
    ('staff parent1',       pg_temp.t_count(u_p1,'staff')::text,'0'),
    ('guardians admin',     pg_temp.t_count(u_admin,'guardians')::text,(rg + 3)::text),
    ('guardians teacher1',  pg_temp.t_count(u_t1,'guardians')::text,'0'),
    ('guardians parent1',   pg_temp.t_count(u_p1,'guardians')::text,'1'),
    ('profiles admin',      pg_temp.t_count(u_admin,'profiles')::text,(select count(*) from public.profiles where school_id = a)::text),
    ('profiles teacher1',   pg_temp.t_count(u_t1,'profiles')::text,'1'),
    ('user_roles teacher1', pg_temp.t_count(u_t1,'user_roles')::text,'1'),
    -- structure is school-scoped
    ('classes teacher1',    pg_temp.t_count(u_t1,'classes')::text,(select count(*) from public.classes where school_id = a)::text),
    ('classes other school admin', pg_temp.t_count(u_adminb,'classes')::text,'0'),
    ('levels parent1',      pg_temp.t_count(u_p1,'levels')::text,'14'),
    -- audit log
    ('audit admin sees rows', (pg_temp.t_count(u_admin,'audit_log') > 0)::text,'true'),
    ('audit teacher1',      pg_temp.t_count(u_t1,'audit_log')::text,'0'),
    -- school B's admin sees only school B's own audit rows (its profile, its role grant and one student)
    ('audit other school admin sees only own school', pg_temp.t_count(u_adminb,'audit_log')::text,'3'),
    -- BECE index numbers
    ('bece admin',          pg_temp.t_count(u_admin,'bece_registrations')::text,'1'),
    ('bece teacher1 sees only own class',       pg_temp.t_count(u_t1,'bece_registrations')::text,'1'),
    ('bece teacher2 sees none',       pg_temp.t_count(u_t2,'bece_registrations')::text,'0'),
    -- developer sees at least everything an admin sees
    ('students developer',  pg_temp.t_count(u_dev,'students')::text,(rs + 3)::text),
    ('attendance developer',pg_temp.t_count(u_dev,'attendance')::text,ra::text),
    ('invoices developer',  pg_temp.t_count(u_dev,'invoices')::text,(ri + 2)::text),
    ('staff developer',     pg_temp.t_count(u_dev,'staff')::text,(rst + 3)::text),
    ('profiles developer',  pg_temp.t_count(u_dev,'profiles')::text,(select count(*) from public.profiles where school_id = a)::text),
    ('developer is scoped to own school', pg_temp.t_count(u_dev,'classes')::text,(select count(*) from public.classes where school_id = a)::text),
    ('students other school admin sees not developer school', pg_temp.t_count(u_adminb,'profiles')::text,'1'),
    -- a deactivated admin keeps their own login row but reaches no school data
    ('deactivated admin sees no students', pg_temp.t_count(u_off,'students')::text,'0'),
    ('deactivated admin sees no classes', pg_temp.t_count(u_off,'classes')::text,'0'),
    ('deactivated admin sees no invoices', pg_temp.t_count(u_off,'invoices')::text,'0'),
    ('deactivated admin sees only own profile', pg_temp.t_count(u_off,'profiles')::text,'1'),
    ('deactivated admin writes a student',
       pg_temp.t_try(u_off, format('insert into public.students (school_id,first_name,last_name) values (%L,''X'',''Y'')', a)), 'denied'),
    -- writes
    ('teacher1 marks own class attendance',
       pg_temp.t_try(u_t1, format('insert into public.attendance (school_id,enrollment_id,date,status) values (%L,%L,current_date + 1,''present'')', a, e1)), 'ok:1'),
    ('teacher1 marks other class attendance',
       pg_temp.t_try(u_t1, format('insert into public.attendance (school_id,enrollment_id,date,status) values (%L,%L,current_date + 1,''present'')', a, e2)), 'denied'),
    ('teacher2 edits class 1 attendance',
       pg_temp.t_try(u_t2, format('update public.attendance set status = ''absent'' where enrollment_id = %L', e1)), 'ok:0'),
    ('parent1 writes attendance',
       pg_temp.t_try(u_p1, format('insert into public.attendance (school_id,enrollment_id,date,status) values (%L,%L,current_date + 2,''present'')', a, e1)), 'denied'),
    ('teacher1 scores own class',
       pg_temp.t_try(u_t1, format('insert into public.scores (school_id,assessment_id,enrollment_id,score) values (%L,%L,%L,15)', a, asm, e1)), 'ok:1'),
    ('teacher1 scores other class',
       pg_temp.t_try(u_t1, format('insert into public.scores (school_id,assessment_id,enrollment_id,score) values (%L,%L,%L,15)', a, asm, e2)), 'denied'),
    ('teacher1 writes term_results directly',
       pg_temp.t_try(u_t1, 'update public.term_results set total = 100'), 'denied'),
    ('teacher1 records payment',
       pg_temp.t_try(u_t1, format('insert into public.payments (school_id,invoice_id,amount,method) values (%L,%L,10,''cash'')', a, i1)), 'denied'),
    ('principal records payment',
       pg_temp.t_try(u_prin, format('insert into public.payments (school_id,invoice_id,amount,method) values (%L,%L,10,''cash'')', a, i1)), 'denied'),
    ('accountant records payment',
       pg_temp.t_try(u_acc, format('insert into public.payments (school_id,invoice_id,amount,method) values (%L,%L,10,''cash'')', a, i1)), 'ok:1'),
    ('parent1 creates student',
       pg_temp.t_try(u_p1, format('insert into public.students (school_id,first_name,last_name) values (%L,''X'',''Y'')', a)), 'denied'),
    ('reception creates student',
       pg_temp.t_try(u_rec, format('insert into public.students (school_id,first_name,last_name) values (%L,''New'',''Pupil'')', a)), 'ok:1'),
    ('other school admin creates student in school A',
       pg_temp.t_try(u_adminb, format('insert into public.students (school_id,first_name,last_name) values (%L,''X'',''Y'')', a)), 'denied'),
    ('reception enters BECE index number',
       pg_temp.t_try(u_rec, 'update public.bece_registrations set index_number = ''1234567890'''), 'ok:1'),
    ('teacher1 edits BECE index number',
       pg_temp.t_try(u_t1, 'update public.bece_registrations set index_number = ''0000000000'''), 'ok:0'),
    ('teacher1 edits audit log',
       pg_temp.t_try(u_t1, 'delete from public.audit_log'), 'denied'),
    ('admin edits audit log',
       pg_temp.t_try(u_admin, 'update public.audit_log set action = ''x'''), 'denied'),
    ('teacher1 calls issue_number',
       pg_temp.t_try(u_t1, format('select public.issue_number(%L, ''admission_no'')', a)), 'denied'),
    ('developer records payment',
       pg_temp.t_try(u_dev, format('insert into public.payments (school_id,invoice_id,amount,method) values (%L,%L,10,''cash'')', a, i1)), 'ok:1'),
    ('developer grants admin role',
       pg_temp.t_try(u_dev, format('insert into public.user_roles (profile_id,school_id,role) values (%L,%L,''school_admin'')', u_t2, a)), 'ok:1'),
    ('developer grants developer role',
       pg_temp.t_try(u_dev, format('insert into public.user_roles (profile_id,school_id,role) values (%L,%L,''developer'')', u_t2, a)), 'ok:1'),
    ('admin grants developer role',
       pg_temp.t_try(u_admin, format('insert into public.user_roles (profile_id,school_id,role) values (%L,%L,''developer'')', u_admin, a)), 'denied'),
    ('admin grants super_admin role',
       pg_temp.t_try(u_admin, format('insert into public.user_roles (profile_id,school_id,role) values (%L,%L,''super_admin'')', u_admin, a)), 'denied'),
    ('admin removes developer role',
       pg_temp.t_try(u_admin, format('delete from public.user_roles where profile_id = %L and role = ''developer''', u_dev)), 'ok:0'),
    ('admin grants teacher role',
       pg_temp.t_try(u_admin, format('insert into public.user_roles (profile_id,school_id,role) values (%L,%L,''teacher'')', u_hr, a)), 'ok:1'),
    ('admin sets current year',
       pg_temp.t_try(u_admin, format('select public.set_current_academic_year(%L)', yr)), 'ok:1'),
    ('teacher1 sets current year',
       pg_temp.t_try(u_t1, format('select public.set_current_academic_year(%L)', yr)), 'denied'),
    ('admin sets current term',
       pg_temp.t_try(u_admin, format('select public.set_current_term(%L)', term)), 'ok:1'),
    ('other school admin sets current term in school A',
       pg_temp.t_try(u_adminb, format('select public.set_current_term(%L)', term)), 'denied'),
    ('admin creates year without sending school_id',
       pg_temp.t_try(u_admin, 'insert into public.academic_years (name,start_date,end_date) values (''Next'',''2027-09-01'',''2028-07-31'')'), 'ok:1'),
    ('admin removes a graded subject from a class',
       pg_temp.t_try(u_admin, format('delete from public.class_subjects where id = %L', cs1)), 'denied'),
    ('admin assigns a subject to a class',
       pg_temp.t_try(u_admin, format('insert into public.class_subjects (class_id,subject_id) select %L, id from public.subjects where name = ''French''', c2)), 'ok:1'),
    ('teacher1 assigns a subject to a class',
       pg_temp.t_try(u_t1, format('insert into public.class_subjects (class_id,subject_id) select %L, id from public.subjects where name = ''Computing''', c1)), 'denied'),
    ('reception admits a student',
       pg_temp.t_try(u_rec, format('select * from public.admit_student(''{"first_name":"Esi","last_name":"Boateng","gender":"female"}''::jsonb, %L, ''[{"full_name":"Mrs Boateng","phone":"0244000000","relationship":"Mother"}]''::jsonb)', c1)), 'ok:1'),
    ('teacher1 admits a student',
       pg_temp.t_try(u_t1, format('select * from public.admit_student(''{"first_name":"Esi","last_name":"Boateng","gender":"female"}''::jsonb, %L, ''[]''::jsonb)', c1)), 'denied'),
    ('parent1 admits a student',
       pg_temp.t_try(u_p1, format('select * from public.admit_student(''{"first_name":"Esi","last_name":"Boateng","gender":"female"}''::jsonb, %L, ''[]''::jsonb)', c1)), 'denied'),
    ('admit into a class of another school',
       pg_temp.t_try(u_adminb, format('select * from public.admit_student(''{"first_name":"Esi","last_name":"Boateng","gender":"female"}''::jsonb, %L, ''[]''::jsonb)', c1)), 'denied'),
    -- the old Supabase photo bucket is closed to every client (photos live in Cloudinary)
    ('photo bucket: admin reads nothing',
       pg_temp.t_try(u_admin, 'select 1 from storage.objects where bucket_id = ''student-photos'''), 'ok:0'),
    ('photo bucket: parent1 reads nothing',
       pg_temp.t_try(u_p1, 'select 1 from storage.objects where bucket_id = ''student-photos'''), 'ok:0'),
    ('photo bucket: reception cannot upload',
       pg_temp.t_try(u_rec, format('insert into storage.objects (bucket_id, name) values (''student-photos'', %L)', s1::text || '/new.jpg')), 'denied'),
    ('photo bucket: developer cannot upload',
       pg_temp.t_try(u_dev, format('insert into storage.objects (bucket_id, name) values (''student-photos'', %L)', s1::text || '/dev.jpg')), 'denied'),
    -- editing is for admins; hard deletion of reference data is for developers
    ('admin edits a subject name',
       pg_temp.t_try(u_admin, 'update public.subjects set name = ''DelMe2'' where name = ''DelMe'''), 'ok:1'),
    ('admin deletes a subject',
       pg_temp.t_try(u_admin, 'delete from public.subjects where name = ''DelMe2'''), 'ok:0'),
    ('developer deletes an unused subject',
       pg_temp.t_try(u_dev, 'delete from public.subjects where name = ''DelMe2'''), 'ok:1'),
    ('admin deletes a class',
       pg_temp.t_try(u_admin, format('delete from public.classes where id = %L', cls_del)), 'ok:0'),
    ('developer deletes an unused class',
       pg_temp.t_try(u_dev, format('delete from public.classes where id = %L', cls_del)), 'ok:1'),
    ('developer cannot delete a class that has students',
       pg_temp.t_try(u_dev, format('delete from public.classes where id = %L', c1)), 'denied'),
    ('admin deletes a term',
       pg_temp.t_try(u_admin, 'delete from public.terms where name = ''DelTerm'''), 'ok:0'),
    ('admin deletes an academic year',
       pg_temp.t_try(u_admin, format('delete from public.academic_years where id = %L', yr_del)), 'ok:0'),
    ('developer deletes an unused academic year',
       pg_temp.t_try(u_dev, format('delete from public.academic_years where id = %L', yr_del)), 'ok:1'),
    ('teacher1 edits a subject',
       pg_temp.t_try(u_t1, 'update public.subjects set name = name where name = ''Maths'''), 'ok:0'),
    -- deleting a student: developer only, and only with no history
    ('admin deletes a student',
       pg_temp.t_try(u_admin, format('select public.delete_student_if_unused(%L)', su)), 'denied'),
    ('reception deletes a student',
       pg_temp.t_try(u_rec, format('select public.delete_student_if_unused(%L)', su)), 'denied'),
    ('developer deletes a student with attendance',
       pg_temp.t_try(u_dev, format('select public.delete_student_if_unused(%L)', s2)), 'denied'),
    ('developer deletes an unused student',
       pg_temp.t_try(u_dev, format('select public.delete_student_if_unused(%L)', su)), 'ok:1'),
    -- numbering: a taken number is skipped instead of colliding
    ('staff number skips a taken one',
       pg_temp.t_try(u_admin, 'insert into public.staff (full_name,type) values (''ZZ Skip'',''teaching'')'), 'ok:1'),
    ('...and it is not the taken number',
       pg_temp.t_scalar('select (staff_no <> ''S/9000'')::text from public.staff where full_name = ''ZZ Skip'''), 'true'),
    -- no internal function can be called without signing in
    ('anon cannot issue a number',
       pg_temp.t_anon(format('select public.issue_number(%L, ''staff_no'')', a)), 'denied'),
    ('anon cannot publish a report',
       pg_temp.t_anon(format('select public.set_term_report_publication(%L, %L, true, null, null, null)', c1, term)), 'denied'),
    ('anon cannot save a behavioural assessment',
       pg_temp.t_anon(format('select public.save_behavioral_assessment(%L, %L, 3::smallint, 3::smallint, 3::smallint, 3::smallint, 3::smallint, null, null, null)', e1, term)), 'denied'),
    ('anon cannot call a role helper',
       pg_temp.t_anon('select public.has_role(''school_admin'')'), 'denied'),
    ('anon cannot set a theme',
       pg_temp.t_anon('select public.set_my_theme(''{}''::jsonb)'), 'denied'),
    -- expenses
    ('accountant records an expense',
       pg_temp.t_try(u_acc, format('insert into public.expenses (expense_category_id,voucher_no,title,amount) values (%L,''ZZV-1'',''Chalk'',50)', ecat)), 'ok:1'),
    ('principal records an expense',
       pg_temp.t_try(u_prin, format('insert into public.expenses (expense_category_id,voucher_no,title,amount) values (%L,''ZZV-2'',''Paper'',20)', ecat)), 'ok:1'),
    ('teacher1 records an expense',
       pg_temp.t_try(u_t1, format('insert into public.expenses (expense_category_id,voucher_no,title,amount) values (%L,''ZZV-3'',''Pens'',5)', ecat)), 'denied'),
    ('teacher1 reads expenses', pg_temp.t_count(u_t1,'expenses')::text, '0'),
    ('parent1 reads expenses', pg_temp.t_count(u_p1,'expenses')::text, '0'),
    ('accountant edits a category',
       pg_temp.t_try(u_acc, format('update public.expense_categories set budget_limit = 100 where id = %L', ecat)), 'ok:1'),
    ('principal edits a category',
       pg_temp.t_try(u_prin, format('update public.expense_categories set budget_limit = 999 where id = %L', ecat)), 'ok:0'),
    -- notices
    ('admin posts a notice',
       pg_temp.t_try(u_admin, 'insert into public.announcements (title,body,audience,published_at) values (''T'',''B'',''all'',now())'), 'ok:1'),
    ('teacher1 posts a school-wide notice',
       pg_temp.t_try(u_t1, 'insert into public.announcements (title,body,audience,published_at) values (''T'',''B'',''all'',now())'), 'denied'),
    ('teacher1 posts to their own class',
       pg_temp.t_try(u_t1, format('insert into public.announcements (title,body,audience,class_id,published_at) values (''T'',''B'',''class'',%L,now())', c1)), 'ok:1'),
    ('teacher1 posts to another class',
       pg_temp.t_try(u_t1, format('insert into public.announcements (title,body,audience,class_id,published_at) values (''T'',''B'',''class'',%L,now())', c2)), 'denied'),
    ('parent1 posts a notice',
       pg_temp.t_try(u_p1, 'insert into public.announcements (title,body,audience,published_at) values (''T'',''B'',''all'',now())'), 'denied'),
    -- timetable
    ('admin adds a timetable slot',
       pg_temp.t_try(u_admin, format('insert into public.timetable_slots (class_id,day_of_week,start_time,end_time) values (%L,1,''08:00'',''08:40'')', c2)), 'ok:1'),
    ('teacher1 adds a slot for their own class',
       pg_temp.t_try(u_t1, format('insert into public.timetable_slots (class_id,day_of_week,start_time,end_time) values (%L,2,''08:00'',''08:40'')', c1)), 'ok:1'),
    ('teacher1 adds a slot for another class',
       pg_temp.t_try(u_t1, format('insert into public.timetable_slots (class_id,day_of_week,start_time,end_time) values (%L,3,''08:00'',''08:40'')', c2)), 'denied'),
    ('parent1 adds a slot',
       pg_temp.t_try(u_p1, format('insert into public.timetable_slots (class_id,day_of_week,start_time,end_time) values (%L,4,''08:00'',''08:40'')', c1)), 'denied'),
    ('parent1 reads the timetable', (pg_temp.t_count(u_p1,'timetable_slots') >= 2)::text, 'true'),
    ('other school admin reads no timetable', pg_temp.t_count(u_adminb,'timetable_slots')::text, '0'),
    -- fee configuration
    ('accountant adds a discount',
       pg_temp.t_try(u_acc, 'insert into public.discounts (name,type,value) values (''ZZ Sibling'',''percent'',10)'), 'ok:1'),
    ('teacher1 adds a discount',
       pg_temp.t_try(u_t1, 'insert into public.discounts (name,type,value) values (''ZZ Teacher'',''percent'',10)'), 'denied'),
    ('parent1 reads discounts', pg_temp.t_count(u_p1,'discounts')::text, '0'),
    -- report publication and behavioural assessments
    ('admin publishes a class report',
       pg_temp.t_try(u_admin, format('select public.set_term_report_publication(%L, %L, true, null, null, null)', c1, term)), 'ok:1'),
    ('class teacher publishes their own class report',
       pg_temp.t_try(u_t1, format('select public.set_term_report_publication(%L, %L, false, null, null, null)', c1, term)), 'ok:1'),
    ('teacher1 publishes another class report',
       pg_temp.t_try(u_t1, format('select public.set_term_report_publication(%L, %L, true, null, null, null)', c2, term)), 'denied'),
    ('parent1 publishes a report',
       pg_temp.t_try(u_p1, format('select public.set_term_report_publication(%L, %L, true, null, null, null)', c1, term)), 'denied'),
    ('teacher1 saves a behavioural assessment for their pupil',
       pg_temp.t_try(u_t1, format('select public.save_behavioral_assessment(%L, %L, 4::smallint, 4::smallint, 4::smallint, 4::smallint, 4::smallint, null, null, null)', e1, term)), 'ok:1'),
    ('teacher1 assesses a pupil in another class',
       pg_temp.t_try(u_t1, format('select public.save_behavioral_assessment(%L, %L, 1::smallint, 1::smallint, 1::smallint, 1::smallint, 1::smallint, null, null, null)', e2, term)), 'denied'),
    ('parent1 assesses a pupil',
       pg_temp.t_try(u_p1, format('select public.save_behavioral_assessment(%L, %L, 1::smallint, 1::smallint, 1::smallint, 1::smallint, 1::smallint, null, null, null)', e1, term)), 'denied'),
    ('parent1 reads own child''s behavioural assessment', pg_temp.t_count(u_p1,'student_behavioral_assessments')::text, '1'),
    ('parent2 does not see it', pg_temp.t_count(u_p2,'student_behavioral_assessments')::text, '0'),
    -- messaging: templates are editable by admin and principal, readable by the accountant
    ('principal reads templates', (pg_temp.t_count(u_prin,'message_templates') >= 1)::text, 'true'),
    ('accountant reads templates', (pg_temp.t_count(u_acc,'message_templates') >= 1)::text, 'true'),
    ('teacher1 reads no templates', pg_temp.t_count(u_t1,'message_templates')::text, '0'),
    ('parent1 reads no templates', pg_temp.t_count(u_p1,'message_templates')::text, '0'),
    ('other school admin reads no templates', pg_temp.t_count(u_adminb,'message_templates')::text, '0'),
    ('principal edits a template',
       pg_temp.t_try(u_prin, 'update public.message_templates set name = name where key = ''absence_alert'''), 'ok:1'),
    ('accountant edits a template',
       pg_temp.t_try(u_acc, 'update public.message_templates set name = name where key = ''absence_alert'''), 'ok:0'),
    ('teacher1 edits a template',
       pg_temp.t_try(u_t1, 'update public.message_templates set name = name where key = ''absence_alert'''), 'ok:0'),
    ('admin adds a template',
       pg_temp.t_try(u_admin, 'insert into public.message_templates (key,name,body) values (''zz_t'',''ZZ'',''Hello {parent}'')'), 'ok:1'),
    ('teacher1 adds a template',
       pg_temp.t_try(u_t1, 'insert into public.message_templates (key,name,body) values (''zz_t2'',''ZZ'',''Hello'')'), 'denied'),
    -- the message log: read by admin, principal and accountant only; never written from the browser
    ('admin reads the message log', pg_temp.t_count(u_admin,'messages')::text, (rm + 1)::text),
    ('principal reads the message log', pg_temp.t_count(u_prin,'messages')::text, (rm + 1)::text),
    ('accountant reads the message log', pg_temp.t_count(u_acc,'messages')::text, (rm + 1)::text),
    ('teacher1 reads no messages', pg_temp.t_count(u_t1,'messages')::text, '0'),
    ('parent1 reads no messages', pg_temp.t_count(u_p1,'messages')::text, '0'),
    ('hr reads no messages', pg_temp.t_count(u_hr,'messages')::text, '0'),
    ('other school admin reads no messages', pg_temp.t_count(u_adminb,'messages')::text, '0'),
    ('anonymous reads no messages', pg_temp.t_count(null,'messages')::text, '0'),
    ('admin reads the batches', pg_temp.t_count(u_admin,'message_batches')::text, (rb + 1)::text),
    ('teacher1 reads no batches', pg_temp.t_count(u_t1,'message_batches')::text, '0'),
    ('admin cannot insert a message',
       pg_temp.t_try(u_admin, format('insert into public.messages (batch_id,kind,recipient_phone,body) values (%L,''x'',''233244000001'',''x'')', mb)), 'denied'),
    ('admin cannot edit a message',
       pg_temp.t_try(u_admin, 'update public.messages set body = ''changed'''), 'ok:0'),
    ('admin cannot delete a message',
       pg_temp.t_try(u_admin, 'delete from public.messages'), 'ok:0'),
    ('admin cannot insert a batch',
       pg_temp.t_try(u_admin, 'insert into public.message_batches (title,kind,audience,body_template) values (''x'',''x'',''custom'',''x'')'), 'denied'),
    ('developer cannot insert a message either',
       pg_temp.t_try(u_dev, format('insert into public.messages (batch_id,kind,recipient_phone,body) values (%L,''x'',''233244000001'',''x'')', mb)), 'denied'),
    -- the internal functions cannot be reached from the browser
    ('admin cannot call the audience function',
       pg_temp.t_try(u_admin, format('select * from public.messaging_audience(%L, ''all_parents'')', a)), 'denied'),
    ('admin cannot claim messages',
       pg_temp.t_try(u_admin, format('select * from public.claim_messages(%L, 10)', mb)), 'denied'),
    ('anon cannot call the audience function',
       pg_temp.t_anon(format('select * from public.messaging_audience(%L, ''all_parents'')', a)), 'denied'),
    ('admin can read batch summaries', pg_temp.t_try(u_admin, 'select * from public.message_batch_stats(10)'), 'ok:' || (rb + 1)),
    ('teacher1 batch summaries are empty', pg_temp.t_try(u_t1, 'select * from public.message_batch_stats(10)'), 'ok:0'),
    -- parents can be opted out by the office, not by a teacher
    ('reception opts a parent out',
       pg_temp.t_try(u_rec, format('update public.guardians set sms_opt_out = true where id = %L', g1)), 'ok:1'),
    ('teacher1 opts a parent out',
       pg_temp.t_try(u_t1, format('update public.guardians set sms_opt_out = true where id = %L', g2)), 'ok:0'),
    ('principal sets the sender id',
       pg_temp.t_try(u_prin, 'insert into public.message_settings (sender_id) values (''ZZSender'') on conflict (school_id) do update set sender_id = excluded.sender_id'), 'ok:1'),
    ('accountant reads the sender id', pg_temp.t_count(u_acc,'message_settings')::text, '1'),
    ('accountant cannot change the sender id',
       pg_temp.t_try(u_acc, 'update public.message_settings set sender_id = ''Hacked'''), 'ok:0'),
    ('teacher1 reads no settings', pg_temp.t_count(u_t1,'message_settings')::text, '0'),
    ('admin rejects a sender id with a space',
       pg_temp.t_try(u_admin, 'update public.message_settings set sender_id = ''Bad Name'''), 'denied'),
    ('admin rejects a sender id over 11 characters',
       pg_temp.t_try(u_admin, 'update public.message_settings set sender_id = ''ABCDEFGHIJKL'''), 'denied'),
    ('other school admin reads no settings', pg_temp.t_count(u_adminb,'message_settings')::text, '0'),
    -- online payments: finance staff and the parent who started it can read; nobody writes from the browser
    ('admin reads online payments', pg_temp.t_count(u_admin,'online_payments')::text, (rop + 2)::text),
    ('accountant reads online payments', pg_temp.t_count(u_acc,'online_payments')::text, (rop + 2)::text),
    ('principal no longer reads online payments (no screen ever used it)', pg_temp.t_count(u_prin,'online_payments')::text, '0'),
    ('parent1 reads their own online payment', pg_temp.t_count(u_p1,'online_payments')::text, '1'),
    ('teacher1 reads no online payments', pg_temp.t_count(u_t1,'online_payments')::text, '0'),
    ('reception reads no online payments', pg_temp.t_count(u_rec,'online_payments')::text, '0'),
    ('other school admin reads no online payments', pg_temp.t_count(u_adminb,'online_payments')::text, '0'),
    ('anonymous reads no online payments', pg_temp.t_count(null,'online_payments')::text, '0'),
    ('parent1 cannot insert an online payment',
       pg_temp.t_try(u_p1, format('insert into public.online_payments (invoice_id, reference, amount) values (%L,''ZZREF2'',5)', i1)), 'denied'),
    ('admin cannot insert an online payment',
       pg_temp.t_try(u_admin, format('insert into public.online_payments (invoice_id, reference, amount) values (%L,''ZZREF3'',5)', i1)), 'denied'),
    ('parent1 cannot mark their payment successful',
       pg_temp.t_try(u_p1, 'update public.online_payments set status = ''success'''), 'ok:0'),
    ('admin cannot delete an online payment',
       pg_temp.t_try(u_admin, 'delete from public.online_payments'), 'ok:0'),
    ('parent1 cannot record an online payment',
       pg_temp.t_try(u_p1, 'select public.record_online_payment(''ZZREF1'', 10, ''card'', null, ''{}''::jsonb)'), 'denied'),
    ('admin cannot record an online payment',
       pg_temp.t_try(u_admin, 'select public.record_online_payment(''ZZREF1'', 10, ''card'', null, ''{}''::jsonb)'), 'denied'),
    ('anon cannot record an online payment',
       pg_temp.t_anon('select public.record_online_payment(''ZZREF1'', 10, ''card'', null, ''{}''::jsonb)'), 'denied'),
    -- receipts cannot be edited or erased, only cancelled with a reason
    ('accountant cannot edit a payment', pg_temp.t_try(u_acc, 'update public.payments set amount = 1'), 'ok:0'),
    ('admin cannot edit a payment', pg_temp.t_try(u_admin, 'update public.payments set amount = 1'), 'ok:0'),
    ('developer cannot edit a payment', pg_temp.t_try(u_dev, 'update public.payments set amount = 1'), 'ok:0'),
    ('accountant cannot delete a payment', pg_temp.t_try(u_acc, 'delete from public.payments'), 'ok:0'),
    ('admin cannot delete a payment', pg_temp.t_try(u_admin, 'delete from public.payments'), 'ok:0'),
    ('accountant cannot record an already-cancelled payment',
       pg_temp.t_try(u_acc, format('insert into public.payments (school_id,invoice_id,amount,method,voided_at,void_reason) values (%L,%L,10,''cash'',now(),''because'')', a, i1)), 'denied'),
    ('teacher1 cannot cancel a receipt', pg_temp.t_try(u_t1, format('select public.void_payment(%L, ''Entered twice by mistake'')', pcash)), 'denied'),
    ('principal cannot cancel a receipt', pg_temp.t_try(u_prin, format('select public.void_payment(%L, ''Entered twice by mistake'')', pcash)), 'denied'),
    ('parent2 cannot cancel a receipt', pg_temp.t_try(u_p2, format('select public.void_payment(%L, ''Entered twice by mistake'')', pcash)), 'denied'),
    ('other school admin cannot cancel a receipt', pg_temp.t_try(u_adminb, format('select public.void_payment(%L, ''Entered twice by mistake'')', pcash)), 'denied'),
    ('anon cannot cancel a receipt', pg_temp.t_anon(format('select public.void_payment(%L, ''Entered twice by mistake'')', pcash)), 'denied'),
    ('cancelling needs a reason', pg_temp.t_try(u_acc, format('select public.void_payment(%L, ''no'')', pcash)), 'denied'),
    ('an online payment cannot be cancelled without the refund reference',
       pg_temp.t_try(u_acc, format('select public.void_payment(%L, ''Parent paid twice'')', pon)), 'denied'),
    ('accountant cancels a cash receipt with a reason',
       pg_temp.t_try(u_acc, format('select public.void_payment(%L, ''Entered twice by mistake'')', pcash)), 'ok:1'),
    ('the cancelled receipt records who, when and why',
       pg_temp.t_scalar(format('select (voided_by = %L and void_reason = ''Entered twice by mistake'' and voided_at is not null)::text from public.payments where id = %L', u_acc, pcash)), 'true'),
    ('a receipt cannot be cancelled twice', pg_temp.t_try(u_admin, format('select public.void_payment(%L, ''Trying again please'')', pcash)), 'denied'),
    ('admin cancels an online receipt with the refund reference',
       pg_temp.t_try(u_admin, format('select public.void_payment(%L, ''Parent paid twice'', ''RF-1234'')', pon)), 'ok:1'),
    ('the online attempt becomes refunded', pg_temp.t_scalar(format('select status from public.online_payments where payment_id = %L', pon)), 'refunded'),
    ('the refund reference is kept', pg_temp.t_scalar(format('select refund_reference from public.payments where id = %L', pon)), 'RF-1234'),
    -- online payments that need review
    ('parent1 cannot mark a payment reviewed',
       pg_temp.t_try(u_p1, 'select public.resolve_online_payment((select id from public.online_payments where reference = ''ZZREF1''), ''Looked at it, fine'')'), 'denied'),
    ('teacher1 cannot mark a payment reviewed',
       pg_temp.t_try(u_t1, 'select public.resolve_online_payment((select id from public.online_payments where reference = ''ZZREF1''), ''Looked at it, fine'')'), 'denied'),
    ('reviewing needs a note',
       pg_temp.t_try(u_acc, 'select public.resolve_online_payment((select id from public.online_payments where reference = ''ZZREF1''), ''ok'')'), 'denied'),
    ('accountant marks a payment reviewed with a note',
       pg_temp.t_try(u_acc, 'select public.resolve_online_payment((select id from public.online_payments where reference = ''ZZREF1''), ''Refunded the extra in Paystack'')'), 'ok:1'),
    ('and it records who and why',
       pg_temp.t_scalar(format('select (needs_review = false and reviewed_by = %L and review_note like ''Refunded%%'')::text from public.online_payments where reference = ''ZZREF1''', u_acc)), 'true'),
    -- access by module and action: the catalogue, the checks, and who may change anyone's access
    ('developer holds every action', pg_temp.t_try(u_dev, 'select 1 where public.has_capability(''fees.cancel_receipt'')'), 'ok:1'),
    ('a teacher starts with the teacher preset', pg_temp.t_try(u_t1, 'select 1 where public.has_capability(''students.view_own_classes'')'), 'ok:1'),
    ('but not the accountant''s actions', pg_temp.t_try(u_t1, 'select 1 where public.has_capability(''fees.record_payment'')'), 'ok:0'),
    ('anonymous cannot ask', pg_temp.t_anon('select public.has_capability(''students.view'')'), 'denied'),
    ('a signed-in user can read the catalogue', (pg_temp.t_count(u_t1,'access_capabilities') >= 50)::text, 'true'),
    ('anonymous reads no catalogue', pg_temp.t_count(null,'access_capabilities')::text, '0'),
    ('a teacher cannot change anyone''s access', pg_temp.t_try(u_t1, format('select public.set_user_capabilities(%L, array[''students.view''])', u_rec)), 'denied'),
    ('a parent cannot change anyone''s access', pg_temp.t_try(u_p1, format('select public.set_user_capabilities(%L, array[''students.view''])', u_rec)), 'denied'),
    ('an accountant cannot change access', pg_temp.t_try(u_acc, format('select public.set_user_capabilities(%L, array[''students.view''])', u_rec)), 'denied'),
    ('an admin starts with the admin preset, which can change access', pg_temp.t_try(u_admin, format('select public.set_user_capabilities(%L, array[''students.view''])', u_rec)), 'ok:1'),
    ('the developer gives a teacher one action', pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, array[''students.view_own_classes''])', u_t1)), 'ok:1'),
    ('the teacher now holds that action', pg_temp.t_try(u_t1, 'select 1 where public.has_capability(''students.view_own_classes'')'), 'ok:1'),
    ('and still not another', pg_temp.t_try(u_t1, 'select 1 where public.has_capability(''fees.view'')'), 'ok:0'),
    ('the change is written to the audit trail', pg_temp.t_scalar(format('select count(*)::text from public.audit_log where action = ''ACCESS_CHANGE'' and row_id = %L', u_t1)), '1'),
    ('an unknown permission is refused', pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, array[''nope.thing''])', u_t1)), 'denied'),
    ('the developer makes the principal a manager of access', pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, array[''access.manage'',''students.view''])', u_prin)), 'ok:1'),
    ('a manager can give an action they hold', pg_temp.t_try(u_prin, format('select public.set_user_capabilities(%L, array[''students.view''])', u_rec)), 'ok:1'),
    ('a manager cannot give an action they do not hold', pg_temp.t_try(u_prin, format('select public.set_user_capabilities(%L, array[''fees.view''])', u_rec)), 'denied'),
    ('a manager cannot change their own access', pg_temp.t_try(u_prin, format('select public.set_user_capabilities(%L, array[''access.manage'',''students.view'',''fees.view''])', u_prin)), 'denied'),
    ('a manager cannot change the developer''s access', pg_temp.t_try(u_prin, format('select public.set_user_capabilities(%L, array[''students.view''])', u_dev)), 'denied'),
    ('nobody can change another school''s access', pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, array[''students.view''])', u_adminb)), 'denied'),
    ('a manager reads the school''s grants', (pg_temp.t_count(u_prin,'user_capabilities') >= 3)::text, 'true'),
    ('a teacher reads only their own grants', pg_temp.t_count(u_t1,'user_capabilities')::text, '1'),
    ('a parent reads no grants', pg_temp.t_count(u_p1,'user_capabilities')::text, '0'),
    ('nobody writes grants directly',
       pg_temp.t_try(u_prin, format('insert into public.user_capabilities (profile_id, capability, school_id) values (%L, ''fees.view'', %L)', u_t1, a)), 'denied'),
    ('nobody edits grants directly', pg_temp.t_try(u_prin, 'update public.user_capabilities set capability = capability'), 'ok:0'),
    ('nobody deletes grants directly', pg_temp.t_try(u_prin, 'delete from public.user_capabilities'), 'ok:0'),
    ('an expired grant is set up', pg_temp.t_scalar(format('with x as (insert into public.user_capabilities (profile_id, capability, school_id, expires_at) values (%L, ''timetable.view'', %L, now() - interval ''1 hour'') returning 1) select count(*)::text from x', u_rec, a)), '1'),
    ('an expired grant does not count', pg_temp.t_try(u_rec, 'select 1 where public.has_capability(''timetable.view'')'), 'ok:0'),
    ('the receptionist is put back to the receptionist preset for the tests below',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''receptionist''))', u_rec)), 'ok:1'),
    ('the teacher preset includes no fees', pg_temp.t_scalar('select count(*)::text from public.access_preset_capabilities where role = ''teacher'' and capability like ''fees.%'''), '0'),
    ('the accountant preset can record payments', pg_temp.t_scalar('select count(*)::text from public.access_preset_capabilities where role = ''accountant'' and capability = ''fees.record_payment'''), '1'),
    ('the principal preset cannot cancel receipts', pg_temp.t_scalar('select count(*)::text from public.access_preset_capabilities where role = ''principal'' and capability = ''fees.cancel_receipt'''), '0'),
    ('only the admin preset can decide who does what', pg_temp.t_scalar('select count(*)::text from public.access_preset_capabilities where capability = ''access.manage'''), '1'),
    -- roles keep the presets in step, and Messages is decided by actions
    ('giving a role gives its preset', pg_temp.t_scalar(format('with x as (insert into public.user_roles (profile_id, school_id, role) values (%L, %L, ''accountant'') returning 1) select count(*)::text from x', u_hr, a)), '1'),
    ('so the person now holds the accountant actions', pg_temp.t_try(u_hr, 'select 1 where public.has_capability(''fees.record_payment'')'), 'ok:1'),
    ('and can read the message log', (pg_temp.t_count(u_hr,'messages') >= 0)::text, 'true'),
    ('taking the role away removes what only it provided', pg_temp.t_scalar(format('with x as (delete from public.user_roles where profile_id = %L and role = ''accountant'' returning 1) select count(*)::text from x', u_hr)), '1'),
    ('the actions are gone', pg_temp.t_try(u_hr, 'select 1 where public.has_capability(''fees.record_payment'')'), 'ok:0'),
    ('but the HR officer keeps the HR actions', pg_temp.t_try(u_hr, 'select 1 where public.has_capability(''staff.edit'')'), 'ok:1'),
    ('without the action, no message log', pg_temp.t_count(u_hr,'messages')::text, '0'),
    ('an admin switches the log action off for the accountant',
       pg_temp.t_try(u_admin, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.user_capabilities where profile_id = %L and capability <> ''messages.view_log''))', u_acc, u_acc)), 'ok:1'),
    ('and the accountant no longer sees the log', pg_temp.t_count(u_acc,'messages')::text, '0'),
    ('teacher1 grants themself admin',
       pg_temp.t_try(u_t1, format('insert into public.user_roles (profile_id,school_id,role) values (%L,%L,''school_admin'')', u_t1, a)), 'denied'),
    ('reception changes a student''s class',
       pg_temp.t_try(u_rec, format('select public.change_student_class(%L, %L)', s2, c1)), 'ok:1'),
    ('teacher1 changes a student''s class',
       pg_temp.t_try(u_t1, format('select public.change_student_class(%L, %L)', s2, c2)), 'denied'),
    ('reception adds a guardian to a student',
       pg_temp.t_try(u_rec, format('select public.add_student_guardian(%L, ''{"full_name":"New Guardian","phone":"0200000000"}''::jsonb)', s1)), 'ok:1'),
    ('teacher1 adds a guardian to a student',
       pg_temp.t_try(u_t1, format('select public.add_student_guardian(%L, ''{"full_name":"X"}''::jsonb)', s1)), 'denied'),
    ('reception removes a guardian from a student',
       pg_temp.t_try(u_rec, format('select public.remove_student_guardian(%L, %L)', s1, g1)), 'ok:1'),
    -- Students are decided by actions
    ('the developer gives teacher1 the see-all-students action',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, array[''students.view_own_classes'',''students.view''])', u_t1)), 'ok:1'),
    ('so teacher1 now reads every student', (pg_temp.t_count(u_t1,'students') = pg_temp.t_count(u_admin,'students'))::text, 'true'),
    ('the developer takes it back',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, array[''students.view_own_classes''])', u_t1)), 'ok:1'),
    ('and teacher1 is limited to their own classes again', (pg_temp.t_count(u_t1,'students') < pg_temp.t_count(u_admin,'students'))::text, 'true'),
    ('the developer takes the edit action from the receptionist',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''receptionist'' and capability <> ''students.edit''))', u_rec)), 'ok:1'),
    ('so reception can no longer edit a student', pg_temp.t_try(u_rec, 'update public.students set first_name = first_name'), 'ok:0'),
    ('and can no longer move one to another class', pg_temp.t_try(u_rec, format('select public.change_student_class(%L, %L)', s2, c2)), 'denied'),
    ('but still sees students', (pg_temp.t_count(u_rec,'students') > 0)::text, 'true'),
    ('and can still admit a new student', pg_temp.t_try(u_rec, format('select * from public.admit_student(''{"first_name":"Kofi","last_name":"Asare","gender":"male"}''::jsonb, %L, ''[]''::jsonb)', c1)), 'ok:1'),
    -- Attendance and Grades are decided by actions
    ('the developer takes the attendance action from teacher1',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''teacher'' and capability <> ''attendance.take_own_classes''))', u_t1)), 'ok:1'),
    ('so teacher1 can no longer mark their register',
       pg_temp.t_try(u_t1, format('update public.attendance set status = ''present'' where enrollment_id = %L', e1)), 'ok:0'),
    ('but teacher1 can still enter marks',
       pg_temp.t_try(u_t1, format('update public.assessments set title = title where class_subject_id = %L', cs1)), 'ok:1'),
    ('the developer takes the marks action from teacher1 and gives the attendance one back',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''teacher'' and capability <> ''grades.enter_own_classes''))', u_t1)), 'ok:1'),
    ('so teacher1 can mark the register again',
       pg_temp.t_try(u_t1, format('update public.attendance set status = ''present'' where enrollment_id = %L', e1)), 'ok:2'),
    ('but can no longer change assessments',
       pg_temp.t_try(u_t1, format('update public.assessments set title = title where class_subject_id = %L', cs1)), 'ok:0'),
    ('and a teacher without the marks action cannot publish their class report cards',
       pg_temp.t_try(u_t1, format('select public.set_term_report_publication(%L, %L, true)', c1, term)), 'denied'),
    ('the developer lets the principal take attendance for any class',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, array[''attendance.view'',''attendance.take_any''])', u_prin)), 'ok:1'),
    ('so the principal can now mark a register',
       pg_temp.t_try(u_prin, format('update public.attendance set status = ''present'' where enrollment_id = %L', e1)), 'ok:2'),
    ('the principal is put back to the principal preset',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''principal''))', u_prin)), 'ok:1'),
    ('and cannot mark a register again',
       pg_temp.t_try(u_prin, format('update public.attendance set status = ''present'' where enrollment_id = %L', e1)), 'ok:0'),
    ('the principal cannot publish report cards, as before',
       pg_temp.t_try(u_prin, format('select public.set_term_report_publication(%L, %L, true)', c1, term)), 'denied'),
    ('the developer puts teacher1 back to the teacher preset',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''teacher''))', u_t1)), 'ok:1'),
    -- Fees and Expenses are decided by actions
    ('the developer lets the receptionist record payments but nothing else in fees',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, array[''fees.view'',''fees.record_payment''])', u_rec)), 'ok:1'),
    ('so the receptionist can record a payment',
       pg_temp.t_try(u_rec, format('insert into public.payments (school_id,invoice_id,amount,method) values (%L,%L,5,''cash'')', a, i1)), 'ok:1'),
    ('but cannot cancel a receipt',
       pg_temp.t_try(u_rec, format('select public.void_payment((select id from public.payments where invoice_id = %L limit 1), ''Entered twice by mistake'')', i1)), 'denied'),
    ('and cannot bill a student',
       pg_temp.t_try(u_rec, format('insert into public.invoices (school_id,student_id,term_id) values (%L,%L,%L)', a, s2, term)), 'denied'),
    ('and cannot change fee amounts', pg_temp.t_try(u_rec, 'update public.fee_structures set amount = amount'), 'ok:0'),
    ('the developer takes recording away and gives billing instead',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, array[''fees.view'',''fees.bill''])', u_rec)), 'ok:1'),
    ('so the receptionist can no longer record a payment',
       pg_temp.t_try(u_rec, format('insert into public.payments (school_id,invoice_id,amount,method) values (%L,%L,5,''cash'')', a, i1)), 'denied'),
    ('and can bill a student',
       pg_temp.t_try(u_rec, format('insert into public.invoices (school_id,student_id,term_id) values (%L,%L,%L)', a, s2, term)), 'ok:1'),
    ('the receptionist is put back to the receptionist preset',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''receptionist''))', u_rec)), 'ok:1'),
    ('and sees no invoices again', pg_temp.t_count(u_rec,'invoices')::text, '0'),
    ('the developer lets the principal read the online payments and review them',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, array[''fees.view'',''fees.review_online''])', u_prin)), 'ok:1'),
    ('so the principal reads them again', (pg_temp.t_count(u_prin,'online_payments') >= rop + 2)::text, 'true'),
    ('the principal is put back to the principal preset',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''principal''))', u_prin)), 'ok:1'),
    ('the accountant cannot approve an expense, as before',
       pg_temp.t_try(u_acc, 'select public.review_expense((select id from public.expenses limit 1), ''approved'', ''ok'')'), 'denied'),
    -- Notices and Staff are decided by actions
    ('a teacher can read staff names without having the Staff screen', (pg_temp.t_count(u_t1,'staff') > 0)::text, 'true'),
    ('but does not hold the staff-directory action', pg_temp.t_try(u_t1, 'select 1 where public.has_capability(''staff.view'')'), 'ok:0'),
    ('the developer takes the class-notice action from teacher1',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''teacher'' and capability <> ''notices.post_class''))', u_t1)), 'ok:1'),
    ('so teacher1 cannot post a class notice',
       pg_temp.t_try(u_t1, format('insert into public.announcements (school_id,title,body,audience,class_id,posted_by) values (%L,''T'',''B'',''class'',%L,%L)', a, c1, u_t1)), 'denied'),
    ('the developer gives teacher1 the class-notice action back',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''teacher''))', u_t1)), 'ok:1'),
    ('and teacher1 can post a class notice again',
       pg_temp.t_try(u_t1, format('insert into public.announcements (school_id,title,body,audience,class_id,posted_by) values (%L,''T'',''B'',''class'',%L,%L)', a, c1, u_t1)), 'ok:1'),
    ('teacher1 still cannot post to everyone',
       pg_temp.t_try(u_t1, format('insert into public.announcements (school_id,title,body,audience,posted_by) values (%L,''T'',''B'',''all'',%L)', a, u_t1)), 'denied'),
    ('the developer lets the receptionist post to everyone',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, array[''notices.post''])', u_rec)), 'ok:1'),
    ('so the receptionist can post to everyone',
       pg_temp.t_try(u_rec, format('insert into public.announcements (school_id,title,body,audience,posted_by) values (%L,''T'',''B'',''all'',%L)', a, u_rec)), 'ok:1'),
    ('but cannot edit a notice someone else posted',
       pg_temp.t_try(u_rec, format('update public.announcements set title = ''Changed'' where posted_by = %L', u_t1)), 'ok:0'),
    ('the receptionist is put back to the receptionist preset',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''receptionist''))', u_rec)), 'ok:1'),
    ('and can no longer post to everyone',
       pg_temp.t_try(u_rec, format('insert into public.announcements (school_id,title,body,audience,posted_by) values (%L,''T'',''B'',''all'',%L)', a, u_rec)), 'denied'),
    ('the developer takes the edit action from the HR officer',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''hr_officer'' and capability <> ''staff.edit''))', u_hr)), 'ok:1'),
    ('so the HR officer can no longer edit a staff record', pg_temp.t_try(u_hr, 'update public.staff set phone = phone'), 'ok:0'),
    ('but still sees the staff directory', (pg_temp.t_count(u_hr,'staff') > 0)::text, 'true'),
    ('the HR officer is put back to the HR preset',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''hr_officer''))', u_hr)), 'ok:1'),
    -- Timetable, Users, Settings and the audit trail are decided by actions
    ('a teacher edits the timetable only for their own classes, not any class',
       (pg_temp.t_try(u_t1, 'select 1 where public.has_capability(''timetable.edit_own_classes'')') = 'ok:1'
        and pg_temp.t_try(u_t1, 'select 1 where public.has_capability(''timetable.edit'')') = 'ok:0')::text, 'true'),
    ('the principal edits any class timetable', pg_temp.t_try(u_prin, 'select 1 where public.has_capability(''timetable.edit'')'), 'ok:1'),
    ('an admin does not hold delete-logins by default', pg_temp.t_try(u_admin, 'select 1 where public.has_capability(''users.delete'')'), 'ok:0'),
    ('but the developer does', pg_temp.t_try(u_dev, 'select 1 where public.has_capability(''users.delete'')'), 'ok:1'),
    ('the principal reads no audit trail', pg_temp.t_count(u_prin,'audit_log')::text, '0'),
    ('the admin reads the audit trail', (pg_temp.t_count(u_admin,'audit_log') > 0)::text, 'true'),
    ('a teacher reads only their own login record', pg_temp.t_count(u_t1,'profiles')::text, '1'),
    ('the principal can see everyone''s name', (pg_temp.t_count(u_prin,'profiles') > 1)::text, 'true'),
    ('a receptionist cannot change school settings', pg_temp.t_try(u_rec, 'update public.schools set name = name'), 'ok:0'),
    ('the admin can', pg_temp.t_try(u_admin, 'update public.schools set name = name'), 'ok:1'),
    ('a receptionist cannot add a class', pg_temp.t_try(u_rec, format('insert into public.classes (school_id,level_id,academic_year_id,section) values (%L,%L,%L,''Z'')', a, lvl, yr)), 'denied'),
    -- handing out a role hands out its actions, so you can only give a role you hold in full
    ('an admin gives the receptionist the teacher role',
       pg_temp.t_try(u_admin, format('insert into public.user_roles (profile_id,school_id,role) values (%L,%L,''teacher'')', u_rec, a)), 'ok:1'),
    ('and the receptionist now holds the teacher actions', pg_temp.t_try(u_rec, 'select 1 where public.has_capability(''attendance.take_own_classes'')'), 'ok:1'),
    ('the admin takes the teacher role away again',
       pg_temp.t_try(u_admin, format('delete from public.user_roles where profile_id = %L and role = ''teacher''', u_rec)), 'ok:1'),
    ('and the teacher actions go with it', pg_temp.t_try(u_rec, 'select 1 where public.has_capability(''attendance.take_own_classes'')'), 'ok:0'),
    ('the developer lets the principal manage logins',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''principal'') || array[''users.edit''])', u_prin)), 'ok:1'),
    ('the principal cannot give someone the admin role, which carries more than they hold',
       pg_temp.t_try(u_prin, format('insert into public.user_roles (profile_id,school_id,role) values (%L,%L,''school_admin'')', u_rec, a)), 'denied'),
    ('nor the teacher role, which carries actions they lack',
       pg_temp.t_try(u_prin, format('insert into public.user_roles (profile_id,school_id,role) values (%L,%L,''teacher'')', u_rec, a)), 'denied'),
    ('but can give a role with no extra actions',
       pg_temp.t_try(u_prin, format('insert into public.user_roles (profile_id,school_id,role) values (%L,%L,''parent'')', u_rec, a)), 'ok:1'),
    ('and nobody but a developer can give the developer role',
       pg_temp.t_try(u_admin, format('insert into public.user_roles (profile_id,school_id,role) values (%L,%L,''developer'')', u_rec, a)), 'denied'),
    ('the principal is put back to the principal preset',
       pg_temp.t_try(u_dev, format('select public.set_user_capabilities(%L, (select array_agg(capability) from public.access_preset_capabilities where role = ''principal''))', u_prin)), 'ok:1'),
    ('and the extra parent role is removed again',
       pg_temp.t_scalar(format('with x as (delete from public.user_roles where profile_id = %L and role = ''parent'' returning 1) select count(*)::text from x', u_rec)), '1'),
    -- Features can be switched off per school
    ('every feature starts on', pg_temp.t_try(u_admin, 'select 1 where cardinality(public.my_disabled_features()) = 0'), 'ok:1'),
    ('a teacher cannot switch features', pg_temp.t_try(u_t1, format('select public.set_school_features(%s)', '(select array_agg(key) from public.app_features)')), 'denied'),
    ('a parent cannot switch features', pg_temp.t_try(u_p1, format('select public.set_school_features(%s)', '(select array_agg(key) from public.app_features)')), 'denied'),
    ('an unknown feature is refused', pg_temp.t_try(u_admin, 'select public.set_school_features(array[''nope''])'), 'denied'),
    ('online payments cannot be on while fees are off',
       pg_temp.t_try(u_admin, 'select public.set_school_features((select array_agg(key) from public.app_features where key <> ''fees''))'), 'denied'),
    ('an admin switches fees and online payments off',
       pg_temp.t_try(u_admin, 'select public.set_school_features((select array_agg(key) from public.app_features where key not in (''fees'', ''online_payments'')))'), 'ok:1'),
    ('so the accountant no longer reads invoices', pg_temp.t_count(u_acc,'invoices')::text, '0'),
    ('and holds no fee actions', pg_temp.t_try(u_acc, 'select 1 where public.has_capability(''fees.record_payment'')'), 'ok:0'),
    ('not even the developer holds a fee action while fees are off', pg_temp.t_try(u_dev, 'select 1 where public.has_capability(''fees.cancel_receipt'')'), 'ok:0'),
    ('a parent no longer reads their child''s invoices', pg_temp.t_count(u_p1,'invoices')::text, '0'),
    ('and no payments', pg_temp.t_count(u_p1,'payments')::text, '0'),
    ('the other modules are untouched', pg_temp.t_try(u_t1, 'select 1 where public.has_capability(''attendance.take_own_classes'')'), 'ok:1'),
    ('and the core parts cannot be switched off', pg_temp.t_try(u_admin, 'select 1 where public.has_capability(''users.view'')'), 'ok:1'),
    ('the disabled list says fees and online payments', pg_temp.t_try(u_admin, 'select 1 where public.my_disabled_features() @> array[''fees'', ''online_payments'']'), 'ok:1'),
    ('the admin turns fees back on but leaves online payments off',
       pg_temp.t_try(u_admin, 'select public.set_school_features((select array_agg(key) from public.app_features where key <> ''online_payments''))'), 'ok:1'),
    ('so the accountant can record payments again', pg_temp.t_try(u_acc, 'select 1 where public.has_capability(''fees.record_payment'')'), 'ok:1'),
    ('but cannot review online payments, which are off', pg_temp.t_try(u_acc, 'select 1 where public.has_capability(''fees.review_online'')'), 'ok:0'),
    ('the admin turns everything back on', pg_temp.t_try(u_admin, format('select public.set_school_features(%s)', '(select array_agg(key) from public.app_features)')), 'ok:1'),
    ('and the accountant reads invoices again', (pg_temp.t_count(u_acc,'invoices') > 0)::text, 'true'),
    ('and the parent''s fees are switched back on', pg_temp.t_try(u_p1, 'select 1 where public.feature_enabled(''fees'')'), 'ok:1'),
    -- Email beside SMS
    ('sms and email are in the feature catalogue, on by default',
       pg_temp.t_try(u_admin, 'select 1 from public.app_features where key in (''sms'', ''email'')'), 'ok:2'),
    ('messages is the module, sms and email are channels',
       pg_temp.t_try(u_admin, 'select 1 from public.app_features where (key = ''messages'' and kind = ''module'') or (key in (''sms'', ''email'') and kind = ''channel'')'), 'ok:3'),
    ('email cannot be on while messages are off',
       pg_temp.t_try(u_admin, 'select public.set_school_features((select array_agg(key) from public.app_features where key <> ''messages''))'), 'denied'),
    ('an admin switches email off and keeps sms',
       pg_temp.t_try(u_admin, 'select public.set_school_features((select array_agg(key) from public.app_features where key <> ''email''))'), 'ok:1'),
    ('the disabled list says email only', pg_temp.t_try(u_admin, 'select 1 where public.my_disabled_features() = array[''email'']'), 'ok:1'),
    ('and messages stay on for the office', pg_temp.t_try(u_admin, 'select 1 where public.has_capability(''messages.send_all'')'), 'ok:1'),
    ('the admin puts everything back', pg_temp.t_try(u_admin, format('select public.set_school_features(%s)', '(select array_agg(key) from public.app_features)')), 'ok:1'),
    ('admin cannot call the email audience',
       pg_temp.t_try(u_admin, format('select * from public.messaging_audience(%L, ''all_parents'', null, current_date, ''email'')', a)), 'denied'),
    ('anon cannot call the email audience',
       pg_temp.t_anon(format('select * from public.messaging_audience(%L, ''all_parents'', null, current_date, ''email'')', a)), 'denied'),
    ('admin cannot insert an email message',
       pg_temp.t_try(u_admin, format('insert into public.messages (batch_id,kind,channel,recipient_email,body) values (%L,''x'',''email'',''a@b.com'',''x'')', mb)), 'denied'),
    ('a message must have an address for its channel',
       pg_temp.t_scalar(format('select case when exists (select 1 from pg_constraint where conname = ''messages_has_address'') then ''yes'' else ''no'' end')), 'yes'),
    ('reception stops email to a parent',
       pg_temp.t_try(u_rec, format('update public.guardians set email_opt_out = true where id = %L', g1)), 'ok:1'),
    ('teacher1 cannot stop email to a parent',
       pg_temp.t_try(u_t1, format('update public.guardians set email_opt_out = true where id = %L', g2)), 'ok:0'),
    ('a parent cannot stop their own email through the app',
       pg_temp.t_try(u_p2, format('update public.guardians set email_opt_out = true where id = %L', g2)), 'ok:0'),
    ('batch summaries say which channel they were',
       pg_temp.t_try(u_admin, 'select channel from public.message_batch_stats(5) where channel is not null'), 'ok:' || (rb + 1)),
    ('the changes were audited', pg_temp.t_scalar('select (count(*) >= 2)::text from public.audit_log where action = ''FEATURES_CHANGE'''), 'true')
  ) as x(label, got, want)
  loop
    if r.got = r.want then passes := passes + 1;
    else fails := fails || format('FAIL %s: got %s, expected %s', r.label, r.got, r.want) || E'\n';
    end if;
  end loop;

  raise exception 'RLS TESTS (rolled back)' using detail =
    format('%s passed, %s', passes, case when fails = '' then 'no failures' else E'failures:\n' || fails end);
end $$;

rollback;
