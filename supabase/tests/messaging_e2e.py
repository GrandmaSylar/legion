"""End-to-end test of the messaging Edge Function against the linked Supabase project.

Run:  python supabase/tests/messaging_e2e.py
Needs the Supabase CLI logged in and linked, and .env.local at the repo root.

Creates throwaway logins (admin, accountant, teacher) and a made-up family, drives
the live function, then removes everything. Who-may-send, recipient selection and
message text are checked without Arkesel. If the Arkesel secrets are set, it also
does a sandbox send (accepted by Arkesel, neither delivered nor billed) and checks
the log; it never sends a real SMS.
"""
import json, re, secrets, subprocess, sys, tempfile, urllib.error, urllib.request
from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[2])
env = dict(l.strip().split("=", 1) for l in open(Path(ROOT) / ".env.local") if "=" in l and not l.startswith("#"))
URL, KEY = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"]
NIL = "00000000-0000-0000-0000-000000000000"
QFILE = str(Path(tempfile.gettempdir()) / "sms_msg_e2e.sql")


def sql(q):
    Path(QFILE).write_text(q, encoding="utf8")
    r = subprocess.run(["supabase", "db", "query", "--linked", "-f", QFILE], cwd=ROOT, capture_output=True, text=True, shell=True)
    return r.stdout + r.stderr


def http(method, url, body=None, headers=None):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:120].decode(errors="replace")}


def post_json(path, body, token=None):
    h = {"apikey": KEY, "Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    return http("POST", URL + path, json.dumps(body).encode(), h)


def get_rest(path, token):
    return http("GET", URL + "/rest/v1/" + path, None, {"apikey": KEY, "Authorization": "Bearer " + token})


def sign_in(email, pw):
    return post_json("/auth/v1/token?grant_type=password", {"email": email, "password": pw})[1].get("access_token")


def fn(token, **body):
    return post_json("/functions/v1/messaging", body, token)


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
        select u.id, s.id, 'ZZ Msg {role}', '{email}' from u, public.schools s where s.name = 'Pinks Academy' returning id, school_id)
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
      delete from public.message_batches where created_by in (select id from public.profiles where email like 'zz-msg-%@example.test');
      delete from public.payments where invoice_id in (select i.id from public.invoices i join public.students s on s.id = i.student_id where s.admission_no like 'ZZMSG-%');
      delete from public.invoice_items where invoice_id in (select i.id from public.invoices i join public.students s on s.id = i.student_id where s.admission_no like 'ZZMSG-%');
      delete from public.invoices where student_id in (select id from public.students where admission_no like 'ZZMSG-%');
      delete from public.attendance where enrollment_id in (select e.id from public.enrollments e join public.students s on s.id = e.student_id where s.admission_no like 'ZZMSG-%');
      delete from public.enrollments where student_id in (select id from public.students where admission_no like 'ZZMSG-%');
      delete from public.student_guardians where student_id in (select id from public.students where admission_no like 'ZZMSG-%');
      delete from public.students where admission_no like 'ZZMSG-%';
      delete from public.guardians where full_name like 'ZZMsg %';
      delete from public.staff where email like 'zz-msg-%@example.test';
      delete from public.user_roles where profile_id in (select id from public.profiles where email like 'zz-msg-%@example.test');
      delete from public.profiles where email like 'zz-msg-%@example.test';
      delete from auth.identities where user_id in (select id from auth.users where email like 'zz-msg-%@example.test');
      delete from auth.users where email like 'zz-msg-%@example.test'""")


cleanup()
# The school may hold other parents (demo data). Leave them out of the run so the made-up family is the only audience,
# and put them back as they were afterwards.
OPTED = re.findall(r'"id":\s*"([0-9a-f-]{36})"', sql("select id from public.guardians where not sms_opt_out and full_name not like 'ZZMsg %'"))
IDS = ",".join("'" + i + "'" for i in OPTED)
if OPTED:
    sql("update public.guardians set sms_opt_out = true where id in (" + IDS + ")")
try:
    pw = {k: secrets.token_urlsafe(14) for k in ("admin", "acc", "teacher")}
    make_login("zz-msg-admin@example.test", pw["admin"], "school_admin")
    make_login("zz-msg-acc@example.test", pw["acc"], "accountant")
    make_login("zz-msg-teacher@example.test", pw["teacher"], "teacher")
    admin_t = sign_in("zz-msg-admin@example.test", pw["admin"])
    acc_t = sign_in("zz-msg-acc@example.test", pw["acc"])
    teacher_t = sign_in("zz-msg-teacher@example.test", pw["teacher"])
    check("test logins can sign in", admin_t and acc_t and teacher_t)

    # one family: a parent with two children, one of whom owes 100 and is absent today
    sql("""
      with c as (select id, academic_year_id from public.classes where academic_year_id = (select id from public.academic_years where is_current limit 1) limit 1),
      sc as (select id from public.schools where name = 'Pinks Academy'),
      g as (insert into public.guardians (school_id, full_name, phone) select id, 'ZZMsg Parent', '0244000111' from sc returning id),
      s1 as (insert into public.students (school_id, first_name, last_name, admission_no) select id, 'Ama', 'ZZMsg', 'ZZMSG-1' from sc returning id),
      s2 as (insert into public.students (school_id, first_name, last_name, admission_no) select id, 'Kofi', 'ZZMsg', 'ZZMSG-2' from sc returning id),
      sg as (insert into public.student_guardians (school_id, student_id, guardian_id) select sc.id, s.id, g.id from sc, g, (select id from s1 union all select id from s2) s),
      e1 as (insert into public.enrollments (school_id, student_id, class_id, academic_year_id) select sc.id, s1.id, c.id, c.academic_year_id from sc, s1, c returning id),
      e2 as (insert into public.enrollments (school_id, student_id, class_id, academic_year_id) select sc.id, s2.id, c.id, c.academic_year_id from sc, s2, c returning id),
      inv as (insert into public.invoices (school_id, student_id) select sc.id, s1.id from sc, s1 returning id),
      it as (insert into public.invoice_items (school_id, invoice_id, description, amount) select sc.id, inv.id, 'Fees', 150 from sc, inv),
      pay as (insert into public.payments (school_id, invoice_id, amount, method) select sc.id, inv.id, 50, 'cash' from sc, inv)
      insert into public.attendance (school_id, enrollment_id, date, status) select sc.id, e2.id, current_date, 'absent' from sc, e2""")
    n = sql("select count(*) n from public.students where admission_no like 'ZZMSG-%'")
    check("the test family exists", '"n": 2' in n)

    # ── who may call ─────────────────────────────────────────────────────────
    check("no token is refused", fn(None, action="status")[0] == 401)
    check("a teacher is refused", fn(teacher_t, action="status")[0] == 403)
    check("a teacher cannot preview", fn(teacher_t, action="preview", audience="all_parents", body="Hi")[0] == 403)
    check("an unknown action is refused", fn(admin_t, action="nope")[0] == 400)

    code, st = fn(admin_t, action="status")
    configured = code == 200 and st.get("configured") is True
    check("admin can read the status", code == 200 and "configured" in st)

    # ── recipients and text ──────────────────────────────────────────────────
    code, p = fn(admin_t, action="preview", audience="all_parents", templateKey="fee_reminder")
    check("admin previews all parents: one parent, not one per child", code == 200 and p.get("count") == 1)
    sample = (p.get("sample") or [{}])[0] if code == 200 else {}
    text = sample.get("text", "")
    check("the text names both children", "Ama ZZMsg" in text and "Kofi ZZMsg" in text)
    check("the balance is the 100 still owed", "GHS 100.00" in text)
    check("the phone is in international form", sample.get("phone") == "233244000111")
    check("no placeholder is left unfilled", "{" not in text)

    code, p = fn(admin_t, action="preview", audience="fee_balance", body="Hi {parent}, {student} owes {balance}")
    check("fee balance lists only the child who owes", code == 200 and "Ama" in p["sample"][0]["text"] and "Kofi" not in p["sample"][0]["text"])
    code, p = fn(admin_t, action="preview", audience="absent_today", body="{student} was absent on {date}")
    check("absent today lists only the absent child", code == 200 and p["count"] == 1 and "Kofi ZZMsg" in p["sample"][0]["text"] and "Ama" not in p["sample"][0]["text"])
    code, p = fn(admin_t, action="preview", audience="custom", customNumbers="0244123456, 0244123456\n+233201234567, junk", body="Hello")
    check("custom numbers: duplicates and junk are dropped", code == 200 and p["count"] == 2 and p["skipped"]["badPhone"] == 1 and p["skipped"]["duplicate"] == 1)
    check("class audience needs a class", fn(admin_t, action="preview", audience="class_parents", body="Hi")[0] == 400)
    check("an invalid audience is refused", fn(admin_t, action="preview", audience="everyone", body="Hi")[0] == 400)
    check("an empty message is refused", fn(admin_t, action="preview", audience="all_parents", body="")[0] == 400)
    check("a very long message is refused", fn(admin_t, action="preview", audience="all_parents", body="x" * 700)[0] == 400)
    check("an unknown template is refused", fn(admin_t, action="preview", audience="all_parents", templateKey="nope")[0] == 404)

    # opted-out parents are left alone
    sql("update public.guardians set sms_opt_out = true where full_name = 'ZZMsg Parent'")
    code, p = fn(admin_t, action="preview", audience="all_parents", body="Hi")
    check("an opted-out parent is not messaged", code == 200 and p["count"] == 0)
    sql("update public.guardians set sms_opt_out = false where full_name = 'ZZMsg Parent'")

    # ── the accountant may send fee reminders and nothing else ───────────────
    code, p = fn(acc_t, action="preview", audience="fee_balance", templateKey="fee_reminder")
    check("accountant can preview fee reminders", code == 200 and p["count"] == 1)
    check("accountant cannot message all parents", fn(acc_t, action="preview", audience="all_parents", body="Hi")[0] == 403)
    check("accountant cannot message staff", fn(acc_t, action="preview", audience="staff", body="Hi")[0] == 403)
    check("accountant cannot send a test", fn(acc_t, action="test", to="0244123456")[0] == 403)

    # ── sending ──────────────────────────────────────────────────────────────
    if not configured:
        check("sending without Arkesel set up gives a clear 503", fn(admin_t, action="send", audience="all_parents", body="Hi")[0] == 503)
        print("NOTE  Arkesel secrets are not set: provider checks skipped")
    else:
        code, r = fn(admin_t, action="send", audience="fee_balance", templateKey="fee_reminder", sandbox=True, title="e2e sandbox")
        check("a sandbox send is accepted", code == 200 and r.get("total") == 1 and r.get("remaining") == 0)
        rows = sql("select status, error, provider_message_id is not null as has_id from public.messages where kind = 'fee_reminder' and recipient_phone = '233244000111' order by created_at desc limit 1")
        check("the message is logged as sent (or shows the provider's complaint)", '"status": "sent"' in rows or '"error"' in rows)
        if '"status": "sent"' not in rows:
            print("   log row:", re.sub(r"\s+", " ", rows)[:300])
        code, r = fn(admin_t, action="test", to="0244123456", sandbox=True)
        check("a sandbox test message returns what Arkesel said", code == 200 and r.get("sandbox") is True)
        if code == 200:
            print("   Arkesel replied:", json.dumps(r.get("provider_response"))[:300])
        check("the status call reports the sender", fn(admin_t, action="status")[1].get("sender"))

    # ── the log is readable only by messaging roles, and clients cannot write ─
    code, rows = get_rest("message_batches?select=id", admin_t)
    check("admin can read the batch log", code == 200)
    code, rows = get_rest("messages?select=id", teacher_t)
    check("a teacher sees no messages", code == 200 and rows == [])
    code, _ = http("POST", URL + "/rest/v1/messages", json.dumps({"batch_id": NIL, "kind": "x", "recipient_phone": "233244000111", "body": "x"}).encode(),
                   {"apikey": KEY, "Authorization": "Bearer " + admin_t, "Content-Type": "application/json"})
    check("even an admin cannot insert a message directly", code >= 400)
    code, _ = http("POST", URL + "/rest/v1/rpc/messaging_audience", json.dumps({"p_school": NIL, "p_kind": "all_parents"}).encode(),
                   {"apikey": KEY, "Authorization": "Bearer " + admin_t, "Content-Type": "application/json"})
    check("the audience function cannot be called from the browser", code >= 400)
finally:
    if OPTED:
        sql("update public.guardians set sms_opt_out = false where id in (" + IDS + ")")
    cleanup()
    left = sql("select (select count(*) from auth.users where email like 'zz-msg-%@example.test') u, (select count(*) from public.students where admission_no like 'ZZMSG-%') s, (select count(*) from public.messages where recipient_phone = '233244000111') m")
    print("cleanup: leftover test rows =", 0 if '"u": 0' in left and '"s": 0' in left and '"m": 0' in left else "SOME")

print(f"\n{sum(results)} of {len(results)} checks passed")
sys.exit(0 if all(results) else 1)
