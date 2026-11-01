import { supabase } from "../supabase";

export interface ClassAnalyticsRow {
  classId: string;
  className: string;
  levelName: string;
  classTeacherName: string | null;
  totalStudents: number;
  maleCount: number;
  femaleCount: number;
  attendanceMarkedDays: number;
  attendanceRate: number | null;
  averageAcademicScore: number | null;
}

export interface SubjectAnalyticsRow {
  subjectId: string;
  subjectName: string;
  code: string | null;
  assessedStudents: number;
  averageScore: number | null;
  passRate: number | null; // >= 50%
  excellenceRate: number | null; // >= 80%
}

export interface MonthlyAdmissionPoint {
  month: string;
  admitted: number;
}

export interface MonthlyCollectionPoint {
  month: string;
  collected: number;
  billed: number;
}

export interface DailyAttendancePoint {
  date: string;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number;
}

export interface PaymentMethodSummary {
  method: string;
  count: number;
  amount: number;
}

export interface AnalyticsSnapshot {
  generatedAt: string;
  academicYearName: string | null;
  termName: string | null;

  // 1. Executive KPIs
  kpis: {
    totalStudents: number;
    activeStudents: number;
    completedStudents: number;
    leftStudents: number;
    maleStudents: number;
    femaleStudents: number;
    totalStaff: number;
    teachingStaff: number;
    nonTeachingStaff: number;
    studentTeacherRatio: number | null;
    overallAttendanceRate: number | null;
    overallAcademicAverage: number | null;
    overallPassRate: number | null;
    totalBilled: number;
    totalCollected: number;
    totalArrears: number;
    collectionRate: number | null;
  };

  // 2. Enrollment & Demographics
  classesSummary: ClassAnalyticsRow[];
  monthlyAdmissions: MonthlyAdmissionPoint[];

  // 3. Attendance Spectrum
  attendanceSummary: {
    present: number;
    late: number;
    absent: number;
    excused: number;
    totalRecords: number;
  };
  dailyAttendance: DailyAttendancePoint[];

  // 4. Academic Performance
  subjectPerformance: SubjectAnalyticsRow[];
  scoreDistribution: {
    band: string;
    count: number;
  }[];

  // 5. Financial & Fee Collection
  invoiceStatusBreakdown: {
    status: string;
    count: number;
    totalAmount: number;
    paidAmount: number;
    balance: number;
  }[];
  paymentMethods: PaymentMethodSummary[];
  monthlyFinance: MonthlyCollectionPoint[];

  // 6. Staff & HR Breakdown
  staffDepartments: {
    type: string;
    active: number;
    onLeave: number;
    left: number;
  }[];
}

function monthKey(isoDate: string | null | undefined): string | null {
  if (!isoDate || isoDate.length < 7) return null;
  return isoDate.slice(0, 7); // YYYY-MM
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export async function getSchoolAnalytics(options?: {
  academicYearId?: string | null;
  termId?: string | null;
}): Promise<AnalyticsSnapshot> {
  // Fetch core datasets in parallel; RLS automatically scopes to the user's school & permissions
  const [
    yearsRes,
    termsRes,
    studentsRes,
    classesRes,
    enrollmentsRes,
    attendanceRes,
    scoresRes,
    subjectsRes,
    invoicesRes,
    staffRes,
  ] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id, name, is_current")
      .order("start_date", { ascending: false }),
    supabase
      .from("terms")
      .select("id, academic_year_id, name, is_current")
      .order("start_date", { ascending: true }),
    supabase
      .from("students")
      .select("id, gender, status, admitted_on")
      .is("deleted_at", null),
    supabase
      .from("classes")
      .select(
        "id, academic_year_id, section, levels(name, sort_order), staff(full_name)",
      ),
    supabase
      .from("enrollments")
      .select("id, student_id, class_id, academic_year_id"),
    supabase
      .from("attendance")
      .select("id, student_id, class_id, date, status")
      .order("date", { ascending: true })
      .limit(5000),
    supabase
      .from("scores")
      .select("enrollment_id, subject_id, term_id, ca1, ca2, exam")
      .limit(5000),
    supabase.from("subjects").select("id, name, code").order("name"),
    supabase
      .from("invoices")
      .select(
        "id, term_id, issued_on, status, invoice_items(amount), payments(amount, method, network, paid_on, voided_at)",
      )
      .is("deleted_at", null),
    supabase.from("staff").select("id, type, status").is("deleted_at", null),
  ]);

  const years = yearsRes.data ?? [];
  const terms = termsRes.data ?? [];
  const activeYear =
    years.find((y) => y.id === options?.academicYearId) ??
    years.find((y) => y.is_current) ??
    years[0] ??
    null;

  const yearTerms = activeYear
    ? terms.filter((t) => t.academic_year_id === activeYear.id)
    : terms;
  const activeTerm =
    yearTerms.find((t) => t.id === options?.termId) ??
    yearTerms.find((t) => t.is_current) ??
    yearTerms[0] ??
    null;

  // ── 1. Students & Demographics ─────────────────────────────────────────────
  const students = studentsRes.data ?? [];
  const studentById = new Map(students.map((s) => [s.id, s]));
  const activeStudentsList = students.filter((s) => s.status === "active");
  const completedStudents = students.filter(
    (s) => s.status === "completed",
  ).length;
  const leftStudents = students.filter((s) => s.status === "left").length;
  const maleStudents = activeStudentsList.filter(
    (s) => s.gender === "male",
  ).length;
  const femaleStudents = activeStudentsList.filter(
    (s) => s.gender === "female",
  ).length;

  // Monthly admissions (last 6 months with activity or calendar window)
  const admissionCounts = new Map<string, number>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    admissionCounts.set(ym, 0);
  }
  for (const s of students) {
    const ym = monthKey(s.admitted_on);
    if (ym) {
      admissionCounts.set(ym, (admissionCounts.get(ym) ?? 0) + 1);
    }
  }
  const monthlyAdmissions: MonthlyAdmissionPoint[] = [...admissionCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([ym, admitted]) => ({
      month: formatMonthLabel(ym),
      admitted,
    }));

  // ── 2. Attendance ──────────────────────────────────────────────────────────
  const allAttendance = attendanceRes.data ?? [];
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let excusedCount = 0;

  const byDate = new Map<
    string,
    { present: number; late: number; absent: number; excused: number }
  >();
  const byClassAtt = new Map<string, { attended: number; total: number }>();

  for (const a of allAttendance) {
    if (a.status === "present") presentCount++;
    else if (a.status === "late") lateCount++;
    else if (a.status === "absent") absentCount++;
    else if (a.status === "excused") excusedCount++;

    const dRow = byDate.get(a.date) ?? {
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
    };
    if (a.status === "present") dRow.present++;
    else if (a.status === "late") dRow.late++;
    else if (a.status === "absent") dRow.absent++;
    else if (a.status === "excused") dRow.excused++;
    byDate.set(a.date, dRow);

    const cRow = byClassAtt.get(a.class_id) ?? { attended: 0, total: 0 };
    cRow.total++;
    if (a.status === "present" || a.status === "late") cRow.attended++;
    byClassAtt.set(a.class_id, cRow);
  }

  const totalAttRecords = allAttendance.length;
  const overallAttendanceRate =
    totalAttRecords > 0
      ? Number((((presentCount + lateCount) / totalAttRecords) * 100).toFixed(1))
      : null;

  const dailyAttendance: DailyAttendancePoint[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, counts]) => {
      const tot =
        counts.present + counts.late + counts.absent + counts.excused;
      return {
        date: date.slice(5), // MM-DD
        present: counts.present,
        late: counts.late,
        absent: counts.absent,
        excused: counts.excused,
        rate:
          tot > 0
            ? Number((((counts.present + counts.late) / tot) * 100).toFixed(1))
            : 0,
      };
    });

  // ── 3. Scores & Academic Performance ───────────────────────────────────────
  const enrollments = (enrollmentsRes.data ?? []).filter(
    (e) => !activeYear || e.academic_year_id === activeYear.id,
  );
  const enrollmentClassMap = new Map(
    enrollments.map((e) => [e.id, e.class_id]),
  );

  const rawScores = (scoresRes.data ?? []).filter(
    (sc) => !activeTerm || sc.term_id === activeTerm.id,
  );

  const classTotals = new Map<string, number[]>();
  const subjectTotals = new Map<string, number[]>();
  const allNumericTotals: number[] = [];

  for (const sc of rawScores) {
    const ca1 = sc.ca1 !== null ? Number(sc.ca1) : null;
    const ca2 = sc.ca2 !== null ? Number(sc.ca2) : null;
    const exam = sc.exam !== null ? Number(sc.exam) : null;
    if (ca1 === null && ca2 === null && exam === null) continue;
    const total = (ca1 ?? 0) + (ca2 ?? 0) + (exam ?? 0);
    allNumericTotals.push(total);

    const subArr = subjectTotals.get(sc.subject_id) ?? [];
    subArr.push(total);
    subjectTotals.set(sc.subject_id, subArr);

    const cId = enrollmentClassMap.get(sc.enrollment_id);
    if (cId) {
      const cArr = classTotals.get(cId) ?? [];
      cArr.push(total);
      classTotals.set(cId, cArr);
    }
  }

  const overallAcademicAverage =
    allNumericTotals.length > 0
      ? Number(
          (
            allNumericTotals.reduce((a, b) => a + b, 0) /
            allNumericTotals.length
          ).toFixed(1),
        )
      : null;

  const overallPassRate =
    allNumericTotals.length > 0
      ? Number(
          (
            (allNumericTotals.filter((n) => n >= 50).length /
              allNumericTotals.length) *
            100
          ).toFixed(1),
        )
      : null;

  const subjects = subjectsRes.data ?? [];
  const subjectPerformance: SubjectAnalyticsRow[] = subjects
    .map((sub) => {
      const vals = subjectTotals.get(sub.id) ?? [];
      const n = vals.length;
      const avg =
        n > 0
          ? Number((vals.reduce((a, b) => a + b, 0) / n).toFixed(1))
          : null;
      const passRate =
        n > 0
          ? Number(((vals.filter((v) => v >= 50).length / n) * 100).toFixed(1))
          : null;
      const excellenceRate =
        n > 0
          ? Number(((vals.filter((v) => v >= 80).length / n) * 100).toFixed(1))
          : null;
      return {
        subjectId: sub.id,
        subjectName: sub.name,
        code: sub.code,
        assessedStudents: n,
        averageScore: avg,
        passRate,
        excellenceRate,
      };
    })
    .sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1));

  const scoreDistribution = [
    {
      band: "80–100% (Distinction)",
      count: allNumericTotals.filter((v) => v >= 80).length,
    },
    {
      band: "70–79% (Very Good)",
      count: allNumericTotals.filter((v) => v >= 70 && v < 80).length,
    },
    {
      band: "60–69% (Good)",
      count: allNumericTotals.filter((v) => v >= 60 && v < 70).length,
    },
    {
      band: "50–59% (Credit / Pass)",
      count: allNumericTotals.filter((v) => v >= 50 && v < 60).length,
    },
    {
      band: "Below 50% (Needs Support)",
      count: allNumericTotals.filter((v) => v < 50).length,
    },
  ];

  // ── 4. Classes Breakdown ───────────────────────────────────────────────────
  const yearClasses = (classesRes.data ?? []).filter(
    (c) => !activeYear || c.academic_year_id === activeYear.id,
  );

  const classesSummary: ClassAnalyticsRow[] = yearClasses.map((c) => {
    const lvl = Array.isArray(c.levels) ? c.levels[0] : c.levels;
    const tchr = Array.isArray(c.staff) ? c.staff[0] : c.staff;
    const levelName = (lvl as { name?: string } | null)?.name ?? "Level";
    const className = `${levelName} ${c.section}`.trim();
    const classEnrols = enrollments.filter((e) => e.class_id === c.id);

    let male = 0;
    let female = 0;
    for (const ce of classEnrols) {
      const st = studentById.get(ce.student_id);
      if (st?.gender === "male") male++;
      else if (st?.gender === "female") female++;
    }

    const att = byClassAtt.get(c.id);
    const attendanceRate =
      att && att.total > 0
        ? Number(((att.attended / att.total) * 100).toFixed(1))
        : null;

    const cScores = classTotals.get(c.id) ?? [];
    const averageAcademicScore =
      cScores.length > 0
        ? Number(
            (cScores.reduce((a, b) => a + b, 0) / cScores.length).toFixed(1),
          )
        : null;

    return {
      classId: c.id,
      className,
      levelName,
      classTeacherName:
        (tchr as { full_name?: string } | null)?.full_name ?? null,
      totalStudents: classEnrols.length,
      maleCount: male,
      femaleCount: female,
      attendanceMarkedDays: att?.total ?? 0,
      attendanceRate,
      averageAcademicScore,
    };
  });

  // ── 5. Finance & Fee Collection ────────────────────────────────────────────
  const invoices = invoicesRes.data ?? [];
  let totalBilled = 0;
  let totalCollected = 0;

  const statusMap = new Map<
    string,
    { count: number; totalAmount: number; paidAmount: number; balance: number }
  >([
    ["paid", { count: 0, totalAmount: 0, paidAmount: 0, balance: 0 }],
    ["partial", { count: 0, totalAmount: 0, paidAmount: 0, balance: 0 }],
    ["unpaid", { count: 0, totalAmount: 0, paidAmount: 0, balance: 0 }],
  ]);

  const methodMap = new Map<string, { count: number; amount: number }>();
  const monthlyFinMap = new Map<string, { billed: number; collected: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyFinMap.set(ym, { billed: 0, collected: 0 });
  }

  for (const inv of invoices) {
    if (inv.status === "void") continue;
    const invTotal = (inv.invoice_items ?? []).reduce(
      (s, it) => s + Number(it.amount),
      0,
    );
    const validPayments = (inv.payments ?? []).filter((p) => !p.voided_at);
    const invPaid = validPayments.reduce((s, p) => s + Number(p.amount), 0);
    const invBal = Math.max(0, invTotal - invPaid);

    totalBilled += invTotal;
    totalCollected += invPaid;

    const stEntry = statusMap.get(inv.status) ?? {
      count: 0,
      totalAmount: 0,
      paidAmount: 0,
      balance: 0,
    };
    stEntry.count++;
    stEntry.totalAmount += invTotal;
    stEntry.paidAmount += invPaid;
    stEntry.balance += invBal;
    statusMap.set(inv.status, stEntry);

    const invYm = monthKey(inv.issued_on);
    if (invYm) {
      const mRow = monthlyFinMap.get(invYm) ?? { billed: 0, collected: 0 };
      mRow.billed += invTotal;
      monthlyFinMap.set(invYm, mRow);
    }

    for (const p of validPayments) {
      const label =
        p.method === "mobile_money"
          ? `Mobile Money (${(p.network ?? "momo").toUpperCase()})`
          : p.method === "bank_transfer"
            ? "Bank Transfer"
            : "Cash";
      const mEntry = methodMap.get(label) ?? { count: 0, amount: 0 };
      mEntry.count++;
      mEntry.amount += Number(p.amount);
      methodMap.set(label, mEntry);

      const payYm = monthKey(p.paid_on);
      if (payYm) {
        const mRow = monthlyFinMap.get(payYm) ?? { billed: 0, collected: 0 };
        mRow.collected += Number(p.amount);
        monthlyFinMap.set(payYm, mRow);
      }
    }
  }

  const totalArrears = Math.max(0, totalBilled - totalCollected);
  const collectionRate =
    totalBilled > 0
      ? Number(((totalCollected / totalBilled) * 100).toFixed(1))
      : null;

  // ── 6. Staff & HR ──────────────────────────────────────────────────────────
  const staffRows = staffRes.data ?? [];
  const activeStaff = staffRows.filter((s) => s.status === "active");
  const teachingStaff = activeStaff.filter((s) => s.type === "teaching").length;
  const nonTeachingStaff = activeStaff.filter(
    (s) => s.type === "non_teaching",
  ).length;
  const studentTeacherRatio =
    teachingStaff > 0
      ? Number((activeStudentsList.length / teachingStaff).toFixed(1))
      : null;

  const staffDepartments = [
    {
      type: "Teaching Staff",
      active: staffRows.filter(
        (s) => s.type === "teaching" && s.status === "active",
      ).length,
      onLeave: staffRows.filter(
        (s) => s.type === "teaching" && s.status === "on_leave",
      ).length,
      left: staffRows.filter(
        (s) => s.type === "teaching" && s.status === "left",
      ).length,
    },
    {
      type: "Non-Teaching & Admin",
      active: staffRows.filter(
        (s) => s.type === "non_teaching" && s.status === "active",
      ).length,
      onLeave: staffRows.filter(
        (s) => s.type === "non_teaching" && s.status === "on_leave",
      ).length,
      left: staffRows.filter(
        (s) => s.type === "non_teaching" && s.status === "left",
      ).length,
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    academicYearName: activeYear?.name ?? null,
    termName: activeTerm?.name ?? null,
    kpis: {
      totalStudents: students.length,
      activeStudents: activeStudentsList.length,
      completedStudents,
      leftStudents,
      maleStudents,
      femaleStudents,
      totalStaff: activeStaff.length,
      teachingStaff,
      nonTeachingStaff,
      studentTeacherRatio,
      overallAttendanceRate,
      overallAcademicAverage,
      overallPassRate,
      totalBilled,
      totalCollected,
      totalArrears,
      collectionRate,
    },
    classesSummary,
    monthlyAdmissions,
    attendanceSummary: {
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      excused: excusedCount,
      totalRecords: totalAttRecords,
    },
    dailyAttendance,
    subjectPerformance,
    scoreDistribution,
    invoiceStatusBreakdown: [...statusMap.entries()].map(([status, v]) => ({
      status: status.toUpperCase(),
      ...v,
    })),
    paymentMethods: [...methodMap.entries()].map(([method, v]) => ({
      method,
      ...v,
    })),
    monthlyFinance: [...monthlyFinMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([ym, v]) => ({
        month: formatMonthLabel(ym),
        billed: v.billed,
        collected: v.collected,
      })),
    staffDepartments,
  };
}
