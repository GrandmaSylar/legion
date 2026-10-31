// manage-users: create, edit, deactivate and delete logins.
//
// Creating a login needs the service role key, which must never reach the
// browser, so it lives here. Because the service role bypasses row level
// security, every check that RLS would normally do is repeated below:
//   - the caller must be an active school_admin or developer,
//   - every target must belong to the caller's school,
//   - only a developer may touch developer or super_admin accounts or grant those roles.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const STAFF_ROLES = ["school_admin", "principal", "teacher", "hr_officer", "accountant", "librarian", "receptionist"];
const ADMIN_ASSIGNABLE = [...STAFF_ROLES, "parent", "student"];
const PRIVILEGED = ["developer", "super_admin"];
const MODULES = ["students", "attendance", "grades", "fees", "staff", "notices", "settings", "users"];

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function checkPassword(p: string) {
  if (p.length < 8) throw new HttpError(400, "The password must be at least 8 characters.");
}

function checkModules(v: unknown): string[] | null {
  if (v === null || v === undefined) return null;
  const mods = strArray(v);
  if (mods.some((m) => !MODULES.includes(m))) throw new HttpError(400, "Unknown module.");
  return mods;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) throw new HttpError(401, "You are not signed in.");
    const me = auth.user;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = str(body.action);

    // Any signed-in user may clear their own "must change password" flag.
    if (action === "clear_password_flag") {
      const { error } = await admin.auth.admin.updateUserById(me.id, { app_metadata: { must_change_password: false } });
      if (error) throw new HttpError(500, "Could not update your account.");
      return json({ ok: true });
    }

    const { data: profile } = await admin
      .from("profiles").select("id, school_id, is_active").eq("id", me.id).maybeSingle();
    if (!profile?.is_active) throw new HttpError(403, "Your account is not active.");
    const { data: myRoleRows } = await admin.from("user_roles").select("role").eq("profile_id", me.id);
    const myRoles = (myRoleRows ?? []).map((r) => r.role as string);
    const isDev = myRoles.includes("developer");
    if (!isDev && !myRoles.includes("school_admin")) {
      throw new HttpError(403, "You do not have permission to manage users.");
    }
    const schoolId = profile.school_id as string;
    const assignable = isDev ? [...ADMIN_ASSIGNABLE, "developer"] : ADMIN_ASSIGNABLE;

    // Load a target and refuse anything outside the caller's reach.
    async function target(id: string) {
      const { data: p } = await admin
        .from("profiles").select("id, school_id, full_name, is_active").eq("id", id).maybeSingle();
      if (!p || p.school_id !== schoolId) throw new HttpError(404, "User not found.");
      const { data: rows } = await admin.from("user_roles").select("role").eq("profile_id", id);
      const roles = (rows ?? []).map((r) => r.role as string);
      if (!isDev && roles.some((r) => PRIVILEGED.includes(r))) {
        throw new HttpError(403, "Only a developer can change a developer account.");
      }
      return { profile: p, roles };
    }

    function checkRoles(roles: string[]) {
      if (roles.length === 0) throw new HttpError(400, "Choose at least one role.");
      if (roles.some((r) => !assignable.includes(r))) throw new HttpError(403, "You cannot assign one of those roles.");
    }

    // ── create ────────────────────────────────────────────────────────────────
    if (action === "create") {
      const email = str(body.email).toLowerCase();
      const fullName = str(body.fullName);
      const phone = str(body.phone);
      const password = str(body.tempPassword);
      const roles = strArray(body.roles);
      const modules = checkModules(body.modules);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
      if (!fullName) throw new HttpError(400, "Enter the person's name.");
      checkPassword(password);
      checkRoles(roles);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        app_metadata: { must_change_password: true },
        user_metadata: { full_name: fullName },
      });
      if (createError || !created.user) {
        const taken = /already|registered|exists/i.test(createError?.message ?? "");
        throw new HttpError(taken ? 409 : 400, taken ? "That email already has an account." : "Could not create the login.");
      }
      const id = created.user.id;

      try {
        const p = await admin.from("profiles").insert({
          id, school_id: schoolId, full_name: fullName, email, phone: phone || null, modules,
        });
        if (p.error) throw p.error;
        const r = await admin.from("user_roles").insert(roles.map((role) => ({ profile_id: id, school_id: schoolId, role })));
        if (r.error) throw r.error;

        // Staff roles get a staff record so class and subject assignments work.
        if (roles.some((x) => STAFF_ROLES.includes(x))) {
          const no = await admin.rpc("issue_number", { p_school: schoolId, p_kind: "staff_no" });
          const s = await admin.from("staff").insert({
            school_id: schoolId, profile_id: id, full_name: fullName, phone: phone || null, email,
            staff_no: no.error ? null : (no.data as string),
            type: roles.includes("teacher") ? "teaching" : "non_teaching",
          });
          if (s.error) throw s.error;
        }
        // A parent or student login is tied to its existing record.
        const guardianId = str(body.guardianId);
        if (roles.includes("parent") && guardianId) {
          const g = await admin.from("guardians").update({ profile_id: id })
            .eq("id", guardianId).eq("school_id", schoolId).is("profile_id", null).select("id");
          if (g.error || !g.data?.length) throw new HttpError(400, "That parent record is missing or already has a login.");
        }
        const studentId = str(body.studentId);
        if (roles.includes("student") && studentId) {
          const s = await admin.from("students").update({ profile_id: id })
            .eq("id", studentId).eq("school_id", schoolId).is("profile_id", null).select("id");
          if (s.error || !s.data?.length) throw new HttpError(400, "That student record is missing or already has a login.");
        }
      } catch (e) {
        await admin.rpc("delete_user_records", { p_profile: id });
        await admin.auth.admin.deleteUser(id);
        throw e instanceof HttpError ? e : new HttpError(500, "Could not finish creating the user.");
      }
      return json({ ok: true, id });
    }

    const userId = str(body.userId);
    if (!userId) throw new HttpError(400, "Missing user.");

    // ── update ────────────────────────────────────────────────────────────────
    if (action === "update") {
      const t = await target(userId);
      const patch: Record<string, unknown> = {};
      if (body.fullName !== undefined) {
        if (!str(body.fullName)) throw new HttpError(400, "Enter the person's name.");
        patch.full_name = str(body.fullName);
      }
      if (body.phone !== undefined) patch.phone = str(body.phone) || null;
      if (body.modules !== undefined) patch.modules = checkModules(body.modules);
      if (Object.keys(patch).length > 0) {
        const u = await admin.from("profiles").update(patch).eq("id", userId);
        if (u.error) throw new HttpError(500, "Could not save the changes.");
        await admin.from("staff").update({
          ...(patch.full_name ? { full_name: patch.full_name } : {}),
          ...("phone" in patch ? { phone: patch.phone } : {}),
        }).eq("profile_id", userId);
      }

      if (body.roles !== undefined) {
        const roles = strArray(body.roles);
        checkRoles(roles);
        if (userId === me.id && t.roles.includes("developer") && !roles.includes("developer")) {
          throw new HttpError(400, "You cannot remove your own developer role.");
        }
        const removed = t.roles.filter((r) => !roles.includes(r));
        const added = roles.filter((r) => !t.roles.includes(r));
        if (removed.some((r) => PRIVILEGED.includes(r)) && !isDev) throw new HttpError(403, "Only a developer can remove that role.");
        if (removed.includes("developer")) {
          const { count } = await admin.from("user_roles").select("profile_id", { count: "exact", head: true })
            .eq("school_id", schoolId).eq("role", "developer");
          if ((count ?? 0) <= 1) throw new HttpError(400, "At least one developer must remain.");
        }
        if (removed.length) {
          const d = await admin.from("user_roles").delete().eq("profile_id", userId).in("role", removed);
          if (d.error) throw new HttpError(500, "Could not change the roles.");
        }
        if (added.length) {
          const i = await admin.from("user_roles").insert(added.map((role) => ({ profile_id: userId, school_id: schoolId, role })));
          if (i.error) throw new HttpError(500, "Could not change the roles.");
        }
      }
      return json({ ok: true });
    }

    // ── deactivate / reactivate ───────────────────────────────────────────────
    if (action === "set_active") {
      const active = body.active === true;
      if (userId === me.id) throw new HttpError(400, "You cannot deactivate your own account.");
      await target(userId);
      const u = await admin.from("profiles").update({ is_active: active }).eq("id", userId);
      if (u.error) throw new HttpError(500, "Could not change the account.");
      // The ban also stops the person signing in or refreshing a session.
      const b = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
      if (b.error) throw new HttpError(500, "Could not change the account.");
      return json({ ok: true });
    }

    // ── reset password ────────────────────────────────────────────────────────
    if (action === "reset_password") {
      if (userId === me.id) throw new HttpError(400, "Change your own password from your account instead.");
      await target(userId);
      const password = str(body.tempPassword);
      checkPassword(password);
      const r = await admin.auth.admin.updateUserById(userId, { password, app_metadata: { must_change_password: true } });
      if (r.error) throw new HttpError(500, "Could not reset the password.");
      return json({ ok: true });
    }

    // ── delete (developer only, and only when nothing depends on the user) ───
    if (action === "delete") {
      if (!isDev) throw new HttpError(403, "Only a developer can delete a user.");
      if (userId === me.id) throw new HttpError(400, "You cannot delete your own account.");
      const t = await target(userId);
      if (t.roles.includes("developer")) {
        const { count } = await admin.from("user_roles").select("profile_id", { count: "exact", head: true })
          .eq("school_id", schoolId).eq("role", "developer");
        if ((count ?? 0) <= 1) throw new HttpError(400, "At least one developer must remain.");
      }
      const rec = await admin.rpc("delete_user_records", { p_profile: userId });
      if (rec.error) {
        throw new HttpError(409, "This user has recorded activity (such as attendance or payments), so they cannot be deleted. Deactivate them instead.");
      }
      const del = await admin.auth.admin.deleteUser(userId);
      if (del.error) throw new HttpError(500, "The records were removed but the login could not be deleted. Try again.");
      return json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Something went wrong." }, 500);
  }
});
