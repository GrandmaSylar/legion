"""End-to-end test of the calendar-feed Edge Function against the linked Supabase project.

Run:  python supabase/tests/calendar_feed_e2e.py
Needs the Supabase CLI logged in and linked, the function deployed
(supabase functions deploy calendar-feed --use-api --no-verify-jwt) and .env.local at the repo root.

Makes a throwaway teacher and parent, a published event, a draft and a staff-only event, makes each a link,
fetches the live feed the way a phone would and checks what it holds, then checks that a replaced, stopped or
made-up link gets a plain 404. Removes everything afterwards.
"""
import json, re, secrets, subprocess, sys, tempfile, urllib.error, urllib.request
from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[2])
env = dict(l.strip().split("=", 1) for l in open(Path(ROOT) / ".env.local") if "=" in l and not l.startswith("#"))
URL, KEY = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"]
NIL = "00000000-0000-0000-0000-000000000000"
QFILE = str(Path(tempfile.gettempdir()) / "cal_feed_e2e.sql")
FEED = URL + "/functions/v1/calendar-feed"


def sql(q):
    Path(QFILE).write_text(q, encoding="utf8")
    r = subprocess.run(["supabase", "db", "query", "--linked", "-f", QFILE], cwd=ROOT, capture_output=True, text=True, shell=True)
    return r.stdout + r.stderr


def http(method, url, body=None, headers=None):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


def rpc(name, token):
    s, b, _ = http("POST", URL + "/rest/v1/rpc/" + name, b"{}", {"apikey": KEY, "Authorization": "Bearer " + token, "Content-Type": "application/json"})
    return s, (json.loads(b) if b else None)


def sign_in(email, pw):
    s, b, _ = http("POST", URL + "/auth/v1/token?grant_type=password", json.dumps({"email": email, "password": pw}).encode(), {"apikey": KEY, "Content-Type": "application/json"})
    return json.loads(b).get("access_token")


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
        select u.id, s.id, 'ZZ Feed {role}', '{email}' from u, public.schools s where s.name = 'Pinks Academy' returning id, school_id)
      insert into public.user_roles (profile_id, school_id, role) select id, school_id, '{role}' from p returning profile_id""")
    if "profile_id" not in out:
        print("SETUP ERROR:", re.sub(r"\s+", " ", out)[:300])
        sys.exit(2)


results = []


def check(label, ok):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + label)


def cleanup():
    sql("""
      delete from public.calendar_events where title like 'ZZ FEED%';
      delete from public.user_roles where profile_id in (select id from public.profiles where email like 'zz-feed-%@example.test');
      delete from public.profiles where email like 'zz-feed-%@example.test';
      delete from auth.identities where user_id in (select id from auth.users where email like 'zz-feed-%@example.test');
      delete from auth.users where email like 'zz-feed-%@example.test'""")


def feed_url(token):
    return FEED + "?t=" + token


def token_of(link):
    return link.strip('"')


pw = "Zz-" + secrets.token_urlsafe(10)
cleanup()
try:
    make_login("zz-feed-teacher@example.test", pw, "teacher")
    make_login("zz-feed-parent@example.test", pw, "parent")
    sql("""insert into public.calendar_events (school_id, title, kind, starts_on, ends_on, audience, published)
           select id, t.title, 'event', current_date + 5, current_date + 5, t.aud, t.pub from public.schools s,
           (values ('ZZ FEED Open day', 'all', true), ('ZZ FEED Staff only', 'staff', true), ('ZZ FEED Draft', 'all', false)) as t(title, aud, pub)
           where s.name = 'Pinks Academy'""")
    teacher, parent = sign_in("zz-feed-teacher@example.test", pw), sign_in("zz-feed-parent@example.test", pw)
    s1, t1 = rpc("create_calendar_feed", teacher)
    s2, t2 = rpc("create_calendar_feed", parent)
    check("a teacher and a parent can each make a link", s1 == 200 and s2 == 200 and re.fullmatch(r"[0-9a-f]{48}", t1 or "") and re.fullmatch(r"[0-9a-f]{48}", t2 or ""))

    s, body, h = http("GET", feed_url(t1))
    text = body.decode("utf8", "replace")
    check("the teacher's feed is served", s == 200)
    check("as a calendar a phone can read", "text/calendar" in h.get("Content-Type", "") and text.startswith("BEGIN:VCALENDAR"))
    check("with a hint to refresh about hourly", "REFRESH-INTERVAL;VALUE=DURATION:PT1H" in text)
    check("holding the published events for staff", "ZZ FEED Open day" in text and "ZZ FEED Staff only" in text)
    check("and no draft", "ZZ FEED Draft" not in text)

    s, body, _ = http("GET", feed_url(t2))
    text = body.decode("utf8", "replace")
    check("the parent's feed holds the open day", s == 200 and "ZZ FEED Open day" in text)
    check("but not the staff-only event, nor the draft", "ZZ FEED Staff only" not in text and "ZZ FEED Draft" not in text)

    check("a link may be looked at with HEAD", http("HEAD", feed_url(t1))[0] == 200)
    check("a made-up link gets a plain 404", http("GET", feed_url("0" * 48))[0] == 404)
    check("so does a malformed one", http("GET", feed_url("nope"))[0] == 404 and http("GET", FEED)[0] == 404)
    check("the 404 says nothing about why", b"token" not in http("GET", feed_url("0" * 48))[1].lower())
    check("nothing can be written through it", http("POST", feed_url(t1), b"{}")[0] == 405)

    s3, t1b = rpc("create_calendar_feed", teacher)
    check("making a new link cancels the old one at once", http("GET", feed_url(t1))[0] == 404 and http("GET", feed_url(t1b))[0] == 200)
    rpc("revoke_calendar_feed", teacher)
    check("stopping a link stops it", http("GET", feed_url(t1b))[0] == 404)
    check("another person's link is untouched", http("GET", feed_url(t2))[0] == 200)
finally:
    cleanup()

ok = sum(results)
print(f"\n{ok}/{len(results)} passed")
sys.exit(0 if ok == len(results) else 1)
