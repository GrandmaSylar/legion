import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Check,
  GraduationCap,
  Hash,
  Search,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  bulkAssignBeceIndexNumbers,
  getClassBroadsheet,
  isCoreBeceSubject,
  listBeceRegistrations,
  scoreToBeceStanine,
  upsertBeceRegistration,
  type BeceRegistrationRow,
  type BeceRegistrationStatus,
  type BroadsheetStudent,
} from "../../../lib/data/grades";
import { friendlyError } from "../../../lib/data/errors";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { StudentAvatar, usePhotoUrls } from "../../components/StudentAvatar";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";

type ReadinessTier = "distinction" | "strong" | "credit" | "at_risk" | "ungraded";

function getReadinessTier(agg: number | null): {
  tier: ReadinessTier;
  label: string;
  badgeClass: string;
} {
  if (agg === null) {
    return {
      tier: "ungraded",
      label: "Awaiting Scores",
      badgeClass: "bg-foreground/10 text-muted-foreground",
    };
  }
  if (agg <= 10) {
    return {
      tier: "distinction",
      label: "Distinction (Cat. A Track)",
      badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    };
  }
  if (agg <= 18) {
    return {
      tier: "strong",
      label: "Strong Pass (Cat. A/B)",
      badgeClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    };
  }
  if (agg <= 24) {
    return {
      tier: "credit",
      label: "Credit Pass",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    };
  }
  return {
    tier: "at_risk",
    label: "Intervention Needed",
    badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  };
}

function StaninePill({ grade, raw }: { grade: number | null; raw: number | null }) {
  if (grade === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const color =
    grade <= 3
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : grade <= 6
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-rose-500/15 text-rose-700 dark:text-rose-400";
  return (
    <span
      title={raw !== null ? `${raw.toFixed(1)}% (Stanine ${grade})` : `Stanine ${grade}`}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${color}`}
    >
      {grade}
      {raw !== null ? (
        <span className="text-[10px] font-normal opacity-75">
          ({Math.round(raw)}%)
        </span>
      ) : null}
    </span>
  );
}

interface CandidateDraft {
  indexNumber: string;
  centreNumber: string;
  registrationStatus: BeceRegistrationStatus;
  officialAggregate: string;
}

export function BeceCandidatesSection({
  classId,
  termId,
  defaultExamYear,
  canEditRegistration,
}: {
  classId: string;
  termId: string;
  defaultExamYear: number;
  canEditRegistration: boolean;
}) {
  const qc = useQueryClient();
  const [examYear, setExamYear] = useState<number>(defaultExamYear);
  const [centreCode, setCentreCode] = useState<string>("0102405");
  const [startingSerial, setStartingSerial] = useState<string>("1");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [tierFilter, setTierFilter] = useState<"all" | ReadinessTier>("all");
  const [savedStudentId, setSavedStudentId] = useState<string | null>(null);

  const broadsheetQ = useQuery({
    queryKey: ["broadsheet", classId, termId],
    queryFn: () => getClassBroadsheet(classId, termId),
  });

  const regsQ = useQuery({
    queryKey: ["bece-registrations", examYear],
    queryFn: () => listBeceRegistrations(examYear),
  });

  const regByStudent = useMemo(() => {
    const map = new Map<string, BeceRegistrationRow>();
    for (const r of regsQ.data ?? []) {
      map.set(r.studentId, r);
    }
    return map;
  }, [regsQ.data]);

  const [drafts, setDrafts] = useState<Record<string, CandidateDraft>>({});

  useEffect(() => {
    const students = broadsheetQ.data?.students ?? [];
    const next: Record<string, CandidateDraft> = {};
    for (const s of students) {
      const reg = regByStudent.get(s.studentId);
      next[s.studentId] = {
        indexNumber: reg?.indexNumber ?? "",
        centreNumber: reg?.centreNumber ?? "",
        registrationStatus: reg?.registrationStatus ?? "registered",
        officialAggregate:
          reg?.officialAggregate !== null && reg?.officialAggregate !== undefined
            ? String(reg.officialAggregate)
            : "",
      };
    }
    setDrafts(next);
  }, [broadsheetQ.data?.students, regByStudent]);

  const students = broadsheetQ.data?.students ?? [];
  const photoIds = useMemo(
    () => students.map((s) => (s.photoPath ? s.studentId : null)),
    [students],
  );
  const photoUrls = usePhotoUrls(photoIds);

  // Enrich each candidate with WAEC Stanine grades per subject, Core breakdown, Best-2 Electives, and Best-6 Aggregate
  const enrichedCandidates = useMemo(() => {
    return students.map((s: BroadsheetStudent) => {
      const subjectStanines = s.subjects.map((sub) => {
        const parsed = sub.grade ? Number.parseInt(sub.grade, 10) : Number.NaN;
        const stanine =
          sub.total !== null
            ? scoreToBeceStanine(sub.total).grade
            : Number.isFinite(parsed) && parsed >= 1 && parsed <= 9
              ? parsed
              : null;
        return {
          ...sub,
          stanine,
          isCore: isCoreBeceSubject(sub.subjectName),
        };
      });

      const findCore = (kw: string) =>
        subjectStanines.find((sub) =>
          sub.subjectName.toLowerCase().includes(kw),
        ) ?? null;

      const english = findCore("english");
      const maths =
        findCore("math") ??
        subjectStanines.find((sub) => sub.subjectName.toLowerCase() === "maths") ??
        null;
      const science = findCore("science");
      const social = findCore("social");

      const bestElectives = subjectStanines
        .filter((sub) => !sub.isCore && sub.stanine !== null)
        .sort((a, b) => (a.stanine ?? 99) - (b.stanine ?? 99))
        .slice(0, 2);

      const coreGrades = [english, maths, science, social]
        .map((c) => c?.stanine ?? null)
        .filter((g): g is number => g !== null);

      const allCorePassedCredit =
        coreGrades.length === 4 && coreGrades.every((g) => g <= 6);

      const readiness = getReadinessTier(s.bestSixAggregate);
      const reg = regByStudent.get(s.studentId) ?? null;

      return {
        student: s,
        reg,
        english,
        maths,
        science,
        social,
        bestElectives,
        allCorePassedCredit,
        readiness,
      };
    });
  }, [students, regByStudent]);

  const kpis = useMemo(() => {
    const total = enrichedCandidates.length;
    const registeredWithIndex = enrichedCandidates.filter((c) =>
      Boolean(c.reg?.indexNumber?.trim()),
    ).length;

    const withAgg = enrichedCandidates.filter(
      (c) => c.student.bestSixAggregate !== null,
    );
    const meanAggregate =
      withAgg.length > 0
        ? Math.round(
            (withAgg.reduce(
              (sum, c) => sum + (c.student.bestSixAggregate ?? 0),
              0,
            ) /
              withAgg.length) *
              10,
          ) / 10
        : null;

    const strongOrDistinction = withAgg.filter(
      (c) => (c.student.bestSixAggregate ?? 99) <= 18,
    ).length;

    const coreCreditCount = enrichedCandidates.filter(
      (c) => c.allCorePassedCredit,
    ).length;

    return {
      total,
      registeredWithIndex,
      meanAggregate,
      strongOrDistinction,
      gradedCount: withAgg.length,
      coreCreditCount,
    };
  }, [enrichedCandidates]);

  // Core subject distribution summary
  const coreSubjectStats = useMemo(() => {
    const defs = [
      { key: "english", label: "English Language" },
      { key: "maths", label: "Mathematics" },
      { key: "science", label: "Integrated Science" },
      { key: "social", label: "Social Studies" },
    ] as const;

    return defs.map((d) => {
      let sumScore = 0;
      let countScore = 0;
      let g1to3 = 0;
      let g4to6 = 0;
      let g7to9 = 0;

      for (const c of enrichedCandidates) {
        const sub = c[d.key];
        if (!sub || sub.stanine === null) continue;
        if (sub.total !== null) {
          sumScore += sub.total;
          countScore += 1;
        }
        if (sub.stanine <= 3) g1to3 += 1;
        else if (sub.stanine <= 6) g4to6 += 1;
        else g7to9 += 1;
      }

      return {
        label: d.label,
        avgScore: countScore > 0 ? Math.round((sumScore / countScore) * 10) / 10 : null,
        g1to3,
        g4to6,
        g7to9,
        totalGraded: g1to3 + g4to6 + g7to9,
      };
    });
  }, [enrichedCandidates]);

  const filteredCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedCandidates.filter((c) => {
      if (tierFilter !== "all" && c.readiness.tier !== tierFilter) return false;
      if (q) {
        const hay = [
          c.student.fullName,
          c.student.admissionNo,
          c.reg?.indexNumber ?? "",
          c.reg?.centreNumber ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enrichedCandidates, tierFilter, searchQuery]);

  const bulkAssignMut = useMutation({
    mutationFn: () =>
      bulkAssignBeceIndexNumbers({
        examYear,
        centreNumber: centreCode,
        studentIdsInOrder: students.map((s) => s.studentId),
        startingSerial: Number(startingSerial) || 1,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bece-registrations", examYear] });
      void qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  const saveSingleMut = useMutation({
    mutationFn: async (studentId: string) => {
      const draft = drafts[studentId];
      if (!draft) return;
      const offAgg = draft.officialAggregate.trim()
        ? Number.parseInt(draft.officialAggregate, 10)
        : null;
      if (
        offAgg !== null &&
        (Number.isNaN(offAgg) || offAgg < 6 || offAgg > 54)
      ) {
        throw new Error("Official BECE aggregate must be between 6 and 54.");
      }
      await upsertBeceRegistration({
        studentId,
        examYear,
        indexNumber: draft.indexNumber,
        centreNumber: draft.centreNumber || centreCode,
        registrationStatus: draft.registrationStatus,
        officialAggregate: offAgg,
      });
      return studentId;
    },
    onSuccess: (studentId) => {
      if (studentId) setSavedStudentId(studentId);
      void qc.invalidateQueries({ queryKey: ["bece-registrations", examYear] });
      void qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  if (broadsheetQ.isLoading || regsQ.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Indexed Candidates ({examYear})</span>
            <Hash className="size-4 text-primary" aria-hidden />
          </div>
          <div className="mt-2 text-2xl font-extrabold tabular-nums">
            {kpis.registeredWithIndex} / {kpis.total}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {kpis.total > 0
              ? `${Math.round((kpis.registeredWithIndex / kpis.total) * 100)}% assigned WAEC index numbers`
              : "No candidates enrolled"}
          </p>
        </div>

        <div className="surface p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Mean Mock Best-6 Aggregate</span>
            <Award className="size-4 text-sky-500" aria-hidden />
          </div>
          <div className="mt-2 text-2xl font-extrabold tabular-nums text-sky-600 dark:text-sky-400">
            {kpis.meanAggregate !== null ? `Agg. ${kpis.meanAggregate}` : "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            4 compulsory cores + best 2 electives (6 best – 54 lowest)
          </p>
        </div>

        <div className="surface p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Distinction &amp; Strong Pass (6–18)</span>
            <TrendingUp className="size-4 text-emerald-500" aria-hidden />
          </div>
          <div className="mt-2 text-2xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
            {kpis.strongOrDistinction} / {kpis.gradedCount || kpis.total}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Candidates on track for Category A/B SHS placement
          </p>
        </div>

        <div className="surface p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>4-Core Credit Pass (Grades 1–6)</span>
            <GraduationCap className="size-4 text-amber-500" aria-hidden />
          </div>
          <div className="mt-2 text-2xl font-extrabold tabular-nums">
            {kpis.coreCreditCount} / {kpis.total}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Passing English, Maths, Science &amp; Social Studies (≤ 6)
          </p>
        </div>
      </div>

      {/* Bulk Sequential WAEC Index Number Generator */}
      {canEditRegistration ? (
        <section className="surface space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Sparkles className="size-4 text-primary" aria-hidden />{" "}
                WAEC BECE Sequential Index Number Generator
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Automatically generate 10-digit WAEC BECE index numbers (
                <code className="rounded bg-foreground/5 px-1">
                  &lt;CentreCode&gt;&lt;001..NNN&gt;
                </code>
                ) for all {students.length} candidates in alphabetical surname
                order.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field label="BECE Exam Year" htmlFor="bece-exam-year">
              <Input
                id="bece-exam-year"
                type="number"
                min="2020"
                max="2040"
                value={examYear}
                onChange={(e) =>
                  setExamYear(Number(e.target.value) || defaultExamYear)
                }
              />
            </Field>
            <Field
              label="WAEC Centre / School Code"
              htmlFor="bece-centre-code"
            >
              <Input
                id="bece-centre-code"
                placeholder="e.g. 0102405"
                value={centreCode}
                onChange={(e) => setCentreCode(e.target.value)}
              />
            </Field>
            <Field label="Starting Serial #" htmlFor="bece-start-serial">
              <Input
                id="bece-start-serial"
                type="number"
                min="1"
                max="999"
                value={startingSerial}
                onChange={(e) => setStartingSerial(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              disabled={bulkAssignMut.isPending || students.length === 0}
              onClick={() => bulkAssignMut.mutate()}
            >
              <Sparkles className="size-4" aria-hidden />{" "}
              {bulkAssignMut.isPending
                ? "Assigning index numbers…"
                : `Auto-Assign (${students.length})`}
            </Button>
          </div>

          {bulkAssignMut.isError ? (
            <FormMessage error={friendlyError(bulkAssignMut.error)} />
          ) : bulkAssignMut.isSuccess ? (
            <FormMessage
              ok={`Assigned sequential WAEC index numbers (${centreCode.trim()}001…) to ${bulkAssignMut.data} candidates.`}
            />
          ) : null}
        </section>
      ) : null}

      {/* Core Subject Stanine Distribution */}
      <section className="surface space-y-3 p-5">
        <div>
          <h2 className="text-base font-semibold">
            Compulsory Core Subjects — Mock Stanine Distribution (Grades 1–9)
          </h2>
          <p className="text-xs text-muted-foreground">
            WAEC BECE Stanine scale: Grades 1–3 (Distinction / High), Grades 4–6
            (Credit / Average), Grades 7–9 (Pass / Weak).
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {coreSubjectStats.map((st) => (
            <div
              key={st.label}
              className="rounded-2xl border border-border p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{st.label}</span>
                <span className="text-xs font-medium text-muted-foreground">
                  {st.avgScore !== null ? `Mean: ${st.avgScore}%` : "No marks"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                <div className="rounded-xl bg-emerald-500/10 py-1.5 text-emerald-700 dark:text-emerald-300">
                  <div className="font-bold tabular-nums">{st.g1to3}</div>
                  <div className="text-[10px]">Grades 1–3</div>
                </div>
                <div className="rounded-xl bg-amber-500/10 py-1.5 text-amber-700 dark:text-amber-300">
                  <div className="font-bold tabular-nums">{st.g4to6}</div>
                  <div className="text-[10px]">Grades 4–6</div>
                </div>
                <div className="rounded-xl bg-rose-500/10 py-1.5 text-rose-700 dark:text-rose-400">
                  <div className="font-bold tabular-nums">{st.g7to9}</div>
                  <div className="text-[10px]">Grades 7–9</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Candidate Register & Mock Aggregate Table */}
      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              BECE Candidate Register &amp; Best-6 Aggregate Tracker
            </h2>
            <p className="text-xs text-muted-foreground">
              {broadsheetQ.data?.className} · {broadsheetQ.data?.termName} (
              {broadsheetQ.data?.academicYearName})
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_15rem]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Search candidate name, admission #, or BECE index #…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <NativeSelect
            aria-label="Filter by readiness tier"
            value={tierFilter}
            onChange={(e) =>
              setTierFilter(e.target.value as "all" | ReadinessTier)
            }
          >
            <option value="all">All readiness tiers</option>
            <option value="distinction">Distinction (Agg. 6–10)</option>
            <option value="strong">Strong Pass (Agg. 11–18)</option>
            <option value="credit">Credit Pass (Agg. 19–24)</option>
            <option value="at_risk">Intervention Needed (Agg. 25+)</option>
            <option value="ungraded">Awaiting Scores</option>
          </NativeSelect>
        </div>

        { saveSingleMut.isError ? (
          <FormMessage error={friendlyError(saveSingleMut.error)} />
        ) : null }

        {filteredCandidates.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 size-7 opacity-50" aria-hidden />
            No BECE candidates match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2.5 pr-3">Candidate</th>
                  <th className="py-2.5 pr-3">WAEC Index No.</th>
                  <th className="py-2.5 pr-2 text-center">Eng</th>
                  <th className="py-2.5 pr-2 text-center">Maths</th>
                  <th className="py-2.5 pr-2 text-center">Sci</th>
                  <th className="py-2.5 pr-2 text-center">Social</th>
                  <th className="py-2.5 pr-3">Best 2 Electives</th>
                  <th className="py-2.5 pr-3">Mock Best-6</th>
                  <th className="py-2.5 pr-3">Official Agg.</th>
                  {canEditRegistration ? (
                    <th className="py-2.5 text-right">Save</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCandidates.map((c) => {
                  const s = c.student;
                  const draft = drafts[s.studentId] ?? {
                    indexNumber: c.reg?.indexNumber ?? "",
                    centreNumber: c.reg?.centreNumber ?? "",
                    registrationStatus:
                      c.reg?.registrationStatus ?? "registered",
                    officialAggregate:
                      c.reg?.officialAggregate !== null &&
                      c.reg?.officialAggregate !== undefined
                        ? String(c.reg.officialAggregate)
                        : "",
                  };

                  return (
                    <tr key={s.studentId} className="align-middle">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <StudentAvatar
                            name={s.fullName}
                            url={photoUrls[s.studentId] ?? null}
                            className="size-8 text-xs"
                          />
                          <div>
                            <div className="font-medium">{s.fullName}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {s.admissionNo}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pr-3">
                        {canEditRegistration ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              aria-label={`BECE index number for ${s.fullName}`}
                              placeholder="e.g. 0102405001"
                              value={draft.indexNumber}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [s.studentId]: {
                                    ...draft,
                                    indexNumber: e.target.value,
                                  },
                                }))
                              }
                              className="h-8 w-36 font-mono text-xs"
                            />
                            <NativeSelect
                              aria-label={`Registration status for ${s.fullName}`}
                              value={draft.registrationStatus}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [s.studentId]: {
                                    ...draft,
                                    registrationStatus: e.target
                                      .value as BeceRegistrationStatus,
                                  },
                                }))
                              }
                              className="h-8 w-28 text-xs"
                            >
                              <option value="registered">Registered</option>
                              <option value="pending">Pending</option>
                              <option value="withdrawn">Withdrawn</option>
                            </NativeSelect>
                          </div>
                        ) : (
                          <div>
                            <span className="font-mono text-xs font-semibold">
                              {c.reg?.indexNumber || "Not assigned"}
                            </span>
                            <div className="text-[10px] uppercase text-muted-foreground">
                              {c.reg?.registrationStatus ?? "pending"}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 pr-2 text-center">
                        <StaninePill
                          grade={c.english?.stanine ?? null}
                          raw={c.english?.total ?? null}
                        />
                      </td>
                      <td className="py-3 pr-2 text-center">
                        <StaninePill
                          grade={c.maths?.stanine ?? null}
                          raw={c.maths?.total ?? null}
                        />
                      </td>
                      <td className="py-3 pr-2 text-center">
                        <StaninePill
                          grade={c.science?.stanine ?? null}
                          raw={c.science?.total ?? null}
                        />
                      </td>
                      <td className="py-3 pr-2 text-center">
                        <StaninePill
                          grade={c.social?.stanine ?? null}
                          raw={c.social?.total ?? null}
                        />
                      </td>

                      <td className="py-3 pr-3">
                        {c.bestElectives.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.bestElectives.map((el) => (
                              <span
                                key={el.subjectId}
                                className="inline-flex items-center gap-1 rounded-lg bg-foreground/[0.05] px-2 py-0.5 text-[11px]"
                              >
                                <span className="truncate max-w-24">
                                  {el.subjectName}
                                </span>
                                <strong className="font-bold">
                                  {el.stanine}
                                </strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="py-3 pr-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-extrabold tabular-nums">
                            {s.bestSixAggregate !== null
                              ? s.bestSixAggregate
                              : "—"}
                          </span>
                          <span
                            className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-semibold ${c.readiness.badgeClass}`}
                          >
                            {c.readiness.label}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 pr-3">
                        {canEditRegistration ? (
                          <Input
                            aria-label={`Official WAEC aggregate for ${s.fullName}`}
                            type="number"
                            min="6"
                            max="54"
                            placeholder="6–54"
                            value={draft.officialAggregate}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [s.studentId]: {
                                  ...draft,
                                  officialAggregate: e.target.value,
                                },
                              }))
                            }
                            className="h-8 w-20 text-xs tabular-nums"
                          />
                        ) : (
                          <span className="font-semibold tabular-nums">
                            {c.reg?.officialAggregate ?? "—"}
                          </span>
                        )}
                      </td>

                      {canEditRegistration ? (
                        <td className="py-3 text-right whitespace-nowrap">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 text-xs"
                            disabled={saveSingleMut.isPending}
                            onClick={() => saveSingleMut.mutate(s.studentId)}
                          >
                            {savedStudentId === s.studentId ? (
                              <>
                                <Check className="size-3.5 text-emerald-600" />{" "}
                                Saved
                              </>
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
