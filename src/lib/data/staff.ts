// Data layer for the Staff Directory and HR management (public.staff).
// RLS allows staff members to read and school_admin / hr_officer to write.
import { supabase } from "../supabase";

function check<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

export type StaffType = "teaching" | "non_teaching";
export type StaffStatus = "active" | "on_leave" | "left";

export interface StaffMember {
  id: string;
  profileId: string | null;
  staffNo: string | null;
  fullName: string;
  roleTitle: string | null;
  type: StaffType;
  phone: string | null;
  email: string | null;
  hiredOn: string | null;
  status: StaffStatus;
  classesCount: number;
  subjectsCount: number;
}

export async function listStaff(): Promise<StaffMember[]> {
  const rows = check(
    await supabase
      .from("staff")
      .select(
        "id, profile_id, staff_no, full_name, role_title, type, phone, email, hired_on, status, classes(count), class_subjects(count)",
      )
      .is("deleted_at", null)
      .order("full_name"),
  );

  return rows.map((r) => {
    const cls = Array.isArray(r.classes) ? r.classes[0] : r.classes;
    const subj = Array.isArray(r.class_subjects)
      ? r.class_subjects[0]
      : r.class_subjects;
    return {
      id: r.id,
      profileId: r.profile_id,
      staffNo: r.staff_no,
      fullName: r.full_name,
      roleTitle: r.role_title,
      type: r.type as StaffType,
      phone: r.phone,
      email: r.email,
      hiredOn: r.hired_on,
      status: r.status as StaffStatus,
      classesCount: cls?.count ?? 0,
      subjectsCount: subj?.count ?? 0,
    };
  });
}

export async function createStaffMember(input: {
  fullName: string;
  type: StaffType;
  roleTitle?: string;
  phone?: string;
  email?: string;
  hiredOn?: string;
  status?: StaffStatus;
}): Promise<void> {
  check(
    await supabase.from("staff").insert({
      full_name: input.fullName.trim(),
      type: input.type,
      role_title: input.roleTitle?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      hired_on: input.hiredOn || null,
      status: input.status ?? "active",
    }),
  );
}

export async function updateStaffMember(
  id: string,
  patch: {
    fullName?: string;
    type?: StaffType;
    roleTitle?: string;
    phone?: string;
    email?: string;
    hiredOn?: string;
    status?: StaffStatus;
  },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.fullName !== undefined) body.full_name = patch.fullName.trim();
  if (patch.type !== undefined) body.type = patch.type;
  if (patch.roleTitle !== undefined)
    body.role_title = patch.roleTitle.trim() || null;
  if (patch.phone !== undefined) body.phone = patch.phone.trim() || null;
  if (patch.email !== undefined) body.email = patch.email.trim() || null;
  if (patch.hiredOn !== undefined) body.hired_on = patch.hiredOn || null;
  if (patch.status !== undefined) body.status = patch.status;

  check(await supabase.from("staff").update(body).eq("id", id));
}

export interface BulkStaffRowInput {
  fullName: string;
  type: StaffType;
  roleTitle?: string;
  phone?: string;
  email?: string;
  hiredOn?: string;
}

export async function bulkCreateStaff(rows: BulkStaffRowInput[]): Promise<number> {
  const payload = rows
    .filter((r) => r.fullName.trim().length > 0)
    .map((r) => ({
      full_name: r.fullName.trim(),
      type: r.type,
      role_title: r.roleTitle?.trim() || null,
      phone: r.phone?.trim() || null,
      email: r.email?.trim() || null,
      hired_on: r.hiredOn?.trim() || null,
      status: "active" as const,
    }));

  if (payload.length === 0) return 0;
  check(await supabase.from("staff").insert(payload));
  return payload.length;

}
