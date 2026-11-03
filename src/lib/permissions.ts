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
  /**
   * Set once the module is decided by actions instead of roles: the item shows for anyone
   * who holds at least one of these actions, whatever their role.
   */
  anyAction?: string[];
  /** Portal accounts (parents, students) who see this item whatever their actions: they are not staff. */
  portalRoles?: AppRole[];
}

const STAFF: AppRole[] = [
  "school_admin", "principal", "teacher", "hr_officer", "accountant", "librarian", "receptionist",
];

/** Messages is decided by these actions. Holding any one opens the module; each screen inside checks its own. */
export const MESSAGE_ACTIONS = ["messages.view_log", "messages.send_all", "messages.send_fee_reminders", "messages.manage_templates", "messages.manage_setup"];

/** Students is decided by these actions. Seeing students, in all classes or only your own, opens the module. */
export const STUDENT_ACTIONS = ["students.view", "students.view_own_classes"];

/** Attendance: seeing every class, or taking the register for your own or any class. */
export const ATTENDANCE_ACTIONS = ["attendance.view", "attendance.take_own_classes", "attendance.take_any"];

/** Grades: seeing every class, entering marks for your own or any class, or registering BECE candidates. */
export const GRADES_ACTIONS = ["grades.view", "grades.enter_own_classes", "grades.enter_any", "grades.manage_bece"];

export const NAV: NavItem[] = [
  { id: "dashboard", label: "Overview", path: "/", roles: [...STAFF, "parent", "student"], built: true },
  { id: "students", label: "Students", path: "/students", roles: ["school_admin", "principal", "teacher", "receptionist", "accountant"], built: true, anyAction: STUDENT_ACTIONS },
  { id: "attendance", label: "Attendance", path: "/attendance", roles: ["school_admin", "principal", "teacher"], built: true, anyAction: ATTENDANCE_ACTIONS },
  { id: "grades", label: "Grades", path: "/grades", roles: ["school_admin", "principal", "teacher", "receptionist", "parent", "student"], built: true, anyAction: GRADES_ACTIONS, portalRoles: ["parent", "student"] },
  { id: "fees", label: "Fees & Finance", path: "/fees", roles: ["school_admin", "accountant", "principal", "parent"], built: true },
  { id: "analytics", label: "Analytics", path: "/analytics", roles: ["school_admin", "principal", "accountant", "hr_officer"], built: true },
  { id: "staff", label: "Staff", path: "/staff", roles: ["school_admin", "hr_officer", "principal"], built: true },
  { id: "messages", label: "Messages", path: "/messages", roles: ["school_admin", "principal", "accountant"], built: true, anyAction: MESSAGE_ACTIONS },
  { id: "notices", label: "Notices", path: "/notices", roles: [...STAFF, "parent", "student"], built: true },
  { id: "users", label: "Users", path: "/users", roles: ["school_admin"], built: true },
  { id: "settings", label: "Settings", path: "/settings", roles: ["school_admin"], built: true },
];

/**
 * A user's own switches (profile.modules) can only narrow what their role
 * allows. null means "everything the role allows"; Overview is always on.
 */
export function canSee(item: NavItem, roles: AppRole[], modules: string[] | null, caps: string[] | null = null): boolean {
  // A module decided by actions shows for anyone holding one of them, whatever their role.
  // Until the actions have loaded it stays hidden.
  const portal = !!item.portalRoles && hasAnyRole(roles, item.portalRoles);
  const allowed = portal || (item.anyAction ? !!caps && item.anyAction.some((a) => caps.includes(a)) : hasAnyRole(roles, item.roles));
  if (!allowed) return false;
  return modules === null || item.id === "dashboard" || modules.includes(item.id);
}

export function navFor(roles: AppRole[], modules: string[] | null = null, caps: string[] | null = null): NavItem[] {
  return NAV.filter((item) => canSee(item, roles, modules, caps));
}

/** Sections a person with these roles could be given. Overview is always included. */
export function assignableModules(roles: AppRole[]): NavItem[] {
  return NAV.filter((item) => item.id !== "dashboard" && hasAnyRole(roles, item.roles));
}
