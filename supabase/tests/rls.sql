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

do $$
declare
  a uuid; b uuid; yr uuid; term uuid; lvl uuid; c1 uuid; c2 uuid; subj uuid; cs1 uuid; asm uuid;
  s1 uuid; s2 uuid; s3 uuid; e1 uuid; e2 uuid; t1 uuid; t2 uuid; g1 uuid; g2 uuid; i1 uuid; i2 uuid;
  u_admin uuid := gen_random_uuid();  u_prin uuid := gen_random_uuid();
  u_t1 uuid := gen_random_uuid();     u_t2 uuid := gen_random_uuid();
  u_acc uuid := gen_random_uuid();    u_hr uuid := gen_random_uuid();
  u_rec uuid := gen_random_uuid();    u_p1 uuid := gen_random_uuid();
  u_p2 uuid := gen_random_uuid();     u_s1 uuid := gen_random_uuid();
  u_adminb uuid := gen_random_uuid();  u_dev uuid := gen_random_uuid();
  fails text := ''; passes int := 0; got text;
  rs int; rg int; rst int;
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
    (u_adminb,'adminb',b,'school_admin'),(u_dev,'developer',a,'developer')
  ) as x(id, nm, sch, rl)
  loop
    insert into auth.users (id, email, aud, role) values (r.id, r.nm || '@test.local', 'authenticated', 'authenticated');
    insert into public.profiles (id, school_id, full_name) values (r.id, r.sch, r.nm);
    insert into public.user_roles (profile_id, school_id, role) values (r.id, r.sch, r.rl::public.app_role);
  end loop;

  -- structure and people (school A)
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
  insert into storage.objects (bucket_id, name) values
    ('student-photos', s1::text || '/photo.jpg'),
    ('student-photos', s2::text || '/photo.jpg');

  insert into public.invoices (school_id,student_id,term_id) values (a,s1,term) returning id into i1;
  insert into public.invoices (school_id,student_id,term_id) values (a,s2,term) returning id into i2;
  insert into public.invoice_items (school_id,invoice_id,description,amount) values (a,i1,'Fees',500),(a,i2,'Fees',500);
  insert into public.payments (school_id,invoice_id,amount,method) values (a,i1,100,'cash'),(a,i2,100,'cash');

  -- expectation helper: (label, actual, expected)
  for r in select * from (values
    -- students
    ('students admin',      pg_temp.t_count(u_admin,'students')::text,(rs + 2)::text),
    ('students principal',  pg_temp.t_count(u_prin,'students')::text,(rs + 2)::text),
    ('students reception',  pg_temp.t_count(u_rec,'students')::text,(rs + 2)::text),
    ('students accountant', pg_temp.t_count(u_acc,'students')::text,(rs + 2)::text),
    ('students teacher1',   pg_temp.t_count(u_t1,'students')::text,'1'),
    ('students teacher2',   pg_temp.t_count(u_t2,'students')::text,'1'),
    ('students hr',         pg_temp.t_count(u_hr,'students')::text,'0'),
    ('students parent1',    pg_temp.t_count(u_p1,'students')::text,'1'),
    ('students student1',   pg_temp.t_count(u_s1,'students')::text,'1'),
    ('students other school admin', pg_temp.t_count(u_adminb,'students')::text,'1'),
    ('students anonymous',  pg_temp.t_count(null,'students')::text,'0'),
    -- attendance
    ('attendance admin',    pg_temp.t_count(u_admin,'attendance')::text,'2'),
    ('attendance principal',pg_temp.t_count(u_prin,'attendance')::text,'2'),
    ('attendance teacher1', pg_temp.t_count(u_t1,'attendance')::text,'1'),
    ('attendance parent1',  pg_temp.t_count(u_p1,'attendance')::text,'1'),
    ('attendance student1', pg_temp.t_count(u_s1,'attendance')::text,'1'),
    ('attendance accountant', pg_temp.t_count(u_acc,'attendance')::text,'0'),
    ('attendance hr',       pg_temp.t_count(u_hr,'attendance')::text,'0'),
    -- finance
    ('invoices admin',      pg_temp.t_count(u_admin,'invoices')::text,'2'),
    ('invoices accountant', pg_temp.t_count(u_acc,'invoices')::text,'2'),
    ('invoices principal',  pg_temp.t_count(u_prin,'invoices')::text,'0'),
    ('invoices teacher1',   pg_temp.t_count(u_t1,'invoices')::text,'0'),
    ('invoices reception',  pg_temp.t_count(u_rec,'invoices')::text,'0'),
    ('invoices parent1',    pg_temp.t_count(u_p1,'invoices')::text,'1'),
    ('payments accountant', pg_temp.t_count(u_acc,'payments')::text,'2'),
    ('payments principal',  pg_temp.t_count(u_prin,'payments')::text,'0'),
    ('payments parent1',    pg_temp.t_count(u_p1,'payments')::text,'1'),
    ('payments other school admin', pg_temp.t_count(u_adminb,'payments')::text,'0'),
    -- staff, guardians, people
    ('staff admin',         pg_temp.t_count(u_admin,'staff')::text,(rst + 2)::text),
    ('staff hr',            pg_temp.t_count(u_hr,'staff')::text,(rst + 2)::text),
    ('staff parent1',       pg_temp.t_count(u_p1,'staff')::text,'0'),
    ('guardians admin',     pg_temp.t_count(u_admin,'guardians')::text,(rg + 2)::text),
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
    -- school B's admin sees only school B's own audit rows (its role grant + one student)
    ('audit other school admin sees only own school', pg_temp.t_count(u_adminb,'audit_log')::text,'2'),
    -- BECE index numbers
    ('bece admin',          pg_temp.t_count(u_admin,'bece_registrations')::text,'1'),
    ('bece teacher1',       pg_temp.t_count(u_t1,'bece_registrations')::text,'0'),
    -- developer sees at least everything an admin sees
    ('students developer',  pg_temp.t_count(u_dev,'students')::text,(rs + 2)::text),
    ('attendance developer',pg_temp.t_count(u_dev,'attendance')::text,'2'),
    ('invoices developer',  pg_temp.t_count(u_dev,'invoices')::text,'2'),
    ('staff developer',     pg_temp.t_count(u_dev,'staff')::text,'2'),
    ('profiles developer',  pg_temp.t_count(u_dev,'profiles')::text,(select count(*) from public.profiles where school_id = a)::text),
    ('developer is scoped to own school', pg_temp.t_count(u_dev,'classes')::text,(select count(*) from public.classes where school_id = a)::text),
    ('students other school admin sees not developer school', pg_temp.t_count(u_adminb,'profiles')::text,'1'),
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
    -- photos follow the same visibility as the student
    ('photos: admin sees both',
       pg_temp.t_try(u_admin, 'select 1 from storage.objects where bucket_id = ''student-photos'' and name like ''%/photo.jpg'' and owner is null and ' || format('(name like %L or name like %L)', s1::text || '/%', s2::text || '/%')), 'ok:2'),
    ('photos: parent1 sees only own child',
       pg_temp.t_try(u_p1, 'select 1 from storage.objects where bucket_id = ''student-photos'''), 'ok:1'),
    ('photos: student1 sees only own',
       pg_temp.t_try(u_s1, 'select 1 from storage.objects where bucket_id = ''student-photos'''), 'ok:1'),
    ('photos: teacher1 sees only own class',
       pg_temp.t_try(u_t1, 'select 1 from storage.objects where bucket_id = ''student-photos'''), 'ok:1'),
    ('photos: hr sees none',
       pg_temp.t_try(u_hr, 'select 1 from storage.objects where bucket_id = ''student-photos'''), 'ok:0'),
    ('photos: other school admin sees none',
       pg_temp.t_try(u_adminb, 'select 1 from storage.objects where bucket_id = ''student-photos'''), 'ok:0'),
    ('photos: reception uploads',
       pg_temp.t_try(u_rec, format('insert into storage.objects (bucket_id, name) values (''student-photos'', %L)', s1::text || '/new.jpg')), 'ok:1'),
    ('photos: teacher1 uploads',
       pg_temp.t_try(u_t1, format('insert into storage.objects (bucket_id, name) values (''student-photos'', %L)', s1::text || '/t.jpg')), 'denied'),
    ('photos: parent1 uploads',
       pg_temp.t_try(u_p1, format('insert into storage.objects (bucket_id, name) values (''student-photos'', %L)', s1::text || '/p.jpg')), 'denied'),
    ('photos: other school admin uploads for school A student',
       pg_temp.t_try(u_adminb, format('insert into storage.objects (bucket_id, name) values (''student-photos'', %L)', s1::text || '/x.jpg')), 'denied'),
    ('teacher1 grants themself admin',
       pg_temp.t_try(u_t1, format('insert into public.user_roles (profile_id,school_id,role) values (%L,%L,''school_admin'')', u_t1, a)), 'denied')
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
