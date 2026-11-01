import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { AnalyticsSnapshot } from "../data/analytics";
import type { InstitutionDetails } from "../data/setup";

function safeFilename(base: string, ext: string): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const date = new Date().toISOString().slice(0, 10);
  return `${slug || "school"}-analytics-${date}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function dataUrlToUint8Array(dataUrl: string): {
  bytes: Uint8Array;
  width: number;
  height: number;
} {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return { bytes, width: 600, height: 400 };
}

/** Capture the live preview DOM node as a high-resolution PNG data URL and dimensions. */
async function capturePreviewNode(element: HTMLElement): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  const rect = element.getBoundingClientRect();
  const isDark = document.documentElement.classList.contains("dark");
  const bg = isDark ? "#0f172a" : "#ffffff";

  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: bg,
    style: {
      margin: "0",
    },
  });

  return {
    dataUrl,
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

// ─── 1. Export as Image (PNG) ────────────────────────────────────────────────

export async function exportAnalyticsAsImage(
  element: HTMLElement,
  schoolName: string,
): Promise<void> {
  const { dataUrl } = await capturePreviewNode(element);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  triggerDownload(blob, safeFilename(schoolName, "png"));
}

// ─── 2. Export as PDF (Exact Preview Snapshot, Multi-page A4) ────────────────

export async function exportAnalyticsAsPdf(
  element: HTMLElement,
  schoolName: string,
): Promise<void> {
  const { dataUrl, width, height } = await capturePreviewNode(element);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  const imgHeightMm = (height * usableWidth) / width;
  let heightLeft = imgHeightMm;
  let position = margin;

  pdf.addImage(
    dataUrl,
    "PNG",
    margin,
    position,
    usableWidth,
    imgHeightMm,
    undefined,
    "FAST",
  );
  heightLeft -= usableHeight;

  while (heightLeft > 2) {
    position = heightLeft - imgHeightMm + margin;
    pdf.addPage();
    pdf.addImage(
      dataUrl,
      "PNG",
      margin,
      position,
      usableWidth,
      imgHeightMm,
      undefined,
      "FAST",
    );
    heightLeft -= usableHeight;
  }

  pdf.save(safeFilename(schoolName, "pdf"));
}

// ─── 3. Export as DOCX (Visual Preview + Native Word Tables) ─────────────────

function makeWordTable(headers: string[], rows: (string | number)[][]): Table {
  const border = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: "CBD5E1",
  };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(
          (h) =>
            new TableCell({
              borders: { top: border, bottom: border, left: border, right: border },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: h, bold: true, size: 20 }),
                  ],
                }),
              ],
            }),
        ),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map(
              (cell) =>
                new TableCell({
                  borders: { top: border, bottom: border, left: border, right: border },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: String(cell ?? "—"), size: 19 }),
                      ],
                    }),
                  ],
                }),
            ),
          }),
      ),
    ],
  });
}

export async function exportAnalyticsAsDocx(
  element: HTMLElement,
  snapshot: AnalyticsSnapshot,
  institution: InstitutionDetails | null | undefined,
): Promise<void> {
  const schoolName = institution?.name || "School Analytics Report";
  const currency = institution?.currency || "GHS";
  const { dataUrl, width, height } = await capturePreviewNode(element);
  const { bytes } = dataUrlToUint8Array(dataUrl);

  const targetWidthPx = 600;
  const targetHeightPx = Math.max(
    200,
    Math.round((height / Math.max(1, width)) * targetWidthPx),
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: `${schoolName.toUpperCase()} — OFFICIAL ANALYTICS REPORT`,
                bold: true,
                size: 32,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: [
                  institution?.motto ? `"${institution.motto}"` : null,
                  institution?.address,
                  institution?.phone,
                  institution?.email,
                ]
                  .filter(Boolean)
                  .join(" · "),
                italics: true,
                size: 20,
                color: "475569",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: `Academic Year: ${snapshot.academicYearName ?? "All"} | Term: ${snapshot.termName ?? "All"} | Generated: ${new Date(snapshot.generatedAt).toLocaleString()}`,
                size: 20,
              }),
            ],
          }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: "1. Visual Analytics Dashboard Preview",
                bold: true,
                size: 26,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 280 },
            children: [
              new ImageRun({
                data: bytes,
                transformation: {
                  width: targetWidthPx,
                  height: targetHeightPx,
                },
                type: "png",
              }),
            ],
          }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: "2. Executive Key Performance Indicators (KPIs)",
                bold: true,
                size: 26,
              }),
            ],
          }),
          makeWordTable(
            ["Metric", "Value", "Notes / Breakdown"],
            [
              [
                "Active Students",
                snapshot.kpis.activeStudents,
                `Male: ${snapshot.kpis.maleStudents} | Female: ${snapshot.kpis.femaleStudents} | Total Register: ${snapshot.kpis.totalStudents}`,
              ],
              [
                "Active Staff",
                snapshot.kpis.totalStaff,
                `Teaching: ${snapshot.kpis.teachingStaff} | Non-Teaching: ${snapshot.kpis.nonTeachingStaff} | Pupil-Teacher Ratio: ${snapshot.kpis.studentTeacherRatio !== null ? `${snapshot.kpis.studentTeacherRatio}:1` : "—"}`,
              ],
              [
                "Overall Attendance Rate",
                snapshot.kpis.overallAttendanceRate !== null
                  ? `${snapshot.kpis.overallAttendanceRate}%`
                  : "—",
                `${snapshot.attendanceSummary.totalRecords} total attendance marks recorded`,
              ],
              [
                "Academic Average & Pass Rate",
                snapshot.kpis.overallAcademicAverage !== null
                  ? `${snapshot.kpis.overallAcademicAverage}%`
                  : "—",
                `Pass Rate (>=50%): ${snapshot.kpis.overallPassRate !== null ? `${snapshot.kpis.overallPassRate}%` : "—"}`,
              ],
              [
                `Total Fees Billed (${currency})`,
                `${currency} ${snapshot.kpis.totalBilled.toFixed(2)}`,
                `Collected: ${currency} ${snapshot.kpis.totalCollected.toFixed(2)} | Arrears: ${currency} ${snapshot.kpis.totalArrears.toFixed(2)} (${snapshot.kpis.collectionRate ?? 0}% collected)`,
              ],
            ],
          ),

          new Paragraph({
            spacing: { before: 280 },
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: "3. Class Enrollment, Attendance & Academic Summary",
                bold: true,
                size: 26,
              }),
            ],
          }),
          makeWordTable(
            [
              "Class",
              "Class Teacher",
              "Pupils (M / F)",
              "Attendance %",
              "Academic Avg %",
            ],
            snapshot.classesSummary.map((c) => [
              c.className,
              c.classTeacherName ?? "Unassigned",
              `${c.totalStudents} (${c.maleCount}M / ${c.femaleCount}F)`,
              c.attendanceRate !== null ? `${c.attendanceRate}%` : "—",
              c.averageAcademicScore !== null
                ? `${c.averageAcademicScore}%`
                : "—",
            ]),
          ),

          new Paragraph({
            spacing: { before: 280 },
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: "4. Subject Academic Performance",
                bold: true,
                size: 26,
              }),
            ],
          }),
          makeWordTable(
            [
              "Subject",
              "Code",
              "Assessed Pupils",
              "Mean Score %",
              "Pass Rate (>=50%)",
              "Distinction (>=80%)",
            ],
            snapshot.subjectPerformance.map((s) => [
              s.subjectName,
              s.code ?? "—",
              s.assessedStudents,
              s.averageScore !== null ? `${s.averageScore}%` : "—",
              s.passRate !== null ? `${s.passRate}%` : "—",
              s.excellenceRate !== null ? `${s.excellenceRate}%` : "—",
            ]),
          ),

          new Paragraph({
            spacing: { before: 280 },
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: "5. Finance & Fee Collection Summary",
                bold: true,
                size: 26,
              }),
            ],
          }),
          makeWordTable(
            [
              "Invoice Status",
              "Invoices",
              `Billed (${currency})`,
              `Paid (${currency})`,
              `Balance (${currency})`,
            ],
            snapshot.invoiceStatusBreakdown.map((f) => [
              f.status,
              f.count,
              f.totalAmount.toFixed(2),
              f.paidAmount.toFixed(2),
              f.balance.toFixed(2),
            ]),
          ),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, safeFilename(schoolName, "docx"));
}

// ─── 4. Export as Excel (.xlsx Multi-Sheet Workbook) ─────────────────────────

export function exportAnalyticsAsExcel(
  snapshot: AnalyticsSnapshot,
  institution: InstitutionDetails | null | undefined,
): void {
  const schoolName = institution?.name || "School";
  const currency = institution?.currency || "GHS";
  const wb = XLSX.utils.book_new();

  // Sheet 1: Executive Overview
  const overviewRows = [
    ["OFFICIAL SCHOOL ANALYTICS REPORT", schoolName],
    ["Motto", institution?.motto ?? ""],
    ["Address", institution?.address ?? ""],
    ["Contact", [institution?.phone, institution?.email].filter(Boolean).join(" / ")],
    ["Academic Year", snapshot.academicYearName ?? "All"],
    ["Term", snapshot.termName ?? "All"],
    ["Generated At", new Date(snapshot.generatedAt).toLocaleString()],
    [],
    ["EXECUTIVE KPI", "VALUE"],
    ["Total Registered Students", snapshot.kpis.totalStudents],
    ["Active Students", snapshot.kpis.activeStudents],
    ["Male Students (Active)", snapshot.kpis.maleStudents],
    ["Female Students (Active)", snapshot.kpis.femaleStudents],
    ["Completed / Graduated Students", snapshot.kpis.completedStudents],
    ["Withdrawn / Left Students", snapshot.kpis.leftStudents],
    ["Active Staff", snapshot.kpis.totalStaff],
    ["Teaching Staff", snapshot.kpis.teachingStaff],
    ["Non-Teaching Staff", snapshot.kpis.nonTeachingStaff],
    ["Student-to-Teacher Ratio", snapshot.kpis.studentTeacherRatio ?? "—"],
    ["Overall Attendance Rate (%)", snapshot.kpis.overallAttendanceRate ?? "—"],
    ["Overall Academic Mean (%)", snapshot.kpis.overallAcademicAverage ?? "—"],
    ["Overall Academic Pass Rate (%)", snapshot.kpis.overallPassRate ?? "—"],
    [`Total Fees Billed (${currency})`, snapshot.kpis.totalBilled],
    [`Total Fees Collected (${currency})`, snapshot.kpis.totalCollected],
    [`Total Outstanding Arrears (${currency})`, snapshot.kpis.totalArrears],
    ["Fee Collection Rate (%)", snapshot.kpis.collectionRate ?? "—"],
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(overviewRows),
    "Executive Overview",
  );

  // Sheet 2: Classes Breakdown
  const classSheet = XLSX.utils.json_to_sheet(
    snapshot.classesSummary.map((c) => ({
      Class: c.className,
      Level: c.levelName,
      "Class Teacher": c.classTeacherName ?? "Unassigned",
      "Total Pupils": c.totalStudents,
      Male: c.maleCount,
      Female: c.femaleCount,
      "Attendance Records": c.attendanceMarkedDays,
      "Attendance Rate (%)": c.attendanceRate ?? "—",
      "Academic Average (%)": c.averageAcademicScore ?? "—",
    })),
  );
  XLSX.utils.book_append_sheet(wb, classSheet, "Classes Breakdown");

  // Sheet 3: Subject Performance
  const subjectSheet = XLSX.utils.json_to_sheet(
    snapshot.subjectPerformance.map((s) => ({
      Subject: s.subjectName,
      Code: s.code ?? "",
      "Assessed Pupils": s.assessedStudents,
      "Average Score (%)": s.averageScore ?? "—",
      "Pass Rate >=50% (%)": s.passRate ?? "—",
      "Distinction Rate >=80% (%)": s.excellenceRate ?? "—",
    })),
  );
  XLSX.utils.book_append_sheet(wb, subjectSheet, "Subject Performance");

  // Sheet 4: Attendance Spectrum
  const attSheet = XLSX.utils.json_to_sheet(
    snapshot.dailyAttendance.map((d) => ({
      Date: d.date,
      Present: d.present,
      Late: d.late,
      Absent: d.absent,
      Excused: d.excused,
      "Attendance Rate (%)": d.rate,
    })),
  );
  XLSX.utils.book_append_sheet(wb, attSheet, "Attendance Trend");

  // Sheet 5: Finance & Billing
  const finSheet = XLSX.utils.json_to_sheet([
    ...snapshot.invoiceStatusBreakdown.map((f) => ({
      Category: `Invoice Status: ${f.status}`,
      Count: f.count,
      [`Billed (${currency})`]: f.totalAmount,
      [`Collected (${currency})`]: f.paidAmount,
      [`Balance (${currency})`]: f.balance,
    })),
    ...snapshot.paymentMethods.map((m) => ({
      Category: `Payment Channel: ${m.method}`,
      Count: m.count,
      [`Billed (${currency})`]: 0,
      [`Collected (${currency})`]: m.amount,
      [`Balance (${currency})`]: 0,
    })),
  ]);
  XLSX.utils.book_append_sheet(wb, finSheet, "Finance & Receipts");

  // Sheet 6: Staff & HR
  const staffSheet = XLSX.utils.json_to_sheet(
    snapshot.staffDepartments.map((d) => ({
      Department: d.type,
      Active: d.active,
      "On Leave": d.onLeave,
      Left: d.left,
    })),
  );
  XLSX.utils.book_append_sheet(wb, staffSheet, "Staff & HR");

  XLSX.writeFile(wb, safeFilename(schoolName, "xlsx"));
}

// ─── 5. Export as CSV (Complete Structured Report) ───────────────────────────

function csvEscape(val: unknown): string {
  const s = String(val ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportAnalyticsAsCsv(
  snapshot: AnalyticsSnapshot,
  institution: InstitutionDetails | null | undefined,
): void {
  const schoolName = institution?.name || "School";
  const currency = institution?.currency || "GHS";
  const lines: string[][] = [];

  lines.push(["OFFICIAL SCHOOL ANALYTICS REPORT", schoolName]);
  lines.push(["Academic Year", snapshot.academicYearName ?? "All"]);
  lines.push(["Term", snapshot.termName ?? "All"]);
  lines.push(["Generated At", new Date(snapshot.generatedAt).toISOString()]);
  lines.push([]);

  lines.push(["=== 1. EXECUTIVE KPIS ==="]);
  lines.push(["Metric", "Value"]);
  lines.push(["Total Students", String(snapshot.kpis.totalStudents)]);
  lines.push(["Active Students", String(snapshot.kpis.activeStudents)]);
  lines.push(["Male Students", String(snapshot.kpis.maleStudents)]);
  lines.push(["Female Students", String(snapshot.kpis.femaleStudents)]);
  lines.push(["Active Staff", String(snapshot.kpis.totalStaff)]);
  lines.push(["Teaching Staff", String(snapshot.kpis.teachingStaff)]);
  lines.push([
    "Student-Teacher Ratio",
    String(snapshot.kpis.studentTeacherRatio ?? "—"),
  ]);
  lines.push([
    "Overall Attendance Rate (%)",
    String(snapshot.kpis.overallAttendanceRate ?? "—"),
  ]);
  lines.push([
    "Overall Academic Average (%)",
    String(snapshot.kpis.overallAcademicAverage ?? "—"),
  ]);
  lines.push([
    "Overall Academic Pass Rate (%)",
    String(snapshot.kpis.overallPassRate ?? "—"),
  ]);
  lines.push([
    `Total Fees Billed (${currency})`,
    snapshot.kpis.totalBilled.toFixed(2),
  ]);
  lines.push([
    `Total Fees Collected (${currency})`,
    snapshot.kpis.totalCollected.toFixed(2),
  ]);
  lines.push([
    `Total Outstanding Arrears (${currency})`,
    snapshot.kpis.totalArrears.toFixed(2),
  ]);
  lines.push([
    "Fee Collection Rate (%)",
    String(snapshot.kpis.collectionRate ?? "—"),
  ]);
  lines.push([]);

  lines.push(["=== 2. CLASSES BREAKDOWN ==="]);
  lines.push([
    "Class",
    "Level",
    "Class Teacher",
    "Total Students",
    "Male",
    "Female",
    "Attendance Rate (%)",
    "Academic Average (%)",
  ]);
  for (const c of snapshot.classesSummary) {
    lines.push([
      c.className,
      c.levelName,
      c.classTeacherName ?? "Unassigned",
      String(c.totalStudents),
      String(c.maleCount),
      String(c.femaleCount),
      String(c.attendanceRate ?? "—"),
      String(c.averageAcademicScore ?? "—"),
    ]);
  }
  lines.push([]);

  lines.push(["=== 3. SUBJECT PERFORMANCE ==="]);
  lines.push([
    "Subject",
    "Code",
    "Assessed Pupils",
    "Average Score (%)",
    "Pass Rate >=50% (%)",
    "Distinction Rate >=80% (%)",
  ]);
  for (const s of snapshot.subjectPerformance) {
    lines.push([
      s.subjectName,
      s.code ?? "",
      String(s.assessedStudents),
      String(s.averageScore ?? "—"),
      String(s.passRate ?? "—"),
      String(s.excellenceRate ?? "—"),
    ]);
  }
  lines.push([]);

  lines.push(["=== 4. FINANCE & INVOICE BREAKDOWN ==="]);
  lines.push([
    "Invoice Status",
    "Invoice Count",
    `Billed (${currency})`,
    `Paid (${currency})`,
    `Balance (${currency})`,
  ]);
  for (const f of snapshot.invoiceStatusBreakdown) {
    lines.push([
      f.status,
      String(f.count),
      f.totalAmount.toFixed(2),
      f.paidAmount.toFixed(2),
      f.balance.toFixed(2),
    ]);
  }

  const csvContent =
    "\uFEFF" + lines.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, safeFilename(schoolName, "csv"));
}
