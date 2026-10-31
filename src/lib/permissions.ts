// Role model for the UI. This only decides what to show; the database (RLS)
// is the real enforcement, so a hidden link is never the only protection.

export type AppRole =
  | "developer"
  | "super_admin"
  | "school_admin"
  | "principal"
  | "teacher"
  | "hr_officer"
  | "accountant"
  | "librarian"
  | "receptionist"
  | "parent"
  | "student";

export const ROLE_LABELS: Record<AppRole, string> = {
  developer: "Developer",
  super_admin: "Super admin",
  school_admin: "School admin",
  principal: "Principal",
  teacher: "Teacher",
  hr_officer: "HR officer",
  accountant: "Accountant",
  librarian: "Librarian",
  receptionist: "Receptionist",
  parent: "Parent",
  student: "Student",
};

/** A developer satisfies every school_admin check, mirroring has_role() in the database. */
export function effectiveRoles(roles: AppRole[]): AppRole[] {
  return roles.includes("developer") && !roles.includes("school_admin")
    ? [...roles, "school_admin"]
    : roles;
}

export function hasAnyRole(roles: AppRole[], allowed: AppRole[]): boolean {
  const mine = effectiveRoles(roles);
  return allowed.some((r) => mine.includes(r));
}

export interface NavItem {
  id: string;
  label: string;
  path: string;
  /** Roles that see this item. A developer sees whatever school_admin sees. */
  roles: AppRole[];
  /** False until the screen exists; the route renders a "coming soon" page. */
  built: boolean;
}

const STAFF: AppRole[] = [
  "school_admin", "principal", "teacher", "hr_officer", "accountant", "librarian", "receptionist",
];

export const NAV: NavItem[] = [
  { id: "dashboard", label: "Overview", path: "/", roles: [...STAFF, "parent", "student"], built: true },
  { id: "students", label: "Students", path: "/students", roles: ["school_admin", "principal", "teacher", "receptionist", "accountant"], built: false },
  { id: "attendance", label: "Attendance", path: "/attendance", roles: ["school_admin", "principal", "teacher"], built: false },
  { id: "grades", label: "Grades", path: "/grades", roles: ["school_admin", "principal", "teacher", "parent", "student"], built: false },
  { id: "fees", label: "Fees", path: "/fees", roles: ["school_admin", "accountant", "parent"], built: false },
  { id: "staff", label: "Staff", path: "/staff", roles: ["school_admin", "hr_officer", "principal"], built: false },
  { id: "notices", label: "Notices", path: "/notices", roles: [...STAFF, "parent", "student"], built: false },
  { id: "settings", label: "Settings", path: "/settings", roles: ["school_admin"], built: true },
];

export function navFor(roles: AppRole[]): NavItem[] {
  return NAV.filter((item) => hasAnyRole(roles, item.roles));
}
