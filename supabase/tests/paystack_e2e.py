"""End-to-end test of the paystack Edge Function against the linked Supabase project.

Run:  python supabase/tests/paystack_e2e.py
Needs the Supabase CLI logged in and linked, and .env.local at the repo root with
PAYSTACK_SECRET_KEY set to a TEST key (sk_test_...), the same key saved as a function
secret. It refuses to run against a live key.

Creates throwaway logins (two parents, a teacher), two made-up families and an invoice
each, then drives the live function:
  - who may start a payment (only someone who can see the invoice),
  - amounts and return addresses are validated,
  - Paystack really does create a checkout page (nothing is charged),
  - a webhook is accepted only with a valid signature, records exactly one payment,
    ignores repeats, and refuses a wrong amount,
  - parents see their own attempts and nobody else's.
No card is used: the webhook is signed here with the test key, as Paystack would sign it.
Everything is removed at the end.
"""
import hashlib, hmac, json, re, secrets, subprocess, sys, tempfile, urllib.error, urllib.request
from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[2])
env = dict(l.strip().split("=", 1) for l in open(Path(ROOT) / ".env.local") if "=" in l and not l.startswith("#"))
URL, KEY = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"]
PSK = env.get("PAYSTACK_SECRET_KEY", "").strip().strip('"')
NIL = "00000000-0000-0000-0000-000000000000"
QFILE = str(Path(tempfile.gettempdir()) / "sms_ps_e2e.sql")

if PSK.startswith("sk_live_"):
    sys.exit("Refusing to run: PAYSTACK_SECRET_KEY is a LIVE key. Use a test key (sk_test_...).")


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
    return post_json("/functions/v1/paystack", body, token)


def webhook(event, signed=True, sig=None):
    raw = json.dumps(event).encode()
    signature = sig if sig is not None else hmac.new(PSK.encode(), raw, hashlib.sha512).hexdigest()
    h = {"Content-Type": "application/json", **({"x-paystack-signature": signature} if signed else {})}
    return http("POST", URL + "/functions/v1/paystack", raw, h)


def charge(reference, amount_ghs, channel="card", bank=None):
    return {"event": "charge.success", "data": {
        "reference": reference, "amount": round(amount_ghs * 100), "status": "success", "channel": channel,
        "currency": "GHS", "authorization": {"channel": channel, "bank": bank}}}


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
        select u.id, s.id, 'ZZ Pay {role}', '{email}' from u, public.schools s where s.name = 'Pinks Academy' returning id, school_id)
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


def one(q):
    m = re.search(r'"v":\s*"?([^",}\n]*)"?', sql(q))
    return m.group(1).strip() if m else None


def cleanup():
    s = "(select id from public.students where admission_no like 'ZZPAY-%')"
    i = f"(select id from public.invoices where student_id in {s})"
    sql(f"""
      delete from public.online_payments where invoice_id in {i};
      delete from public.payments where invoice_id in {i};
      delete from public.invoice_items where invoice_id in {i};
      delete from public.invoices where student_id in {s};
      delete from public.enrollments where student_id in {s};
      delete from public.student_guardians where student_id in {s};
      delete from public.students where admission_no like 'ZZPAY-%';
      delete from public.guardians where full_name like 'ZZPay %';
      delete from public.user_roles where profile_id in (select id from public.profiles where email like 'zz-pay-%@example.com');
      delete from public.profiles where email like 'zz-pay-%@example.com';
      delete from auth.identities where user_id in (select id from auth.users where email like 'zz-pay-%@example.com');
      delete from auth.users where email like 'zz-pay-%@example.com'""")


cleanup()
try:
    pw = {k: secrets.token_urlsafe(14) for k in ("p1", "p2", "p3", "acc", "teacher")}
    p1 = make_login("zz-pay-p1@example.com", pw["p1"], "parent")
    p2 = make_login("zz-pay-p2@example.com", pw["p2"], "parent")
    p3 = make_login("zz-pay-p3@example.com", pw["p3"], "parent")
    make_login("zz-pay-acc@example.com", pw["acc"], "accountant")
    make_login("zz-pay-teacher@example.com", pw["teacher"], "teacher")
    t1 = sign_in("zz-pay-p1@example.com", pw["p1"])
    t2 = sign_in("zz-pay-p2@example.com", pw["p2"])
    t3 = sign_in("zz-pay-p3@example.com", pw["p3"])
    tacc = sign_in("zz-pay-acc@example.com", pw["acc"])
    tt = sign_in("zz-pay-teacher@example.com", pw["teacher"])
    check("test logins can sign in", t1 and t2 and tt)

    # two families, one invoice each (GHS 150, nothing paid)
    sql(f"""
      with sc as (select id from public.schools where name = 'Pinks Academy'),
      c as (select id, academic_year_id from public.classes where academic_year_id = (select id from public.academic_years where is_current limit 1) limit 1),
      g1 as (insert into public.guardians (school_id, full_name, phone, profile_id) select id, 'ZZPay One', '0248594482', '{p1}' from sc returning id),
      g2 as (insert into public.guardians (school_id, full_name, phone, profile_id) select id, 'ZZPay Two', '0204906780', '{p2}' from sc returning id),
      g3 as (insert into public.guardians (school_id, full_name, phone, profile_id) select id, 'ZZPay Three', '0248594482', '{p3}' from sc returning id),
      s1 as (insert into public.students (school_id, first_name, last_name, admission_no) select id, 'Ama', 'ZZPay', 'ZZPAY-1' from sc returning id),
      s2 as (insert into public.students (school_id, first_name, last_name, admission_no) select id, 'Kofi', 'ZZPay', 'ZZPAY-2' from sc returning id),
      sg1 as (insert into public.student_guardians (school_id, student_id, guardian_id, is_primary) select sc.id, s1.id, g1.id, true from sc, s1, g1),
      sg2 as (insert into public.student_guardians (school_id, student_id, guardian_id, is_primary) select sc.id, s2.id, g2.id, true from sc, s2, g2),
      sg3 as (insert into public.student_guardians (school_id, student_id, guardian_id, is_primary) select sc.id, s1.id, g3.id, false from sc, s1, g3),
      e1 as (insert into public.enrollments (school_id, student_id, class_id, academic_year_id) select sc.id, s1.id, c.id, c.academic_year_id from sc, s1, c),
      e2 as (insert into public.enrollments (school_id, student_id, class_id, academic_year_id) select sc.id, s2.id, c.id, c.academic_year_id from sc, s2, c),
      i1 as (insert into public.invoices (school_id, student_id) select sc.id, s1.id from sc, s1 returning id),
      i2 as (insert into public.invoices (school_id, student_id) select sc.id, s2.id from sc, s2 returning id),
      it1 as (insert into public.invoice_items (school_id, invoice_id, description, amount) select sc.id, i1.id, 'Fees', 150 from sc, i1)
      insert into public.invoice_items (school_id, invoice_id, description, amount) select sc.id, i2.id, 'Fees', 150 from sc, i2""")
    inv1 = one("select id v from public.invoices where student_id = (select id from public.students where admission_no = 'ZZPAY-1')")
    inv2 = one("select id v from public.invoices where student_id = (select id from public.students where admission_no = 'ZZPAY-2')")
    check("the test families and invoices exist", inv1 and inv2)

    # ── no key needed: who may call, and the webhook door ────────────────────
    check("no token is refused", fn(None, action="status")[0] == 401)
    check("a webhook without a valid signature is refused", webhook(charge("X", 1), sig="deadbeef")[0] == 401)
    check("a webhook with no signature header is treated as an app call and refused", webhook(charge("X", 1), signed=False)[0] == 401)

    code, st = fn(t1, action="status")
    configured = code == 200 and st.get("configured") is True
    check("a parent can read the payment status", code == 200 and "configured" in st)

    if not configured or not PSK:
        print("NOTE  Paystack is not connected (PAYSTACK_SECRET_KEY missing here or on the server): payment checks skipped")
    else:
        check("the server is in test mode", st.get("mode") == "test")
        RET = "http://localhost:5173"

        # ── starting a payment ───────────────────────────────────────────────
        code, r = fn(t1, action="initialize", invoiceId=inv1, amount=60, returnUrl=RET)
        ref1 = r.get("reference")
        if code != 200:
            print("      reply:", code, json.dumps(r)[:300])
        check("a parent can start a payment for their child's invoice", code == 200 and "paystack" in str(r.get("authorizationUrl", "")) and ref1)
        check("a pending attempt was recorded for the right amount",
              one(f"select (status || ':' || amount) v from public.online_payments where reference = '{ref1}'") in ("pending:60.00", "pending:60"))
        check("another parent cannot pay this invoice", fn(t2, action="initialize", invoiceId=inv1, amount=10, returnUrl=RET)[0] == 404)
        check("a teacher cannot pay an invoice", fn(tt, action="initialize", invoiceId=inv1, amount=10, returnUrl=RET)[0] == 404)
        check("more than the balance is refused", fn(t1, action="initialize", invoiceId=inv1, amount=151, returnUrl=RET)[0] == 400)
        check("under GHS 1 is refused", fn(t1, action="initialize", invoiceId=inv1, amount=0.5, returnUrl=RET)[0] == 400)
        check("a return address that is not ours is refused", fn(t1, action="initialize", invoiceId=inv1, amount=10, returnUrl="https://evil.example")[0] == 400)
        check("a made-up invoice is refused", fn(t1, action="initialize", invoiceId=NIL, amount=10, returnUrl=RET)[0] == 404)

        # ── what a parent can see ────────────────────────────────────────────
        c1, rows1 = get_rest("online_payments?select=reference", t1)
        c2, rows2 = get_rest("online_payments?select=reference", t2)
        ct, rowst = get_rest("online_payments?select=reference", tt)
        check("a parent sees their own attempt", c1 == 200 and any(x["reference"] == ref1 for x in rows1))
        check("another parent sees none of it", c2 == 200 and rows2 == [])
        check("a teacher sees none of it", ct == 200 and rowst == [])
        fake = post_json("/rest/v1/online_payments", {"invoice_id": inv1, "reference": "HACK1", "amount": 1}, t1)[0]
        check("a parent cannot write an attempt directly", fake in (401, 403))

        # ── checking before paying ───────────────────────────────────────────
        code, r = fn(t1, action="verify", reference=ref1)
        check("verifying an unpaid attempt says pending", code == 200 and r.get("status") == "pending")
        check("another parent cannot verify it", fn(t2, action="verify", reference=ref1)[0] == 404)

        # ── the webhook records the payment, once ────────────────────────────
        n0 = one(f"select count(*) v from public.payments where invoice_id = '{inv1}'")
        check("a signed charge.success is accepted", webhook(charge(ref1, 60))[0] == 200)
        check("it recorded exactly one payment", one(f"select count(*) v from public.payments where invoice_id = '{inv1}'") == str(int(n0) + 1))
        check("as a card payment with a receipt number",
              one(f"select (method || ':' || (receipt_no like 'RCT/%')) v from public.payments where reference = '{ref1}'") == "card:true")
        check("the invoice is now part paid", one(f"select status v from public.invoices where id = '{inv1}'") == "partial")
        check("the attempt is marked successful", one(f"select status v from public.online_payments where reference = '{ref1}'") == "success")
        webhook(charge(ref1, 60))
        webhook(charge(ref1, 60))
        check("repeated webhooks do not add payments", one(f"select count(*) v from public.payments where reference = '{ref1}'") == "1")
        code, r = fn(t1, action="verify", reference=ref1)
        check("verify now reports success with the receipt", code == 200 and r.get("status") == "success" and str(r.get("receiptNo", "")).startswith("RCT/"))

        # ── mobile money, and a payment that does not match ──────────────────
        code, r = fn(t1, action="initialize", invoiceId=inv1, amount=50, returnUrl=RET)
        ref2 = r.get("reference")
        webhook(charge(ref2, 50, channel="mobile_money", bank="MTN"))
        check("a mobile money charge is recorded with its network",
              one(f"select (method || ':' || network) v from public.payments where reference = '{ref2}'") == "mobile_money:mtn")

        code, r = fn(t1, action="initialize", invoiceId=inv1, amount=20, returnUrl=RET)
        ref3 = r.get("reference")
        webhook(charge(ref3, 25))  # Paystack says 25 but we asked for 20
        check("a charge with the wrong amount is not recorded", one(f"select count(*) v from public.payments where reference = '{ref3}'") == "0")
        check("and is flagged for a person to review",
              one(f"select (status || ':' || (note like 'Amount mismatch%')) v from public.online_payments where reference = '{ref3}'") == "failed:true")
        check("an unknown reference is acknowledged and ignored", webhook(charge("NOSUCHREF", 10))[0] == 200)
        check("the balance is 40 after the two real payments",
              one(f"select (sum(amount) - (select coalesce(sum(amount),0) from public.payments where invoice_id = '{inv1}' and voided_at is null)) v from public.invoice_items where invoice_id = '{inv1}'") in ("40", "40.00"))

        # ── two family members paying at once ────────────────────────────────
        # The invoice has GHS 40 left. Parent one starts 30; parent three (the other guardian) may not start 20.
        code, r = fn(t1, action="initialize", invoiceId=inv1, amount=30, returnUrl=RET)
        refA = r.get("reference")
        check("the first parent starts a 30 payment", code == 200 and refA)
        code, r = fn(t3, action="initialize", invoiceId=inv1, amount=20, returnUrl=RET)
        check("the other guardian cannot start a payment that overshoots", code == 409 and "up to GHS 10.00" in str(r.get("error", "")))
        code, r = fn(t3, action="initialize", invoiceId=inv1, amount=10, returnUrl=RET)
        check("but can pay what is left", code == 200 and r.get("reference"))
        code, r = fn(t1, action="initialize", invoiceId=inv1, amount=30, returnUrl=RET)
        refC = r.get("reference")
        check("a parent can retry their own payment", code == 200 and refC)

        # Both of parent one's attempts get paid: the second overpays and is flagged, not lost.
        webhook(charge(refA, 30))
        webhook(charge(refC, 30))
        check("both payments are recorded (the money is real)", one(f"select count(*) v from public.payments where reference in ('{refA}', '{refC}')") == "2")
        check("the one that overpaid is flagged for review",
              one(f"select (needs_review || ':' || (note like 'Overpaid by 20%')) v from public.online_payments where reference = '{refC}'") == "true:true")
        check("the first one is not flagged", one(f"select needs_review v from public.online_payments where reference = '{refA}'") == "false")

        # ── cancelling a receipt ─────────────────────────────────────────────
        payC = one(f"select id v from public.payments where reference = '{refC}'")
        def rpc(token, **body):
            return post_json("/rest/v1/rpc/void_payment", body, token)
        check("a parent cannot cancel a receipt", rpc(t1, p_payment=payC, p_reason="I would like this undone")[0] >= 400)
        check("a teacher cannot cancel a receipt", rpc(tt, p_payment=payC, p_reason="I would like this undone")[0] >= 400)
        check("an online receipt needs the refund reference", rpc(tacc, p_payment=payC, p_reason="Paid twice by mistake")[0] >= 400)
        check("still not cancelled", one(f"select (voided_at is null) v from public.payments where id = '{payC}'") == "true")
        before = one(f"select (sum(amount) - (select coalesce(sum(amount),0) from public.payments where invoice_id = '{inv1}' and voided_at is null)) v from public.invoice_items where invoice_id = '{inv1}'")
        check("the accountant cancels it with a reason and the refund reference", rpc(tacc, p_payment=payC, p_reason="Paid twice by mistake", p_refund_reference="RF-E2E-1")[0] in (200, 204))
        check("the receipt records who, why and the refund reference",
              one(f"select (voided_at is not null and void_reason = 'Paid twice by mistake' and refund_reference = 'RF-E2E-1' and voided_by is not null) v from public.payments where id = '{payC}'") == "true")
        check("the attempt shows as refunded", one(f"select status v from public.online_payments where reference = '{refC}'") == "refunded")
        after = one(f"select (sum(amount) - (select coalesce(sum(amount),0) from public.payments where invoice_id = '{inv1}' and voided_at is null)) v from public.invoice_items where invoice_id = '{inv1}'")
        check("the balance recovers by the cancelled amount", float(after) - float(before) == 30)
        check("cancelling twice is refused", rpc(tacc, p_payment=payC, p_reason="Trying again please", p_refund_reference="RF-E2E-1")[0] >= 400)
        check("a webhook repeated after a refund adds nothing", (webhook(charge(refC, 30)), one(f"select count(*) v from public.payments where reference = '{refC}'"))[1] == "1")

        # ── a paid-off invoice cannot be paid again ──────────────────────────
        check("the other family's invoice is untouched",
              one(f"select count(*) v from public.payments where invoice_id = '{inv2}'") == "0")
finally:
    cleanup()
    left = sql("select count(*) n from auth.users where email like 'zz-pay-%@example.com'")
    print("cleanup: leftover test logins =", 0 if '"n": 0' in left else "SOME")

print(f"\n{sum(results)} of {len(results)} checks passed")
sys.exit(0 if all(results) else 1)
