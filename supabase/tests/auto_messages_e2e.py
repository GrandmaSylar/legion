"""Live check of the automatic sender, after the messaging function is redeployed with the new tick:

    supabase functions deploy messaging --use-api --no-verify-jwt

Run:  python supabase/tests/auto_messages_e2e.py
Needs the Supabase CLI logged in and linked, and .env.local at the repo root.

It proves the one thing that matters about a call with no signed-in person: that it is refused without the
shared secret and, with it, runs and reports. It sends nothing: no school has anything queued for this check,
and it does not switch any automatic message on.
"""
import json, re, subprocess, sys, tempfile, urllib.error, urllib.request
from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[2])
env = dict(l.strip().split("=", 1) for l in open(Path(ROOT) / ".env.local") if "=" in l and not l.startswith("#"))
URL = env["VITE_SUPABASE_URL"]
FN = URL + "/functions/v1/messaging"
QFILE = str(Path(tempfile.gettempdir()) / "auto_e2e.sql")
results = []


def check(label, ok):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + label)


def call(secret=None, method="POST"):
    headers = {"Content-Type": "application/json"}
    if secret is not None:
        headers["x-tick-secret"] = secret
    req = urllib.request.Request(FN, data=b"{}", method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:120].decode(errors="replace")}


def sql(q):
    Path(QFILE).write_text(q, encoding="utf8")
    r = subprocess.run(["supabase", "db", "query", "--linked", "-f", QFILE], cwd=ROOT, capture_output=True, text=True, shell=True)
    return r.stdout + r.stderr


queued = sql("select count(*) as n from public.messages where status = 'queued' and kind like 'auto\\_%'")
check("nothing automatic is waiting, so this check cannot send anything", re.search(r'"n":\s*0', queued) is not None)

s, _ = call("not-the-secret")
check("a call with the wrong secret is refused", s == 401)
s, _ = call("")
check("a call with an empty secret is not treated as the scheduler", s in (401, 403))

out = sql("select public.messaging_tick_secret() as s")
m = re.search(r'"s":\s*"([0-9a-f]{64})"', out)
check("the scheduler's secret exists in the database", m is not None)
if m:
    s, body = call(m.group(1))
    check("with it, the tick runs", s == 200)
    check("and reports what it did", isinstance(body, dict) and body.get("batches") == 0 and body.get("sent") == 0 and body.get("problems") == [])

ok = sum(results)
print(f"\n{ok}/{len(results)} passed")
sys.exit(0 if ok == len(results) else 1)
