"""End-to-end test of the access calls behind the Users screen, against the linked project.

Run:  python supabase/tests/access_e2e.py
Creates a throwaway admin and teacher, reads the catalogue and grants, changes a teacher's access
the way the screen does, checks the refusals, and removes everything.
"""
import json, re, secrets, subprocess, sys, tempfile, urllib.request, urllib.error
from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[2])
env = dict(l.strip().split("=", 1) for l in open(Path(ROOT) / ".env.local") if "=" in l and not l.startswith("#"))
URL, KEY = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"]
NIL = "00000000-0000-0000-0000-000000000000"
QF = str(Path(tempfile.gettempdir()) / "sms_access_e2e.sql")


def sql(q):
    Path(QF).write_text(q, encoding="utf8")
    r = subprocess.run(["supabase", "db", "query", "--linked", "-f", QF], cwd=ROOT, capture_output=True, text=True, shell=True)
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
            return e.code, {"raw": raw[:160].decode(errors="replace")}


def call(path, token, body=None, method="POST"):
    h = {"apikey": KEY, "Content-Type": "application/json", "Authorization": "Bearer " + token}
    return http(method, URL + path, json.dumps(body).encode() if body is not None else None, h)


def login(email, pw):
    return http("POST", URL + "/auth/v1/token?grant_type=password", json.dumps({"email": email, "password": pw}).encode(), {"apikey": KEY, "Content-Type": "application/json"})[1].get("access_token")


def make(email, pw, role):
    out = sql(f"""
      with u as (insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
        values ('{NIL}',gen_random_uuid(),'authenticated','authenticated','{email}',extensions.crypt('{pw}', extensions.gen_salt('bf')),now(),'{{"provider":"email","providers":["email"]}}','{{}}',now(),now(),'','','','') returning id),
      i as (insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at) select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', '{email}'), 'email', now(), now(), now() from u),
      p as (insert into public.profiles (id, school_id, full_name, email) select u.id, s.id, 'ZZ Access {role}', '{email}' from u, public.schools s where s.name = 'Pinks Academy' returning id, school_id)
      insert into public.user_roles (profile_id, school_id, role) select id, school_id, '{role}' from p returning profile_id""")
    m = re.search(r'"profile_id":\s*"([0-9a-f-]{36})"', out)
    if not m:
        print("SETUP ERROR", out[:200]); sys.exit(2)
    return m.group(1)


def cleanup():
    sql("""delete from public.user_capabilities where profile_id in (select id from public.profiles where email like 'zz-access-%@example.com');
      delete from public.audit_log where action = 'ACCESS_CHANGE' and row_id in (select id from public.profiles where email like 'zz-access-%@example.com');
      delete from public.user_roles where profile_id in (select id from public.profiles where email like 'zz-access-%@example.com');
      delete from public.profiles where email like 'zz-access-%@example.com';
      delete from auth.identities where user_id in (select id from auth.users where email like 'zz-access-%@example.com');
      delete from auth.users where email like 'zz-access-%@example.com'""")


ok = []
def check(label, cond):
    ok.append(bool(cond)); print(("PASS " if cond else "FAIL ") + label)


cleanup()
try:
    pa, pt = secrets.token_urlsafe(12), secrets.token_urlsafe(12)
    make("zz-access-admin@example.com", pa, "school_admin")
    tid = make("zz-access-teacher@example.com", pt, "teacher")
    ta, tt = login("zz-access-admin@example.com", pa), login("zz-access-teacher@example.com", pt)

    c, caps = call("/rest/v1/rpc/my_capabilities", ta, {})
    check("an admin holds all 57 actions", c == 200 and len(caps) == 57)
    c, caps_t = call("/rest/v1/rpc/my_capabilities", tt, {})
    check("a teacher starts with the teacher preset (7 actions)", c == 200 and len(caps_t) == 7 and "students.view_own_classes" in caps_t)
    c, cat = call("/rest/v1/access_capabilities?select=key,module,action,label,description,sensitive&order=sort", ta, method="GET")
    check("the catalogue reads as the screen expects", c == 200 and len(cat) == 57 and {"key", "label", "description", "sensitive"} <= set(cat[0]))
    c, pre = call("/rest/v1/access_preset_capabilities?select=role,capability", ta, method="GET")
    check("presets read", c == 200 and any(r["role"] == "accountant" for r in pre))
    c, mine = call(f"/rest/v1/user_capabilities?select=capability&profile_id=eq.{tid}", ta, method="GET")
    check("an admin reads another person's grants", c == 200 and len(mine) == 7)
    c, r = call("/rest/v1/rpc/set_user_capabilities", ta, {"p_user": tid, "p_caps": ["messages.view_log", "messages.send_fee_reminders"]})
    check("an admin changes a teacher's access through the same call the screen makes", c in (200, 204))
    c, caps_t = call("/rest/v1/rpc/my_capabilities", tt, {})
    check("the change takes effect at once", sorted(caps_t) == ["messages.send_fee_reminders", "messages.view_log"])
    c, r = call("/rest/v1/rpc/set_user_capabilities", tt, {"p_user": tid, "p_caps": list(cat and [x["key"] for x in cat])})
    check("a teacher cannot give themself everything", c >= 400)
    c, r = call("/rest/v1/rpc/set_user_capabilities", ta, {"p_user": tid, "p_caps": ["nope.thing"]})
    check("an unknown action is refused with a readable message", c >= 400 and "Unknown permission" in json.dumps(r))
finally:
    cleanup()
    left = sql("select count(*) n from auth.users where email like 'zz-access-%@example.com'")
    print("cleanup: leftover test logins =", 0 if '"n": 0' in left else "SOME")
print(f"{sum(ok)} of {len(ok)} checks passed")
sys.exit(0 if all(ok) else 1)
