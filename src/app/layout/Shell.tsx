import { NavLink, Outlet } from "react-router";
import {
  Bell, CalendarCheck, GraduationCap, LayoutDashboard, LogOut, Moon, Settings, Sparkles, Square, Sun,
  UserCog, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../lib/auth/AuthProvider";
import { ROLE_LABELS, navFor, type AppRole } from "../../lib/permissions";
import { useTheme } from "../../theme/ThemeProvider";
import { cn } from "../components/ui/utils";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  students: Users,
  attendance: CalendarCheck,
  grades: GraduationCap,
  fees: Wallet,
  staff: UserCog,
  notices: Bell,
  settings: Settings,
};

// Shown in the header: the most senior role the person holds.
const SENIORITY: AppRole[] = [
  "developer", "super_admin", "school_admin", "principal", "teacher", "hr_officer",
  "accountant", "librarian", "receptionist", "parent", "student",
];

function topRole(roles: AppRole[]): string {
  const found = SENIORITY.find((r) => roles.includes(r));
  return found ? ROLE_LABELS[found] : "";
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="surface grid size-10 place-items-center text-foreground/80 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
    >
      {children}
    </button>
  );
}

export function Shell() {
  const { profile, roles, signOut } = useAuth();
  const { mode, surface, setMode, setSurface } = useTheme();
  const items = navFor(roles);

  return (
    <div className="flex min-h-dvh">
      <aside className="surface sticky top-3 m-3 hidden h-[calc(100dvh-1.5rem)] w-60 shrink-0 flex-col p-3 lg:flex">
        <div className="px-3 pb-4 pt-2">
          <div className="text-base font-semibold leading-tight">{profile?.schoolName}</div>
          <div className="text-xs text-muted-foreground">School management</div>
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const Icon = ICONS[item.id] ?? LayoutDashboard;
            return (
              <NavLink
                key={item.id}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground/75 hover:bg-foreground/5 hover:text-foreground",
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 px-4 pb-2 pt-3 lg:px-6">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium lg:hidden">{profile?.schoolName}</div>
            <div className="hidden text-sm text-muted-foreground lg:block">
              {profile?.fullName} · {topRole(roles)}
            </div>
          </div>
          <ToolButton
            label={surface === "glass" ? "Switch to flat surfaces" : "Switch to glass surfaces"}
            onClick={() => setSurface(surface === "glass" ? "flat" : "glass")}
          >
            {surface === "glass" ? <Sparkles className="size-4" /> : <Square className="size-4" />}
          </ToolButton>
          <ToolButton
            label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setMode(mode === "dark" ? "light" : "dark")}
          >
            {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </ToolButton>
          <ToolButton label="Sign out" onClick={() => void signOut()}>
            <LogOut className="size-4" />
          </ToolButton>
        </header>

        <main className="flex-1 px-4 pb-24 pt-2 lg:px-6 lg:pb-8">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Main"
        className="surface fixed inset-x-3 bottom-3 z-10 flex gap-1 overflow-x-auto p-1.5 lg:hidden"
      >
        {items.map((item) => {
          const Icon = ICONS[item.id] ?? LayoutDashboard;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                cn(
                  "flex min-w-16 flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-foreground/70",
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
