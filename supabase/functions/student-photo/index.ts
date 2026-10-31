// student-photo: Cloudinary photos for students, kept private.
//
// Photos are stored as Cloudinary "authenticated" assets, which cannot be
// fetched without a signature. The browser never holds the API secret:
//   sign_upload  - returns a signed upload for one student (admin, reception, developer)
//   view_urls    - returns expiring links, only for students the caller can see
//   delete       - removes a student's photo
//   delete_orphan- removes the photo of a student whose record was just deleted
//
// Who may see a student is decided by the database (row level security) by
// reading through a client that carries the caller's own token. The Cloudinary
// asset name is computed here from the school and student ids, never taken from
// the browser, so a stored value cannot be pointed at someone else's photo.
//
// Secrets (set with `supabase secrets set`): CLOUDINARY_CLOUD_NAME,
// CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
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

const EDITORS = ["school_admin", "receptionist", "developer"];
const LINK_SECONDS = 3600;
const MAX_IDS = 100;

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

function cloudinary() {
  const cloud = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const key = Deno.env.get("CLOUDINARY_API_KEY");
  const secret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!cloud || !key || !secret) throw new HttpError(503, "Photo storage is not set up yet.");
  return { cloud, key, secret };
}

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cloudinary's request signature: sorted "key=value" pairs joined with &, plus the secret, SHA-1. */
async function sign(params: Record<string, string | number>, secret: string): Promise<string> {
  const base = Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return sha1Hex(base + secret);
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const publicIdFor = (schoolId: string, studentId: string) => `${schoolId}/students/${studentId}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) throw new HttpError(401, "You are not signed in.");
    const me = auth.user;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = str(body.action);

    const { data: profile } = await admin.from("profiles").select("school_id, is_active").eq("id", me.id).maybeSingle();
    if (!profile?.is_active) throw new HttpError(403, "Your account is not active.");
    const schoolId = profile.school_id as string;
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("profile_id", me.id);
    const roles = (roleRows ?? []).map((r) => r.role as string);
    const canEdit = roles.some((r) => EDITORS.includes(r));

    // Reads go through the caller's own token so row level security decides.
    const asCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    async function visibleStudent(id: string) {
      if (!isUuid(id)) throw new HttpError(400, "Invalid student.");
      const { data } = await asCaller.from("students").select("id, school_id, photo_url").eq("id", id).maybeSingle();
      if (!data || data.school_id !== schoolId) throw new HttpError(404, "Student not found.");
      return data as { id: string; school_id: string; photo_url: string | null };
    }

    // ── sign an upload ──────────────────────────────────────────────────────
    if (action === "sign_upload") {
      if (!canEdit) throw new HttpError(403, "You do not have permission to change photos.");
      const student = await visibleStudent(str(body.studentId));
      const c = cloudinary();
      const params = {
        invalidate: "true",
        overwrite: "true",
        public_id: publicIdFor(schoolId, student.id),
        timestamp: Math.floor(Date.now() / 1000),
        type: "authenticated",
      };
      return json({
        cloudName: c.cloud, apiKey: c.key, signature: await sign(params, c.secret), ...params,
      });
    }

    // ── expiring view links ─────────────────────────────────────────────────
    if (action === "view_urls") {
      const ids = (Array.isArray(body.studentIds) ? body.studentIds : []).filter((x): x is string => typeof x === "string" && isUuid(x));
      if (ids.length === 0) return json({ urls: {} });
      if (ids.length > MAX_IDS) throw new HttpError(400, "Too many photos requested at once.");
      const c = cloudinary();
      const { data: rows } = await asCaller.from("students").select("id, school_id, photo_url").in("id", ids);
      const now = Math.floor(Date.now() / 1000);
      const urls: Record<string, string> = {};
      for (const r of rows ?? []) {
        if (r.school_id !== schoolId || !r.photo_url) continue;
        const params = {
          expires_at: now + LINK_SECONDS,
          format: "jpg",
          public_id: publicIdFor(schoolId, r.id),
          timestamp: now,
          type: "authenticated",
        };
        const signature = await sign(params, c.secret);
        const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: c.key, signature });
        urls[r.id] = `https://api.cloudinary.com/v1_1/${c.cloud}/image/download?${query}`;
      }
      return json({ urls });
    }

    // ── delete a photo ──────────────────────────────────────────────────────
    async function destroy(publicId: string) {
      const c = cloudinary();
      const params = { invalidate: "true", public_id: publicId, timestamp: Math.floor(Date.now() / 1000), type: "authenticated" };
      const form = new URLSearchParams({
        ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
        api_key: c.key,
        signature: await sign(params, c.secret),
      });
      const res = await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/image/destroy`, { method: "POST", body: form });
      if (!res.ok) throw new HttpError(502, "The photo could not be removed from storage.");
    }

    if (action === "delete") {
      if (!canEdit) throw new HttpError(403, "You do not have permission to change photos.");
      const student = await visibleStudent(str(body.studentId));
      await destroy(publicIdFor(schoolId, student.id));
      const { error } = await asCaller.from("students").update({ photo_url: null }).eq("id", student.id);
      if (error) throw new HttpError(500, "The photo was removed but the record could not be updated.");
      return json({ ok: true });
    }

    // The student record is already gone, so there is nothing to read: accept only
    // an asset name inside the caller's own school folder for a student that no
    // longer exists.
    if (action === "delete_orphan") {
      if (!roles.includes("developer")) throw new HttpError(403, "Only a developer can do that.");
      const studentId = str(body.studentId);
      if (!isUuid(studentId)) throw new HttpError(400, "Invalid student.");
      const { data: still } = await admin.from("students").select("id").eq("id", studentId).maybeSingle();
      if (still) throw new HttpError(409, "That student still exists.");
      await destroy(publicIdFor(schoolId, studentId));
      return json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Something went wrong." }, 500);
  }
});
