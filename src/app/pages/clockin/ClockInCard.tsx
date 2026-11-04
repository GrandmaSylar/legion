import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { getClockConfig, listMyEntries } from "../../../lib/data/clockin";
import { timeText } from "../../../lib/clockin";

/** A line on a member of staff's Overview: where they stand today, and a way in. Says nothing when staff are marked by hand only. */
export function ClockInCard() {
  const config = useQuery({ queryKey: ["clockin-config"], queryFn: getClockConfig, staleTime: 60_000, retry: false });
  const entries = useQuery({ queryKey: ["clockin-mine"], queryFn: () => listMyEntries(14), staleTime: 10_000, retry: false });
  if (!config.data || config.data.mode === "taker" || !entries.data) return null;
  const last = entries.data.find((e) => e.day === config.data!.today);
  const text = !last ? "You have not clocked in today." : last.kind === "in" ? `You clocked in at ${timeText(last.capturedAt)}.` : `You clocked out at ${timeText(last.capturedAt)}.`;
  return (
    <section className="surface lift flex items-start gap-3 p-4 text-sm" aria-label="Clock-in">
      <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1">{text} <Link to="/clockin" className="font-medium text-primary underline-offset-4 hover:underline">{last?.kind === "in" ? "Clock out" : "Clock in"}</Link></p>
    </section>
  );
}
