import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { getTimetable, listTimetablePeriods } from "../../../lib/data/examTimetable";
import { byDay, dayText, durationText, hm, timeRange } from "../../../lib/examTimetable";
import { Skeleton } from "../../components/ui/skeleton";
import { DownloadMenu } from "../../components/DownloadMenu";
import { NativeSelect } from "../../components/fields";

/**
 * The exam timetables the signed-in person may see: staff see every published one; a pupil, or a parent, sees only the
 * papers for their own class. Says nothing at all when there is nothing to show, so it never leaves an empty box.
 */
export function ExamTimetableCard() {
  const periods = useQuery({ queryKey: ["exam-timetable-periods"], queryFn: listTimetablePeriods, staleTime: 30_000, retry: false });
  const [pick, setPick] = useState("");
  const list = periods.data ?? [];
  const current = list.find((p) => p.periodId === pick) ?? list[0];
  const papers = useQuery({ queryKey: ["exam-timetable", current?.periodId], queryFn: () => getTimetable(current!.periodId), enabled: !!current });
  if (periods.isLoading) return <Skeleton className="h-16 w-full" />;
  if (!current) return null;
  const days = byDay(papers.data ?? []);
  const classes = new Set((papers.data ?? []).map((p) => p.classLabel));

  return (
    <section className="surface space-y-3 p-4" aria-label="Exam timetable">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><CalendarClock className="size-4 text-primary" aria-hidden /> Exam timetable</h2>
        <div className="flex flex-wrap items-center gap-2">
          {list.length > 1 ? <NativeSelect aria-label="Exam period" value={current.periodId} onChange={(e) => setPick(e.target.value)}>{list.map((p) => <option key={p.periodId} value={p.periodId}>{p.name}</option>)}</NativeSelect> : <span className="text-sm text-muted-foreground">{current.name}</span>}
          <DownloadMenu action="calendar.download" label="Download" disabled={!papers.data?.length} getTable={() => ({
            title: `Exam timetable: ${current.name}`, filename: "exam-timetable", columns: ["Day", "Starts", "Ends", "Class", "Subject", "Room"],
            rows: (papers.data ?? []).map((p) => [dayText(p.examDate), hm(p.startsAt), hm(p.endsAt), p.classLabel, p.subjectName, p.room ?? ""]),
          })} />
        </div>
      </div>
      {papers.isLoading ? <Skeleton className="h-12 w-full" /> : null}
      {days.map(([day, items]) => (
        <div key={day} className="space-y-1">
          <h3 className="text-sm font-semibold">{dayText(day)}</h3>
          <ul className="divide-y divide-border">
            {items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-sm">
                <span className="min-w-0 break-words"><strong className="font-medium">{p.subjectName}</strong>{classes.size > 1 ? `, ${p.classLabel}` : ""}{p.notes ? <span className="block text-xs text-muted-foreground">{p.notes}</span> : null}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{timeRange(p)} ({durationText(p)}){p.room ? ` · ${p.room}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
