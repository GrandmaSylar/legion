"""End-to-end test of the manage-users and student-photo Edge Functions against the linked Supabase project.

Run:  python supabase/tests/functions_e2e.py
Needs the Supabase CLI logged in and linked, and .env.local at the repo root.

Creates temporary zz-*@example.test accounts (one admin, one developer), signs in as
them, exercises every action, and removes them at the end. Passwords are random and
never printed. The audit log is insert-only, so its rows for these accounts remain.
"""
import json, re, secrets, subprocess, sys, tempfile, urllib.request, urllib.error
from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[2])
env = dict(l.strip().split("=", 1) for l in open(Path(ROOT) / ".env.local") if "=" in l and not l.startswith("#"))
URL, KEY = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"]
NIL = "00000000-0000-0000-0000-000000000000"


QFILE = str(Path(tempfile.gettempdir()) / "sms_e2e_query.sql")


def sql(q):
    open(QFILE, "w", encoding="utf8").write(q)
    r = subprocess.run(["supabase", "db", "query", "--linked", "-f", QFILE], cwd=ROOT, capture_output=True, text=True, shell=True)
    return r.stdout + r.stderr


def post(path, body, token=None, key=KEY):
    req = urllib.request.Request(
        URL + path, data=json.dumps(body).encode(), method="POST",
        headers={"apikey": key, "Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:120].decode(errors="replace")}


def sign_in(email, pw):
    code, body = post("/auth/v1/token?grant_type=password", {"email": email, "password": pw})
    return code, body.get("access_token")


def fn(token, **body):
    return post("/functions/v1/manage-users", body, token)


def photo(token, **body):
    return post("/functions/v1/student-photo", body, token)


results = []


def check(label, got, want):
    ok = got == want
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + label + ("" if ok else f"  (got {got}, want {want})"))


def make_login(email, pw, role):
    out = sql(f"""
      with u as (
        insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
          raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
        values ('{NIL}',gen_random_uuid(),'authenticated','authenticated','{email}',
          extensions.crypt('{pw}', extensions.gen_salt('bf')),now(),
          '{{"provider":"email","providers":["email"]}}','{{}}',now(),now(),'','','','') returning id),
      i as (insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
        select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', '{email}'), 'email', now(), now(), now() from u),
      p as (insert into public.profiles (id, school_id, full_name, email)
        select u.id, s.id, 'ZZ Test {role}', '{email}' from u, public.schools s where s.name = 'Pinks Academy' returning id, school_id)
      insert into public.user_roles (profile_id, school_id, role) select id, school_id, '{role}' from p returning profile_id""")
    m = re.search(r'"profile_id":\s*"([0-9a-f-]{36})"', out)
    if not m:
        print('SETUP ERROR:', re.sub(r'\s+', ' ', out)[:400])
        sys.exit(2)
    return m.group(1)


def cleanup():
    sql("""
      delete from public.staff where email like 'zz-%@example.test';
      delete from public.user_roles where profile_id in (select id from public.profiles where email like 'zz-%@example.test');
      delete from public.profiles where email like 'zz-%@example.test';
      delete from auth.identities where user_id in (select id from auth.users where email like 'zz-%@example.test');
      delete from auth.users where email like 'zz-%@example.test'""")


cleanup()
try:
    pw_admin, pw_dev, pw_new = (secrets.token_urlsafe(14) for _ in range(3))
    admin_id = make_login("zz-admin@example.test", pw_admin, "school_admin")
    dev_id = make_login("zz-dev@example.test", pw_dev, "developer")
    _, admin_t = sign_in("zz-admin@example.test", pw_admin)
    _, dev_t = sign_in("zz-dev@example.test", pw_dev)
    check("test admin and developer can sign in", bool(admin_t and dev_t), True)

    check("no token is refused", fn(None, action="create")[0], 401)

    # school_admin creates a teacher
    code, r = fn(admin_t, action="create", email="zz-teacher@example.test", fullName="ZZ Teacher",
                 phone="0240000001", tempPassword=pw_new, roles=["teacher"], modules=["students", "attendance"])
    check("admin creates a teacher", code, 200)
    teacher_id = r.get("id")
    out = sql("select (select count(*) from public.staff where profile_id = '%s' and type='teaching' and staff_no is not null) staff, "
              "(select raw_app_meta_data->>'must_change_password' from auth.users where id='%s') flag, "
              "(select modules::text from public.profiles where id='%s') modules" % (teacher_id, teacher_id, teacher_id))
    check("teacher got a staff record", '"staff": 1' in out, True)
    check("teacher must change password", '"flag": "true"' in out, True)
    check("modules saved", "students" in out and "attendance" in out, True)
    check("duplicate email is refused", fn(admin_t, action="create", email="zz-teacher@example.test", fullName="X", tempPassword=pw_new, roles=["teacher"])[0], 409)
    check("short password refused", fn(admin_t, action="create", email="zz-x@example.test", fullName="X", tempPassword="short", roles=["teacher"])[0], 400)
    check("admin cannot grant developer", fn(admin_t, action="create", email="zz-y@example.test", fullName="Y", tempPassword=pw_new, roles=["developer"])[0], 403)
    check("admin cannot grant super_admin", fn(admin_t, action="create", email="zz-y@example.test", fullName="Y", tempPassword=pw_new, roles=["super_admin"])[0], 403)
    check("admin cannot edit a developer", fn(admin_t, action="update", userId=dev_id, fullName="Hacked")[0], 403)
    check("admin cannot deactivate a developer", fn(admin_t, action="set_active", userId=dev_id, active=False)[0], 403)
    check("admin cannot reset a developer's password", fn(admin_t, action="reset_password", userId=dev_id, tempPassword=pw_new)[0], 403)
    check("admin cannot delete users", fn(admin_t, action="delete", userId=teacher_id)[0], 403)
    check("admin cannot deactivate self", fn(admin_t, action="set_active", userId=admin_id, active=False)[0], 400)

    # the new teacher signs in and cannot manage users
    code, teacher_t = sign_in("zz-teacher@example.test", pw_new)
    check("new teacher can sign in", code, 200)
    check("teacher cannot manage users", fn(teacher_t, action="create")[0], 403)
    check("flag cleared by the user", fn(teacher_t, action="clear_password_flag")[0], 200)

    # edit roles and modules
    check("admin changes roles and modules", fn(admin_t, action="update", userId=teacher_id, fullName="ZZ Teacher Two",
          roles=["teacher", "librarian"], modules=None)[0], 200)
    out = sql("select (select count(*) from public.user_roles where profile_id='%s') roles, (select full_name from public.profiles where id='%s') name, "
              "(select modules is null from public.profiles where id='%s') nomods" % (teacher_id, teacher_id, teacher_id))
    check("roles and name updated", '"roles": 2' in out and "ZZ Teacher Two" in out and '"nomods": true' in out, True)
    check("unknown module refused", fn(admin_t, action="update", userId=teacher_id, modules=["nope"])[0], 400)

    # deactivate blocks sign-in and data; reactivate restores
    check("admin deactivates the teacher", fn(admin_t, action="set_active", userId=teacher_id, active=False)[0], 200)
    check("deactivated teacher cannot sign in", sign_in("zz-teacher@example.test", pw_new)[0] >= 400, True)
    check("admin reactivates the teacher", fn(admin_t, action="set_active", userId=teacher_id, active=True)[0], 200)
    check("reactivated teacher can sign in", sign_in("zz-teacher@example.test", pw_new)[0], 200)

    # student photos: permission checks run before Cloudinary is touched, so they
    # hold whether or not the Cloudinary secrets have been set (503 = not set up yet)
    real = re.search(r'"id":\s*"([0-9a-f-]{36})"', sql("select id from public.students order by created_at limit 1"))
    check("photo: no token is refused", photo(None, action="view_urls", studentIds=[])[0], 401)
    check("photo: unknown action is refused", photo(admin_t, action="nope")[0], 400)
    check("photo: teacher cannot sign an upload", photo(teacher_t, action="sign_upload", studentId=real.group(1) if real else NIL)[0], 403)
    check("photo: admin gets 404 for an unknown student", photo(admin_t, action="sign_upload", studentId=NIL)[0], 404)
    if real:
        check("photo: admin can ask to upload for a real student", photo(admin_t, action="sign_upload", studentId=real.group(1))[0] in (200, 503), True)
        code, body = photo(teacher_t, action="view_urls", studentIds=[real.group(1)])
        check("photo: a teacher who cannot see the student gets no link", code == 503 or body.get("urls") == {}, True)
    check("photo: delete_orphan is developer only", photo(admin_t, action="delete_orphan", studentId=NIL)[0], 403)

    # password reset
    pw_reset = secrets.token_urlsafe(14)
    check("admin resets the teacher's password", fn(admin_t, action="reset_password", userId=teacher_id, tempPassword=pw_reset)[0], 200)
    check("old password stops working", sign_in("zz-teacher@example.test", pw_new)[0] >= 400, True)
    check("new password works", sign_in("zz-teacher@example.test", pw_reset)[0], 200)

    # developer powers
    code, r = fn(dev_t, action="create", email="zz-dev2@example.test", fullName="ZZ Dev Two", tempPassword=pw_new, roles=["developer"])
    check("developer can create a developer", code, 200)
    check("developer edits a developer", fn(dev_t, action="update", userId=r.get("id"), fullName="ZZ Dev Renamed")[0], 200)
    check("developer cannot delete self", fn(dev_t, action="delete", userId=dev_id)[0], 400)
    check("developer deletes an unused user", fn(dev_t, action="delete", userId=teacher_id)[0], 200)
    gone = sql("select count(*) n from public.profiles where id='%s'" % teacher_id) + sql("select count(*) n from auth.users where id='%s'" % teacher_id)
    check("deleted user is gone from profiles and auth", gone.count('"n": 0'), 2)
finally:
    cleanup()
    left = sql("select count(*) n from auth.users where email like 'zz-%@example.test'")
    print("cleanup: leftover test logins =", 0 if '"n": 0' in left else "SOME")

print(f"\n{sum(results)} of {len(results)} checks passed")
sys.exit(0 if all(results) else 1)
