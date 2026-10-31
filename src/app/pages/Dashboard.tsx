import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, GraduationCap, UserCog, Users } from "lucide-react";
import { useAuth } from "../../lib/auth/AuthProvider";
import { getDashboardStats } from "../../lib/data/dashboard";
import { Skeleton } from "../components/ui/skeleton";

function Stat({
  icon: Icon, label, value, hint,
}: { icon: typeof Users; label: string; value: string | number | null; hint?: string }) {
  return (
    <section className="surface p-4">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">
        {value === null ? <Skeleton className="h-9 w-20" /> : value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </section>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { data, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboardStats,
    staleTime: 60_000,
  });

  const firstName = profile?.fullName.split(" ")[0];
  const marked = data?.attendanceToday.marked ?? 0;
  const present = data?.attendanceToday.present ?? 0;

  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="text-3xl font-semibold leading-tight">Hi, {firstName}!<br className="sm:hidden" /> <span className="text-muted-foreground">Here is today at {profile?.schoolName}.</span></h1>
      </div>

      {isError ? (
        <div className="surface flex items-center justify-between gap-3 p-4 text-sm" role="alert">
          <span>The overview could not be loaded.</span>
          <button type="button" onClick={() => void refetch()} className="font-medium underline underline-offset-4">
            Try again
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Users} label="Active students" value={data ? data.activeStudents : null} />
        <Stat icon={UserCog} label="Staff" value={data ? data.staff : null} />
        <Stat icon={GraduationCap} label="Classes" value={data ? data.classes : null} />
        <Stat
          icon={CalendarCheck}
          label="Present today"
          value={data ? (marked === 0 ? "No register" : `${present}/${marked}`) : null}
          hint={data && marked === 0 ? "Attendance not yet marked" : undefined}
        />
      </div>

      {data && data.activeStudents === 0 ? (
        <section className="surface p-6">
          <h2 className="text-base font-medium">Nothing here yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the academic year, classes and students first. Numbers on this screen fill in as records are added.
          </p>
        </section>
      ) : null}
    </div>
  );
}
