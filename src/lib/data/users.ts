// Data layer for user management. Reading the list goes through RLS (only an
// admin may read other profiles). Anything that creates or changes a login goes
// through the manage-users Edge Function, which holds the service key and repeats
// the permission checks the browser cannot be trusted with.
import { supabase } from "../supabase";
import { invokeFunction } from "./functions";
import type { AppRole } from "../permissions";

export interface UserRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  modules: string[] | null;
  roles: AppRole[];
}

export async function listUsers(): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, is_active, modules, user_roles(role)")
    .order("full_name")
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    isActive: r.is_active,
    modules: (r.modules as string[] | null) ?? null,
    roles: ((r.user_roles ?? []) as { role: AppRole }[]).map((x) => x.role),
  }));
}

export async function getUser(id: string): Promise<UserRow | null> {
  const all = await listUsers();
  return all.find((u) => u.id === id) ?? null;
}

// Parent and student logins attach to a record that does not have a login yet.
export interface Linkable {
  id: string;
  label: string;
}

export async function listUnlinkedGuardians(): Promise<Linkable[]> {
  const { data, error } = await supabase
    .from("guardians")
    .select("id, full_name, phone")
    .is("profile_id", null)
    .order("full_name")
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((g) => ({ id: g.id, label: g.phone ? `${g.full_name} (${g.phone})` : g.full_name }));
}

export async function listUnlinkedStudents(): Promise<Linkable[]> {
  const { data, error } = await supabase
    .from("students")
    .select("id, admission_no, first_name, last_name")
    .is("profile_id", null)
    .eq("status", "active")
    .order("last_name")
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id, label: `${s.first_name} ${s.last_name} (${s.admission_no})` }));
}

// ─── Calls to the Edge Function ──────────────────────────────────────────────

function call(body: Record<string, unknown>): Promise<{ id?: string }> {
  return invokeFunction<{ id?: string }>("manage-users", body);
}

export interface NewUser {
  email: string;
  fullName: string;
  phone: string;
  tempPassword: string;
  roles: AppRole[];
  modules: string[] | null;
  guardianId?: string;
  studentId?: string;
}

export const createUser = (u: NewUser) => call({ action: "create", ...u });

export const updateUser = (
  userId: string,
  patch: { fullName?: string; phone?: string; roles?: AppRole[]; modules?: string[] | null },
) => call({ action: "update", userId, ...patch });

export const setUserActive = (userId: string, active: boolean) => call({ action: "set_active", userId, active });

export const resetUserPassword = (userId: string, tempPassword: string) =>
  call({ action: "reset_password", userId, tempPassword });

export const deleteUser = (userId: string) => call({ action: "delete", userId });

/** A readable temporary password: no look-alike characters (0/O, 1/l/I). */
export function generateTempPassword(length = 12): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
