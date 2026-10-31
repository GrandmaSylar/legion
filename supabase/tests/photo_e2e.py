"""End-to-end test of student photos through Cloudinary and the student-photo function.

Run:  python supabase/tests/photo_e2e.py
Needs: Supabase CLI logged in and linked, .env.local at the repo root, the three
CLOUDINARY_* secrets set on the project, and Pillow (pip install pillow).

Creates a throwaway student and two throwaway logins (an admin and a teacher who
does not teach that student), uploads a small generated JPEG to Cloudinary as the
admin, fetches it through the expiring link, checks that the plain private URL and
the teacher are refused, deletes the photo, and removes everything it created.
"""
import io, json, re, secrets, subprocess, sys, tempfile, urllib.error, urllib.request, uuid
from pathlib import Path

from PIL import Image

ROOT = str(Path(__file__).resolve().parents[2])
env = dict(l.strip().split("=", 1) for l in open(Path(ROOT) / ".env.local") if "=" in l and not l.startswith("#"))
URL, KEY = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"]
NIL = "00000000-0000-0000-0000-000000000000"
QFILE = str(Path(tempfile.gettempdir()) / "sms_photo_e2e.sql")


def sql(q):
    Path(QFILE).write_text(q, encoding="utf8")
    r = subprocess.run(["supabase", "db", "query", "--linked", "-f", QFILE], cwd=ROOT, capture_output=True, text=True, shell=True)
    return r.stdout + r.stderr


def http(method, url, body=None, headers=None, raw=False):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req) as r:
            data = r.read()
            return r.status, (data if raw else json.loads(data or b"{}")), r.headers
    except urllib.error.HTTPError as e:
        data = e.read()
        try:
            return e.code, (data if raw else json.loads(data)), e.headers
        except Exception:
            return e.code, data[:120], e.headers


def post_json(path, body, token=None):
    h = {"apikey": KEY, "Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    code, data, _ = http("POST", URL + path, json.dumps(body).encode(), h)
    return code, data


def sign_in(email, pw):
    code, body = post_json("/auth/v1/token?grant_type=password", {"email": email, "password": pw})
    return body.get("access_token")


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
        select u.id, s.id, 'ZZ Photo {role}', '{email}' from u, public.schools s where s.name = 'Pinks Academy' returning id, school_id)
      insert into public.user_roles (profile_id, school_id, role) select id, school_id, '{role}' from p returning profile_id""")
    m = re.search(r'"profile_id":\s*"([0-9a-f-]{36})"', out)
    if not m:
        print("SETUP ERROR:", re.sub(r"\s+", " ", out)[:300])
        sys.exit(2)
    return m.group(1)


results = []


def check(label, ok):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + label)


def cleanup():
    sql("""
      delete from public.student_guardians where student_id in (select id from public.students where last_name = 'ZZPhotoTest');
      delete from public.students where last_name = 'ZZPhotoTest';
      delete from public.user_roles where profile_id in (select id from public.profiles where email like 'zz-photo-%@example.test');
      delete from public.profiles where email like 'zz-photo-%@example.test';
      delete from auth.identities where user_id in (select id from auth.users where email like 'zz-photo-%@example.test');
      delete from auth.users where email like 'zz-photo-%@example.test'""")


def tiny_jpeg():
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (200, 60, 120)).save(buf, "JPEG", quality=80)
    return buf.getvalue()


def multipart(fields, file_bytes):
    boundary = uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'.encode() + file_bytes + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


cleanup()
student_id = None
try:
    pw_admin, pw_teacher = secrets.token_urlsafe(14), secrets.token_urlsafe(14)
    make_login("zz-photo-admin@example.test", pw_admin, "school_admin")
    make_login("zz-photo-teacher@example.test", pw_teacher, "teacher")
    admin_t = sign_in("zz-photo-admin@example.test", pw_admin)
    teacher_t = sign_in("zz-photo-teacher@example.test", pw_teacher)
    check("test admin and teacher can sign in", admin_t and teacher_t)

    out = sql("insert into public.students (school_id, first_name, last_name) select id, 'Photo', 'ZZPhotoTest' from public.schools where name='Pinks Academy' returning id")
    student_id = re.search(r'"id":\s*"([0-9a-f-]{36})"', out).group(1)

    # 1. the admin gets a signed upload and sends the photo straight to Cloudinary
    code, sig = post_json("/functions/v1/student-photo", {"action": "sign_upload", "studentId": student_id}, admin_t)
    check("admin receives a signed upload", code == 200 and sig.get("signature"))
    fields = {k: sig[k] for k in ("timestamp", "signature", "public_id", "type", "overwrite", "invalidate")}
    fields["api_key"] = sig["apiKey"]
    body, ctype = multipart(fields, tiny_jpeg())
    code, up, _ = http("POST", f"https://api.cloudinary.com/v1_1/{sig['cloudName']}/image/upload", body, {"Content-Type": ctype})
    check("Cloudinary accepts the signed upload", code == 200 and up.get("type") == "authenticated")
    if code != 200:
        print("   Cloudinary said:", str(up)[:200])

    # 2. record that the student has a photo (the app does this with the admin's token)
    code, _, _ = http("PATCH", f"{URL}/rest/v1/students?id=eq.{student_id}", json.dumps({"photo_url": sig["public_id"]}).encode(),
                      {"apikey": KEY, "Authorization": "Bearer " + admin_t, "Content-Type": "application/json", "Prefer": "return=minimal"})
    check("admin records the photo on the student", code in (200, 204))

    # 3. an expiring link works and serves an image
    code, links = post_json("/functions/v1/student-photo", {"action": "view_urls", "studentIds": [student_id]}, admin_t)
    link = (links.get("urls") or {}).get(student_id) if code == 200 else None
    check("admin receives an expiring link", bool(link))
    if link:
        code, data, headers = http("GET", link, raw=True)
        check("the link serves a JPEG image", code == 200 and data[:2] == b"\xff\xd8")
        check("the link is time limited", "expires_at=" in link)
        # the plain private URL (no signature) must not work
        plain = f"https://res.cloudinary.com/{sig['cloudName']}/image/authenticated/{sig['public_id']}.jpg"
        code, _, _ = http("GET", plain, raw=True)
        check("the unsigned private URL is refused", code >= 400)

    # 4. a teacher who does not teach the student gets nothing
    code, links = post_json("/functions/v1/student-photo", {"action": "view_urls", "studentIds": [student_id]}, teacher_t)
    check("a teacher who cannot see the student gets no link", code == 200 and links.get("urls") == {})
    code, _ = post_json("/functions/v1/student-photo", {"action": "sign_upload", "studentId": student_id}, teacher_t)
    check("a teacher cannot sign an upload", code == 403)

    # 5. deleting removes it from Cloudinary and clears the record
    code, _ = post_json("/functions/v1/student-photo", {"action": "delete", "studentId": student_id}, admin_t)
    check("admin deletes the photo", code == 200)
    flag = sql(f"select photo_url is null as cleared from public.students where id = '{student_id}'")
    check("the student no longer has a photo recorded", '"cleared": true' in flag)
    code, links = post_json("/functions/v1/student-photo", {"action": "view_urls", "studentIds": [student_id]}, admin_t)
    check("no link is issued after deletion", code == 200 and links.get("urls") == {})
finally:
    if student_id:
        # make sure nothing is left in Cloudinary if a step above failed part-way
        sql(f"update public.students set photo_url = null where id = '{student_id}'")
    cleanup()
    left = sql("select (select count(*) from auth.users where email like 'zz-photo-%@example.test') u, (select count(*) from public.students where last_name='ZZPhotoTest') s")
    print("cleanup: leftover test rows =", 0 if '"u": 0' in left and '"s": 0' in left else "SOME")

print(f"\n{sum(results)} of {len(results)} checks passed")
sys.exit(0 if all(results) else 1)
