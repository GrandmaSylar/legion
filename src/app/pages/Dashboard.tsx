import type { ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, ArrowUpRight, CalendarCheck, ChevronRight, ClipboardCheck, GraduationCap, Settings, UserCog,
  UserPlus, UserRoundCog, Users, type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../lib/auth/AuthProvider";
import { NAV, canSee, hasAnyRole, type AppRole } from "../../lib/permissions";
import { getDashboardStats, getRecentActivity } from "../../lib/data/dashboard";
import { listAcademicYears, listClasses } from "../../lib/data/setup";
import { Skeleton } from "../components/ui/skeleton";
import { cn } from "../components/ui/utils";

// ─── Stat cards ──────────────────────────────────────────────────────────────

function Stat({
  icon: Icon, label, value, hint, hintTone = "muted", accent, hero = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number | null;
  hint?: string;
  hintTone?: "up" | "muted";
  accent: string;
  /** One solid brand-coloured card leads the row. */
  hero?: boolean;
}) {
  const pill = hero
    ? "bg-white/20 text-white"
    : hintTone === "up"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : "bg-foreground/5 text-muted-foreground";
  return (
    <section
      className={cn(
        "lift relative isolate flex flex-col overflow-hidden rounded-3xl p-4 sm:min-h-44 sm:rounded-[1.75rem] sm:p-6",
        hero ? "text-white shadow-lg shadow-primary/30" : "surface",
      )}
      style={{
        backgroundImage: hero
          ? "linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 68%, #6b1a00))"
          : `linear-gradient(135deg, color-mix(in srgb, ${accent} 18%, transparent), transparent 72%)`,
      }}
    >
      {/* Oversized, faded icon: decoration, tucked into the corner */}
      <Icon
        aria-hidden
        strokeWidth={1.4}
        className="pointer-events-none absolute -bottom-3 -right-3 -z-10 size-20 -rotate-12 opacity-[0.16] sm:-bottom-6 sm:-right-5 sm:size-36"
        style={{ color: hero ? "#fff" : accent }}
      />
      <div className={cn("text-xs font-medium sm:text-sm", hero ? "text-white/85" : "text-muted-foreground")}>{label}</div>
      <div className="mt-auto pt-2 text-3xl font-extrabold leading-none tracking-tight tabular-nums sm:pt-6 sm:text-5xl">
        {value === null ? <Skeleton className="h-8 w-16 sm:h-11 sm:w-24" /> : value}
      </div>
      <div className="mt-2 sm:mt-4 sm:min-h-6">
        {value === null ? (
          <Skeleton className="h-4 w-20 sm:h-5 sm:w-32" />
        ) : hint ? (
          <span className={cn("inline-flex max-w-full items-center gap-1 rounded-xl px-2 py-0.5 text-[11px] font-medium leading-tight sm:rounded-full sm:px-2.5 sm:py-1 sm:text-xs", pill)}>
            {hintTone === "up" ? <ArrowUpRight className="size-3" aria-hidden /> : null}
            {hint}
          </span>
        ) : null}
      </div>
    </section>
  );
}

// ─── Panels ──────────────────────────────────────────────────────────────────

function Panel({
  title, icon: Icon, action, className = "", children,
}: { title: string; icon: LucideIcon; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`surface lift p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon className="size-4 text-primary" aria-hidden /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function timeAgo(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

function ActivityPanel({ isAdmin }: { isAdmin: boolean }) {
  const q = useQuery({ queryKey: ["activity"], queryFn: () => getRecentActivity(8), staleTime: 30_000, retry: false });
  return (
    <Panel title="Recent activity" icon={Activity} className="lg:col-span-2">
      {q.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : q.isError ? (
        <p role="alert" className="text-sm text-muted-foreground">Recent activity could not be loaded.</p>
      ) : q.data && q.data.length > 0 ? (
        <ul className="divide-y divide-border">
          {q.data.map((a) => (
            <li key={a.id} className="flex items-start gap-3 py-2.5">
              <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{a.text}</p>
                <p className="text-xs text-muted-foreground">{a.actor ? `${a.actor} · ` : ""}{timeAgo(a.at)}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-sm text-muted-foreground">
          {isAdmin
            ? "Nothing has happened yet. Admissions, new users and payments will appear here."
            : "Recent activity is shown to administrators."}
        </p>
      )}
    </Panel>
  );
}

interface QuickAction { label: string; hint: string; to: string; icon: LucideIcon; roles: AppRole[]; module: string; soon?: boolean }

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Mark attendance", hint: "Take today's register", to: "/attendance", icon: ClipboardCheck, roles: ["school_admin", "principal", "teacher"], module: "attendance" },
  { label: "Gradebook & reports", hint: "Enter marks and print report cards", to: "/grades", icon: GraduationCap, roles: ["school_admin", "principal", "teacher", "parent", "student"], module: "grades" },
  { label: "Add student", hint: "Admit a new pupil", to: "/students/new", icon: UserPlus, roles: ["school_admin", "receptionist"], module: "students" },
  { label: "View students", hint: "Search the register", to: "/students", icon: Users, roles: ["principal", "teacher", "accountant"], module: "students" },
  { label: "Add user", hint: "Create a staff or parent login", to: "/users/new", icon: UserRoundCog, roles: ["school_admin"], module: "users" },
  { label: "School setup", hint: "Years, classes and subjects", to: "/settings", icon: Settings, roles: ["school_admin"], module: "settings" },
];

function QuickActionsPanel() {
  const { roles, profile } = useAuth();
  const modules = profile?.modules ?? null;
  const actions = QUICK_ACTIONS.filter((a) => {
    const item = NAV.find((n) => n.id === a.module);
    return hasAnyRole(roles, a.roles) && (!item || canSee(item, roles, modules));
  });
  return (
    <Panel title="Quick actions" icon={ClipboardCheck}>
      {actions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to do right now.</p>
      ) : (
        <ul className="space-y-2">
          {actions.map((a) => (
            <li key={a.label}>
              <Link
                to={a.to}
                className="group flex items-center gap-3 rounded-2xl border border-border p-3 transition-all duration-200 hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <a.icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                    {a.label}
                    {a.soon ? <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Soon</span> : null}
                  </span>
                  <span className="block break-words text-xs text-muted-foreground">{a.hint}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TodayPanel({ isAdmin }: { isAdmin: boolean }) {
  const { roles, profile } = useAuth();
  const attendanceItem = NAV.find((n) => n.id === "attendance");
  const canOpenAttendance = Boolean(
    attendanceItem && canSee(attendanceItem, roles, profile?.modules ?? null),
  );
  const years = useQuery({ queryKey: ["academic-years"], queryFn: listAcademicYears });
  const year = years.data?.find((y) => y.isCurrent) ?? null;
  const classes = useQuery({
    queryKey: ["classes", year?.id],
    queryFn: () => listClasses(year!.id),
    enabled: !!year,
  });
  const now = new Date();

  return (
    <Panel title="Today" icon={CalendarCheck} className="lg:col-span-3">
      <div className="grid gap-5 lg:grid-cols-[14rem_1fr]">
        <div className="flex items-center gap-3 rounded-2xl bg-primary/10 p-3 sm:gap-4 sm:p-4 lg:flex-col lg:items-start">
          <div className="text-4xl font-bold leading-none tabular-nums text-primary sm:text-5xl">{now.getDate()}</div>
          <div>
            <div className="text-sm font-semibold">{now.toLocaleDateString(undefined, { weekday: "long" })}</div>
            <div className="text-xs text-muted-foreground">{now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Classes{year ? ` · ${year.name}` : ""}</h3>
            <span className="text-xs text-muted-foreground">
              {canOpenAttendance ? "Select a class to open its attendance register." : "A daily timetable will appear here once scheduling is built."}
            </span>
          </div>
          {classes.isLoading || years.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !year ? (
            <p className="py-4 text-sm text-muted-foreground">
              No current academic year.{" "}
              {isAdmin ? <Link to="/settings" className="font-medium text-primary underline underline-offset-4">Set one up</Link> : null}
            </p>
          ) : classes.data && classes.data.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {classes.data.slice(0, 6).map((c) => {
                const content = (
                  <>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                      <GraduationCap className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-medium">{c.levelName} {c.section}</div>
                      <div className="break-words text-xs text-muted-foreground">
                        {c.studentCount} {c.studentCount === 1 ? "student" : "students"}
                        {c.classTeacherName ? ` · ${c.classTeacherName}` : ""}
                      </div>
                    </div>
                  </>
                );
                return (
                  <li key={c.id}>
                    {canOpenAttendance ? (
                      <Link
                        to={`/attendance?class=${c.id}`}
                        className="flex items-center gap-3 rounded-2xl border border-border p-3 transition-all hover:border-primary/40 hover:bg-primary/5"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No classes have been set up for this year yet.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { profile, roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["school_admin"]);
  const { data, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboardStats,
    staleTime: 60_000,
  });

  const firstName = profile?.fullName.split(" ")[0];
  const marked = data?.attendanceToday.marked ?? 0;
  const present = data?.attendanceToday.present ?? 0;
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{date}</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Hi, {firstName}!</h1>
        <p className="mt-1 text-base text-muted-foreground sm:text-lg">Here is what is happening at {profile?.schoolName}.</p>
      </div>

      {isError ? (
        <div className="surface flex items-center justify-between gap-3 p-4 text-sm" role="alert">
          <span>The overview could not be loaded.</span>
          <button type="button" onClick={() => void refetch()} className="font-medium underline underline-offset-4">
            Try again
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          icon={Users} label="Active students" accent="var(--primary)" hero value={data ? data.activeStudents : null}
          hint={data ? (data.admittedThisMonth > 0 ? `+${data.admittedThisMonth} this month` : "None this month") : undefined}
          hintTone={data && data.admittedThisMonth > 0 ? "up" : "muted"}
        />
        <Stat
          icon={UserCog} label="Staff" accent="var(--chart-4)" value={data ? data.staff : null}
          hint={data ? `${data.teachingStaff} teaching` : undefined}
        />
        <Stat
          icon={GraduationCap} label="Classes" accent="var(--chart-2)" value={data ? data.classes : null}
          hint={data ? (data.yearName ? `Year ${data.yearName}` : "No current year") : undefined}
        />
        <Stat
          icon={CalendarCheck} label="Present today" accent="var(--chart-3)"
          value={data ? (marked === 0 ? "—" : `${present}/${marked}`) : null}
          hint={data ? (marked === 0 ? "Not marked yet" : `${Math.round((present / marked) * 100)}% present`) : undefined}
          hintTone={data && marked > 0 ? "up" : "muted"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ActivityPanel isAdmin={isAdmin} />
        <QuickActionsPanel />
        <TodayPanel isAdmin={isAdmin} />
      </div>
    </div>
  );
}
