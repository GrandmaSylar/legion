// The app frame: a floating rounded card with an accent icon rail on the left and
// a top bar (current section, search, light/dark, user menu). On phones the rail
// becomes a floating bar at the bottom.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import {
  Bell, BarChart3, CalendarCheck, ChevronDown, GraduationCap, LayoutDashboard, LogOut, MoreHorizontal, Moon, Palette, Plus, Search, Settings,
  Sparkles, Square, Sun, UserCog, UserRoundCog, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../lib/auth/AuthProvider";
import { ROLE_LABELS, hasAnyRole, navFor, type AppRole, type NavItem } from "../../lib/permissions";
import { useTheme } from "../../theme/ThemeProvider";
import { ThemeCustomizerModal } from "../../theme/ThemeCustomizer";
import { StudentAvatar } from "../components/StudentAvatar";
import { Button } from "../components/ui/button";
import { cn } from "../components/ui/utils";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  students: Users,
  attendance: CalendarCheck,
  grades: GraduationCap,
  fees: Wallet,
  analytics: BarChart3,
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
          "group relative grid size-12 place-items-center rounded-2xl outline-offset-2 transition-all duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-white [@media(max-height:780px)]:size-10",
          isActive
            ? "bg-white text-primary shadow-lg shadow-black/25"
            : "text-white/90 hover:scale-105 hover:bg-white/15 hover:text-white hover:shadow-[0_0_22px_rgba(255,255,255,0.40)]",
        )
      }
    >
      <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full z-30 ml-3 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </NavLink>
  );
}

/**
 * The rail's shape: a blob attached to the card's left edge, rounded at the top
 * and sweeping back to the edge in an S-curve at the bottom. Drawn as an SVG so
 * the curves stay smooth at any height (it stretches vertically only).
 */
const RAIL_PATH = "M0 0 C70 0 100 36 100 110 L100 450 C100 530 0 520 0 600 Z";

function RailShape() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 600"
      preserveAspectRatio="none"
      className="absolute inset-0 size-full"
      style={{ filter: "drop-shadow(0 18px 26px color-mix(in srgb, var(--primary) 45%, transparent))" }}
    >
      <defs>
        <linearGradient id="rail-shade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#000" stopOpacity="0.16" />
        </linearGradient>
      </defs>
      <path d={RAIL_PATH} style={{ fill: "var(--primary)" }} />
      <path d={RAIL_PATH} fill="url(#rail-shade)" />
    </svg>
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

function UserMenu({ onOpenCustomizer }: { onOpenCustomizer: () => void }) {
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
        <span className="hidden break-words text-sm font-medium md:block">{name.split(" ")[0]}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="surface absolute right-0 z-40 mt-2 w-60 space-y-1 p-2 shadow-xl">
          <div className="px-3 py-2">
            <div className="break-words text-sm font-medium">{name}</div>
            <div className="break-all text-xs text-muted-foreground">{profile?.email}</div>
            <div className="mt-1 text-xs text-primary">{topRole(roles)}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onOpenCustomizer(); }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          >
            <Palette className="size-4" aria-hidden /> Appearance & theme
          </button>
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

/**
 * Bottom navigation for phones and tablets. Phones show the first four sections
 * and a "More" button that opens the rest as a grid, so nothing is cut off or
 * needs swiping. Tablets have room for every section.
 */
const PHONE_SLOTS = 4;

function BottomNav({ items }: { items: NavItem[] }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const rest = items.slice(PHONE_SLOTS);
  const isCurrent = (i: NavItem) => (i.path === "/" ? location.pathname === "/" : location.pathname.startsWith(i.path));
  const moreActive = rest.some(isCurrent);

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const slot =
    "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-0.5 py-1.5 text-[10px] font-medium leading-tight transition-colors sm:text-[11px]";

  return (
    <div ref={ref} className="lg:hidden print:hidden">
      {open && rest.length > 0 ? (
        <div
          role="menu"
          aria-label="More sections"
          className="fixed inset-x-3 bottom-[5.5rem] z-30 grid grid-cols-3 gap-2 rounded-[1.75rem] bg-primary p-3 shadow-xl shadow-black/30 md:hidden"
        >
          {rest.map((item) => {
            const Icon = ICONS[item.id] ?? LayoutDashboard;
            return (
              <NavLink
                key={item.id}
                to={item.path}
                role="menuitem"
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-xs font-medium transition-colors active:scale-95",
                    isActive ? "bg-white text-primary" : "text-white/90 hover:bg-white/15",
                  )
                }
              >
                <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      ) : null}

      <nav
        aria-label="Main"
        className="fixed inset-x-3 bottom-3 z-20 flex gap-0.5 rounded-[1.75rem] bg-primary p-1.5 shadow-xl shadow-black/30"
      >
        {items.map((item, index) => {
          const Icon = ICONS[item.id] ?? LayoutDashboard;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                cn(slot, index >= PHONE_SLOTS && "hidden md:flex", isActive ? "bg-white text-primary" : "text-white/90 active:bg-white/15")
              }
            >
              <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              <span className="whitespace-nowrap max-[309px]:sr-only">{item.label}</span>
            </NavLink>
          );
        })}
        {rest.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="menu"
            className={cn(slot, "md:hidden", moreActive || open ? "bg-white text-primary" : "text-white/90 active:bg-white/15")}
          >
            <MoreHorizontal className="size-5" strokeWidth={1.75} aria-hidden />
            <span className="whitespace-nowrap max-[309px]:sr-only">More</span>
          </button>
        ) : null}
      </nav>
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
  const [customizerOpen, setCustomizerOpen] = useState(false);

  const current = items.find((i) => (i.path === "/" ? location.pathname === "/" : location.pathname.startsWith(i.path)));
  const action = PRIMARY_ACTIONS.find((a) => location.pathname === a.path && hasAnyRole(roles, a.roles));
  const CurrentIcon = current ? (ICONS[current.id] ?? LayoutDashboard) : LayoutDashboard;

  const search = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/students?q=${encodeURIComponent(q)}` : "/students");
  };

  return (
    <div className="min-h-dvh p-2 pb-24 sm:p-3 lg:p-5 lg:pb-5 print:p-0">
      <div className="shell-card mx-auto flex min-h-[calc(100dvh-1rem)] max-w-[110rem] lg:min-h-[calc(100dvh-2.5rem)]">
        {/* Icon rail: a blob attached to the card's left edge */}
        <aside className="hidden w-[7.5rem] shrink-0 lg:block print:hidden">
          <div className="sticky top-5 flex h-[calc(100dvh-2.5rem-2px)] items-center">
            <nav aria-label="Main" className="relative h-[min(100%,54rem)] w-[7rem]">
              <RailShape />
              <ul className="absolute inset-x-0 bottom-[22%] top-[13%] flex flex-col items-center justify-center gap-1.5">
                {items.map((item) => (
                  <li key={item.id}>
                    <RailLink to={item.path} end={item.path === "/"} label={item.label} Icon={ICONS[item.id] ?? LayoutDashboard} />
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2 pt-4 lg:px-6 lg:pt-5 print:hidden">
            <div className="min-w-0 flex-1">
              <div className="break-words text-xs text-muted-foreground">{profile?.schoolName}</div>
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

            <div className="flex flex-wrap items-center gap-2">
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
              <button
                type="button"
                onClick={() => setCustomizerOpen(true)}
                aria-label="Customize theme & background"
                title="Customize theme, colors & background"
                className="grid size-9 place-items-center rounded-full border border-border bg-foreground/5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
              >
                <Palette className="size-4" aria-hidden />
              </button>
              {action ? (
                <Button asChild className="hidden rounded-full sm:inline-flex">
                  <Link to={action.to}><Plus className="size-4" aria-hidden /> {action.label}</Link>
                </Button>
              ) : null}
              <UserMenu onOpenCustomizer={() => setCustomizerOpen(true)} />
            </div>
          </header>

          <main className="flex-1 px-4 pb-6 pt-3 lg:px-6">
            <Outlet />
          </main>
        </div>
      </div>

      <BottomNav items={items} />
      <ThemeCustomizerModal open={customizerOpen} onClose={() => setCustomizerOpen(false)} />
    </div>
  );
}
