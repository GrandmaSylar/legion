// The app frame: a floating rounded card with an accent icon rail on the left and
// a top bar (current section, search, light/dark, user menu). On phones the rail
// becomes a floating bar at the bottom.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import {
  Bell, CalendarCheck, ChevronDown, GraduationCap, LayoutDashboard, LogOut, Moon, Plus, Search, Settings,
  Sparkles, Square, Sun, UserCog, UserRoundCog, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../lib/auth/AuthProvider";
import { ROLE_LABELS, hasAnyRole, navFor, type AppRole } from "../../lib/permissions";
import { useTheme } from "../../theme/ThemeProvider";
import { StudentAvatar } from "../components/StudentAvatar";
import { Button } from "../components/ui/button";
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
  users: UserRoundCog,
};

// Shown in the user menu: the most senior role the person holds.
const SENIORITY: AppRole[] = [
  "developer", "super_admin", "school_admin", "principal", "teacher", "hr_officer",
  "accountant", "librarian", "receptionist", "parent", "student",
];

function topRole(roles: AppRole[]): string {
  const found = SENIORITY.find((r) => roles.includes(r));
  return found ? ROLE_LABELS[found] : "";
}

/** The one main action for a screen, shown as the top bar's button. */
const PRIMARY_ACTIONS: { path: string; label: string; to: string; roles: AppRole[] }[] = [
  { path: "/students", label: "Add student", to: "/students/new", roles: ["school_admin", "receptionist"] },
  { path: "/users", label: "Add user", to: "/users/new", roles: ["school_admin"] },
];

function RailLink({ to, end, label, Icon }: { to: string; end: boolean; label: string; Icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          "group relative grid size-11 place-items-center rounded-2xl outline-offset-2 transition-all duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-white",
          isActive
            ? "bg-white text-primary shadow-lg shadow-black/20 before:absolute before:-left-[1.1rem] before:h-5 before:w-1 before:rounded-r-full before:bg-white"
            : "text-primary-foreground/80 hover:scale-105 hover:bg-white/15 hover:text-primary-foreground hover:shadow-[0_0_22px_rgba(255,255,255,0.40)]",
        )
      }
    >
      <Icon className="size-5" aria-hidden />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full z-30 ml-3 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </NavLink>
  );
}

function ThemeSwitch() {
  const { mode, setMode } = useTheme();
  const option = (value: "light" | "dark", Icon: LucideIcon, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
        mode === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </button>
  );
  return (
    <div role="group" aria-label="Colour mode" className="flex rounded-full border border-border bg-foreground/5 p-0.5">
      {option("light", Sun, "Light")}
      {option("dark", Moon, "Dark")}
    </div>
  );
}

function UserMenu() {
  const { profile, roles, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const name = profile?.fullName ?? "";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-border bg-foreground/5 py-1 pl-1 pr-2.5 transition-colors hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      >
        <StudentAvatar name={name} className="size-8 text-xs" />
        <span className="hidden max-w-32 truncate text-sm font-medium md:block">{name.split(" ")[0]}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="surface absolute right-0 z-40 mt-2 w-60 space-y-1 p-2 shadow-xl">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="truncate text-xs text-muted-foreground">{profile?.email}</div>
            <div className="mt-1 text-xs text-primary">{topRole(roles)}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Shell() {
  const { profile, roles } = useAuth();
  const { surface, setSurface } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const items = navFor(roles, profile?.modules ?? null);
  const canSearch = items.some((i) => i.id === "students") && hasAnyRole(roles, ["school_admin", "principal", "teacher", "receptionist", "accountant"]);
  const [query, setQuery] = useState("");

  const current = items.find((i) => (i.path === "/" ? location.pathname === "/" : location.pathname.startsWith(i.path)));
  const action = PRIMARY_ACTIONS.find((a) => location.pathname === a.path && hasAnyRole(roles, a.roles));
  const CurrentIcon = current ? (ICONS[current.id] ?? LayoutDashboard) : LayoutDashboard;

  const search = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/students?q=${encodeURIComponent(q)}` : "/students");
  };

  return (
    <div className="min-h-dvh p-2 pb-24 sm:p-3 lg:p-5 lg:pb-5">
      <div className="shell-card mx-auto flex min-h-[calc(100dvh-1rem)] max-w-[110rem] lg:min-h-[calc(100dvh-2.5rem)]">
        {/* Icon rail */}
        <aside className="hidden p-3 lg:block">
          <nav
            aria-label="Main"
            className="sticky top-5 flex h-[calc(100dvh-2.5rem-1.5rem)] w-[4.5rem] flex-col items-center gap-3.5 rounded-[2rem] bg-primary py-6 shadow-xl shadow-primary/25"
            style={{ backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(0,0,0,0.12))" }}
          >
            <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-white/20 text-sm font-bold text-primary-foreground" aria-hidden>
              {(profile?.schoolName ?? "S").slice(0, 1)}
            </div>
            {items.map((item) => (
              <RailLink key={item.id} to={item.path} end={item.path === "/"} label={item.label} Icon={ICONS[item.id] ?? LayoutDashboard} />
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2 pt-4 lg:px-6 lg:pt-5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-muted-foreground">{profile?.schoolName}</div>
              <div className="inline-flex items-center gap-2 border-b-2 border-primary pb-0.5 text-sm font-semibold">
                <CurrentIcon className="size-4" aria-hidden />
                {current?.label ?? "Overview"}
              </div>
            </div>

            {canSearch ? (
              <form onSubmit={search} role="search" className="relative hidden w-72 md:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="search"
                  aria-label="Search students"
                  placeholder="Search students"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-10 w-full rounded-full border border-border bg-foreground/5 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                />
              </form>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSurface(surface === "glass" ? "flat" : "glass")}
                aria-label={surface === "glass" ? "Switch to flat surfaces" : "Switch to glass surfaces"}
                title={surface === "glass" ? "Glass surfaces on" : "Flat surfaces on"}
                className="grid size-9 place-items-center rounded-full border border-border bg-foreground/5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
              >
                {surface === "glass" ? <Sparkles className="size-4" aria-hidden /> : <Square className="size-4" aria-hidden />}
              </button>
              <ThemeSwitch />
              {action ? (
                <Button asChild className="hidden rounded-full sm:inline-flex">
                  <Link to={action.to}><Plus className="size-4" aria-hidden /> {action.label}</Link>
                </Button>
              ) : null}
              <UserMenu />
            </div>
          </header>

          <main className="flex-1 px-4 pb-6 pt-3 lg:px-6">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Phones: the rail becomes a floating bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-3 bottom-3 z-20 flex gap-1 overflow-x-auto rounded-[1.75rem] bg-primary p-1.5 shadow-xl shadow-black/30 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
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
                  "flex min-w-16 flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] transition-colors",
                  isActive ? "bg-white text-primary" : "text-primary-foreground/85",
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
