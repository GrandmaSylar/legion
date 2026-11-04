"""End-to-end test of syllabus PDF storage against the linked Supabase project, through the real Storage API.

Run:  python supabase/tests/syllabus_files_e2e.py
Needs the Supabase CLI logged in and linked, and .env.local at the repo root.

Makes a throwaway head, teacher and parent, then checks what each can do with the private bucket: the head uploads a
PDF, a teacher cannot upload, the bucket refuses a non-PDF and a file over 10 MB, the head cannot write into another
school's folder, a teacher can open the PDF through a short-lived link and a parent cannot, a file is listed only
if it is really there, and removing works only for the head. Removes everything afterwards.
"""
import json, re, secrets, subprocess, sys, tempfile, urllib.error, urllib.parse, urllib.request, uuid
from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[2])
env = dict(l.strip().split("=", 1) for l in open(Path(ROOT) / ".env.local") if "=" in l and not l.startswith("#"))
URL, KEY = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"]
NIL = "00000000-0000-0000-0000-000000000000"
QFILE = str(Path(tempfile.gettempdir()) / "syl_files_e2e.sql")
BUCKET = "syllabus-files"
PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
results = []
kept = []


def check(label, ok):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + label)


def sql(q):
    Path(QFILE).write_text(q, encoding="utf8")
    r = subprocess.run(["supabase", "db", "query", "--linked", "-f", QFILE], cwd=ROOT, capture_output=True, text=True, shell=True)
    return r.stdout + r.stderr


def http(method, url, body=None, headers=None):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def sign_in(email, pw):
    s, b = http("POST", URL + "/auth/v1/token?grant_type=password", json.dumps({"email": email, "password": pw}).encode(), {"apikey": KEY, "Content-Type": "application/json"})
    return json.loads(b).get("access_token")


def make_login(email, pw, role):
    out = sql(f"""
      with u as (insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
        values ('{NIL}',gen_random_uuid(),'authenticated','authenticated','{email}',extensions.crypt('{pw}', extensions.gen_salt('bf')),now(),'{{"provider":"email","providers":["email"]}}','{{}}',now(),now(),'','','','') returning id),
      i as (insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at) select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', '{email}'), 'email', now(), now(), now() from u),
      p as (insert into public.profiles (id, school_id, full_name, email) select u.id, s.id, 'ZZ Files {role}', '{email}' from u, public.schools s where s.name = 'Pinks Academy' returning id, school_id)
      insert into public.user_roles (profile_id, school_id, role) select id, school_id, '{role}' from p returning profile_id""")
    if "profile_id" not in out:
        print("SETUP ERROR:", re.sub(r"\s+", " ", out)[:300])
        sys.exit(2)


def upload(token, path, data, ctype="application/pdf"):
    return http("POST", f"{URL}/storage/v1/object/{BUCKET}/{path}", data, {"apikey": KEY, "Authorization": "Bearer " + token, "Content-Type": ctype, "x-upsert": "false"})


def sign(token, path):
    return http("POST", f"{URL}/storage/v1/object/sign/{BUCKET}/{path}", json.dumps({"expiresIn": 60}).encode(), {"apikey": KEY, "Authorization": "Bearer " + token, "Content-Type": "application/json"})


def remove(token, path):
    return http("DELETE", f"{URL}/storage/v1/object/{BUCKET}/{path}", None, {"apikey": KEY, "Authorization": "Bearer " + token})


def rpc(token, name, body):
    s, b = http("POST", URL + "/rest/v1/rpc/" + name, json.dumps(body).encode(), {"apikey": KEY, "Authorization": "Bearer " + token, "Content-Type": "application/json"})
    return s, (json.loads(b) if b else None)


def cleanup():
    sql("""
      delete from public.syllabus_documents where title like 'ZZ Files%';
      delete from public.user_roles where profile_id in (select id from public.profiles where email like 'zz-files-%@example.test');
      delete from public.profiles where email like 'zz-files-%@example.test';
      delete from auth.identities where user_id in (select id from auth.users where email like 'zz-files-%@example.test');
      delete from auth.users where email like 'zz-files-%@example.test'""")


pw = "Zz-" + secrets.token_urlsafe(10)
cleanup()
try:
    for e, r in (("admin", "school_admin"), ("teacher", "teacher"), ("parent", "parent")):
        make_login(f"zz-files-{e}@example.test", pw, r)
    ids = sql("select (select id from public.schools where name = 'Pinks Academy') school, (select id from public.subjects limit 1) subject, (select id from public.levels limit 1) level")
    school, subject, level = (re.search(rf'"{k}":\s*"([0-9a-f-]{{36}})"', ids).group(1) for k in ("school", "subject", "level"))
    admin, teacher, parent = (sign_in(f"zz-files-{e}@example.test", pw) for e in ("admin", "teacher", "parent"))
    base = f"{school}/{subject}/{level}"
    path = f"{base}/{uuid.uuid4()}.pdf"
    kept.append(path)

    s, _ = upload(admin, path, PDF)
    check("the head can upload a PDF to their school's folder", s == 200)
    check("a teacher cannot upload", upload(teacher, f"{base}/{uuid.uuid4()}.pdf", PDF)[0] in (400, 401, 403))
    check("a parent cannot upload", upload(parent, f"{base}/{uuid.uuid4()}.pdf", PDF)[0] in (400, 401, 403))
    check("the head cannot upload to another school's folder", upload(admin, f"{uuid.uuid4()}/{subject}/{level}/{uuid.uuid4()}.pdf", PDF)[0] in (400, 401, 403))
    check("the bucket refuses something that is not a PDF", upload(admin, f"{base}/{uuid.uuid4()}.pdf", b"hello", "text/plain")[0] in (400, 415))
    check("and a file with a name that is not .pdf", upload(admin, f"{base}/{uuid.uuid4()}.txt", PDF)[0] in (400, 401, 403, 415))
    check("and a file over 10 MB", upload(admin, f"{base}/{uuid.uuid4()}.pdf", PDF + b"0" * (11 * 1024 * 1024))[0] in (400, 413))

    s, body = sign(teacher, path)
    link = json.loads(body).get("signedURL") if s == 200 else None
    check("a teacher is given a short-lived link to the PDF", s == 200 and bool(link))
    if link:
        s2, content = http("GET", URL + "/storage/v1" + link if link.startswith("/") else URL + link)
        check("which opens the file", s2 == 200 and content.startswith(b"%PDF-"))
    check("a parent is not given a link", sign(parent, path)[0] in (400, 401, 403, 404))
    check("the file has no public address", http("GET", f"{URL}/storage/v1/object/public/{BUCKET}/{path}")[0] in (400, 401, 403, 404))

    s, doc = rpc(admin, "add_syllabus_document", {"p_subject": subject, "p_level": level, "p_title": "ZZ Files syllabus", "p_path": path})
    check("the head lists the document", s == 200 and bool(doc))
    s, _ = rpc(admin, "add_syllabus_document", {"p_subject": subject, "p_level": level, "p_title": "ZZ Files ghost", "p_path": f"{base}/{uuid.uuid4()}.pdf"})
    check("a file that was never uploaded cannot be listed", s != 200)
    s, listed = http("GET", URL + "/rest/v1/syllabus_documents?select=title&title=like.ZZ%20Files*", None, {"apikey": KEY, "Authorization": "Bearer " + teacher})
    check("a teacher sees it in the list", s == 200 and b"ZZ Files syllabus" in listed)
    s, listed = http("GET", URL + "/rest/v1/syllabus_documents?select=title&title=like.ZZ%20Files*", None, {"apikey": KEY, "Authorization": "Bearer " + parent})
    check("a parent sees nothing in the list", s == 200 and listed.strip() == b"[]")

    check("a teacher cannot remove the file", remove(teacher, path)[0] in (400, 401, 403, 404) and sign(admin, path)[0] == 200)
    check("the head removes it", remove(admin, path)[0] == 200)
    check("and the link no longer works", sign(admin, path)[0] in (400, 404))
finally:
    try:
        for k in kept:
            remove(admin, k)
    except NameError:
        pass
    cleanup()

ok = sum(results)
print(f"\n{ok}/{len(results)} passed")
sys.exit(0 if ok == len(results) else 1)
