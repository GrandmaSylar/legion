import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, Plus, Sparkles, Trash2 } from "lucide-react";
import { listAcademicYears, listClasses } from "../../../lib/data/setup";
import { listClassSubjectsWithDetails } from "../../../lib/data/grades";
import {
  WEEKDAYS,
  deleteTimetableSlot,
  generateDefaultClassTimetable,
  listClassTimetable,
  saveTimetableSlot,
} from "../../../lib/data/timetable";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

export default function TimetableTab() {
  const qc = useQueryClient();
  const yearsQuery = useQuery({
    queryKey: ["academic-years"],
    queryFn: listAcademicYears,
  });
  const currentYear = useMemo(
    () =>
      yearsQuery.data?.find((y) => y.isCurrent) ?? yearsQuery.data?.[0] ?? null,
    [yearsQuery.data],
  );

  const classesQuery = useQuery({
    queryKey: ["classes", currentYear?.id],
    queryFn: () => listClasses(currentYear!.id),
    enabled: !!currentYear?.id,
  });

  const classes = classesQuery.data ?? [];
  const [selectedClassId, setSelectedClassId] = useState("");
  const activeClass =
    classes.find((c) => c.id === selectedClassId) ?? classes[0] ?? null;

  const subjectsQuery = useQuery({
    queryKey: ["class-subjects-details", activeClass?.id],
    queryFn: () => listClassSubjectsWithDetails(activeClass!.id),
    enabled: !!activeClass?.id,
  });

  const slotsQuery = useQuery({
    queryKey: ["timetable", activeClass?.id],
    queryFn: () => listClassTimetable(activeClass!.id),
    enabled: !!activeClass?.id,
  });

  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("08:30");
  const [endTime, setEndTime] = useState("09:30");
  const [classSubjectId, setClassSubjectId] = useState("");
  const [label, setLabel] = useState("");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["timetable", activeClass?.id] });
    void qc.invalidateQueries({ queryKey: ["timetable-today"] });
  };

  const addSlotMutation = useMutation({
    mutationFn: () =>
      saveTimetableSlot({
        classId: activeClass!.id,
        dayOfWeek: Number(dayOfWeek),
        startTime,
        endTime,
        classSubjectId: classSubjectId || null,
        label,
      }),
    onSuccess: () => {
      setLabel("");
      invalidate();
    },
  });

  const autoFillMutation = useMutation({
    mutationFn: () => generateDefaultClassTimetable(activeClass!.id),
    onSuccess: invalidate,
  });

  const removeSlotMutation = useMutation({
    mutationFn: (id: string) => deleteTimetableSlot(id),
    onSuccess: invalidate,
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!activeClass) return;
    addSlotMutation.mutate();
  };

  if (yearsQuery.isLoading || classesQuery.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!currentYear || classes.length === 0) {
    return (
      <section className="surface p-6 text-sm text-muted-foreground">
        Create an academic year and at least one class before setting up a
        timetable.
      </section>
    );
  }

  const slots = slotsQuery.data ?? [];
  const subjects = subjectsQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* Class selector & auto-fill action */}
      <section className="surface flex flex-wrap items-end justify-between gap-3 p-4">
        <div className="w-full sm:w-72">
          <Field label="Class timetable" htmlFor="tt-class">
            <NativeSelect
              id="tt-class"
              value={activeClass?.id ?? ""}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.levelName} {c.section}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={autoFillMutation.isPending || subjects.length === 0}
          onClick={() => autoFillMutation.mutate()}
        >
          <Sparkles className="size-4" aria-hidden />
          {autoFillMutation.isPending
            ? "Generating..."
            : "Auto-fill Mon–Fri schedule from class subjects"}
        </Button>
      </section>

      {/* Add slot form */}
      <form
        onSubmit={onSubmit}
        className="surface grid gap-3 p-4 sm:grid-cols-6 sm:items-end"
      >
        <Field label="Day" htmlFor="tt-day">
          <NativeSelect
            id="tt-day"
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
          >
            {WEEKDAYS.map((d) => (
              <option key={d.day} value={d.day}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Start" htmlFor="tt-start">
          <Input
            id="tt-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </Field>

        <Field label="End" htmlFor="tt-end">
          <Input
            id="tt-end"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </Field>

        <Field label="Subject (or break)" htmlFor="tt-subject">
          <NativeSelect
            id="tt-subject"
            value={classSubjectId}
            onChange={(e) => setClassSubjectId(e.target.value)}
          >
            <option value="">Break / Assembly / Custom</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subjectName}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Note / Label" htmlFor="tt-label">
          <Input
            id="tt-label"
            placeholder={classSubjectId ? "Optional note" : "e.g. Lunch Break"}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>

        <Button
          type="submit"
          size="sm"
          disabled={
            addSlotMutation.isPending ||
            !startTime ||
            !endTime ||
            startTime >= endTime ||
            (!classSubjectId && !label.trim())
          }
        >
          <Plus className="size-4" aria-hidden />
          Save slot
        </Button>
      </form>

      <FormMessage
        error={
          addSlotMutation.isError ||
          autoFillMutation.isError ||
          removeSlotMutation.isError
            ? friendlyError(
                addSlotMutation.error ??
                  autoFillMutation.error ??
                  removeSlotMutation.error,
              )
            : null
        }
      />

      {/* Weekly Timetable Grid (Monday - Friday) */}
      {slotsQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-3 md:grid-cols-5">
          {WEEKDAYS.map((day) => {
            const daySlots = slots.filter((s) => s.dayOfWeek === day.day);
            return (
              <section key={day.day} className="surface space-y-2.5 p-3.5">
                <h3 className="flex items-center justify-between border-b border-border pb-2 text-sm font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-primary" aria-hidden />
                    {day.name}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {daySlots.length}
                  </span>
                </h3>

                {daySlots.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No periods scheduled
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {daySlots.map((slot) => {
                      const isBreak = !slot.classSubjectId;
                      return (
                        <li
                          key={slot.id}
                          className={`group relative rounded-xl border p-2.5 text-xs ${
                            isBreak
                              ? "border-dashed border-border bg-foreground/[0.02] text-muted-foreground"
                              : "border-border bg-background/60"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 text-[11px] tabular-nums text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="size-3" aria-hidden />
                              {slot.startTime}–{slot.endTime}
                            </span>
                            <button
                              type="button"
                              aria-label="Remove slot"
                              onClick={() => removeSlotMutation.mutate(slot.id)}
                              className="opacity-70 hover:text-destructive group-hover:opacity-100"
                            >
                              <Trash2 className="size-3" aria-hidden />
                            </button>
                          </div>
                          <div className="mt-1 font-semibold text-foreground">
                            {slot.subjectName ?? slot.label ?? "Period"}
                          </div>
                          {slot.teacherName ? (
                            <div className="text-[11px] text-muted-foreground">
                              {slot.teacherName}
                            </div>
                          ) : null}
                          {slot.subjectName && slot.label ? (
                            <div className="text-[11px] italic text-muted-foreground">
                              {slot.label}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
