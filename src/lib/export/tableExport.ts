/**
 * One way to download any table of data the screen shows: CSV, Excel, PDF, PNG or JPEG.
 * The heavy libraries load only when someone actually downloads, so they cost nothing at start-up.
 * Who may download is decided by the caller (a module's `.download` action); this file only makes files.
 */

export type ExportFormat = "csv" | "xlsx" | "pdf" | "png" | "jpeg";
export type Cell = string | number | boolean | null | undefined;

export interface ExportTable {
  /** Heading printed on PDF and image downloads. */
  title: string;
  /** A line under the heading, for example the filters used or the school's name. */
  subtitle?: string;
  columns: string[];
  rows: Cell[][];
  /** File name without the extension. The date is added for you. */
  filename: string;
}

export const FORMAT_LABELS: Record<ExportFormat, { label: string; hint: string; ext: string }> = {
  xlsx: { label: "Excel", hint: "A spreadsheet you can edit", ext: "xlsx" },
  csv: { label: "CSV", hint: "Plain data for other programs", ext: "csv" },
  pdf: { label: "PDF", hint: "A printable document", ext: "pdf" },
  png: { label: "PNG image", hint: "A picture to share", ext: "png" },
  jpeg: { label: "JPEG image", hint: "A smaller picture to share", ext: "jpg" },
};

/** Pictures and PDFs of very long tables become unreadable, so they are capped. */
export const IMAGE_ROW_LIMIT = 200;

function text(c: Cell): string {
  if (c === null || c === undefined) return "";
  return String(c);
}

export function fileName(base: string, ext: string): string {
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "download";
  return `${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** A cell that starts with = + - or @ would run as a formula when the file is opened in a spreadsheet. */
function defuse(s: string): string {
  return /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+([.,]\d+)*$/.test(s) ? `'${s}` : s;
}

function csvCell(c: Cell): string {
  const s = defuse(text(c));
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tableToCsv(t: ExportTable): string {
  return [t.columns, ...t.rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

async function toXlsx(t: ExportTable): Promise<Blob> {
  const XLSX = await import("xlsx");
  const aoa = [t.columns, ...t.rows.map((r) => r.map((c) => (typeof c === "number" ? c : defuse(text(c)))))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = t.columns.map((name, i) => ({
    wch: Math.min(40, Math.max(name.length, ...t.rows.slice(0, 200).map((r) => text(r[i]).length)) + 2),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function toPdf(t: ExportTable): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const landscape = t.columns.length > 5;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const usable = W - M * 2;

  // Column widths follow the longest content, within sensible limits.
  const weights = t.columns.map((name, i) =>
    Math.min(28, Math.max(6, name.length, ...t.rows.slice(0, 100).map((r) => text(r[i]).length))),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / total) * usable);

  let y = M;
  const heading = () => {
    doc.setFont("helvetica", "bold").setFontSize(14).text(t.title, M, y);
    y += 16;
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100);
    const sub = [t.subtitle, `Downloaded ${new Date().toLocaleString()}`].filter(Boolean).join(" · ");
    doc.text(doc.splitTextToSize(sub, usable) as string[], M, y);
    doc.setTextColor(0);
    y += 18;
  };
  const header = () => {
    doc.setFont("helvetica", "bold").setFontSize(8.5);
    doc.setFillColor(238, 238, 238).rect(M, y - 10, usable, 16, "F");
    let x = M;
    t.columns.forEach((c, i) => {
      doc.text(doc.splitTextToSize(c, widths[i] - 6)[0] as string, x + 3, y);
      x += widths[i];
    });
    y += 14;
    doc.setFont("helvetica", "normal");
  };
  heading();
  header();
  doc.setFontSize(8.5);
  for (const r of t.rows) {
    const lines = r.map((c, i) => doc.splitTextToSize(text(c), widths[i] - 6).slice(0, 4) as string[]);
    const h = Math.max(...lines.map((l) => l.length), 1) * 10.5 + 4;
    if (y + h > H - M) {
      doc.addPage();
      y = M;
      header();
      doc.setFontSize(8.5);
    }
    let x = M;
    lines.forEach((l, i) => {
      doc.text(l, x + 3, y);
      x += widths[i];
    });
    doc.setDrawColor(225).line(M, y + h - 9, M + usable, y + h - 9);
    y += h;
  }
  if (t.rows.length === 0) doc.text("Nothing to show.", M, y);
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p).setFontSize(8).setTextColor(130).text(`Page ${p} of ${pages}`, W - M, H - 18, { align: "right" });
  }
  return doc.output("blob");
}

async function toImage(t: ExportTable, kind: "png" | "jpeg"): Promise<Blob> {
  const { toPng, toJpeg } = await import("html-to-image");
  const rows = t.rows.slice(0, IMAGE_ROW_LIMIT);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;padding:20px;background:#fff;color:#111;font:13px/1.35 system-ui,sans-serif;width:max-content;max-width:1400px";
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  host.innerHTML =
    `<div style="font-size:18px;font-weight:700">${esc(t.title)}</div>` +
    `<div style="color:#666;margin:2px 0 12px">${esc([t.subtitle, new Date().toLocaleDateString()].filter(Boolean).join(" · "))}</div>` +
    `<table style="border-collapse:collapse;width:100%"><thead><tr>${t.columns
      .map((c) => `<th style="text-align:left;background:#eee;border:1px solid #ddd;padding:5px 8px">${esc(c)}</th>`)
      .join("")}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #ddd;padding:5px 8px;vertical-align:top${text(c).length <= 24 ? ";white-space:nowrap" : ""}">${esc(text(c))}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>` +
    (t.rows.length > rows.length ? `<div style="color:#666;margin-top:8px">First ${rows.length} of ${t.rows.length} rows. Use Excel or CSV for everything.</div>` : "");
  document.body.appendChild(host);
  try {
    // The picture is taken from a copy of the table, so the copy must sit at the origin even though the original is off-screen.
    const opts = { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: false, style: { position: "static", left: "0", top: "0" } };
    const dataUrl = kind === "png" ? await toPng(host, opts) : await toJpeg(host, { ...opts, quality: 0.92 });
    return await (await fetch(dataUrl)).blob();
  } finally {
    document.body.removeChild(host);
  }
}

export async function downloadTable(t: ExportTable, format: ExportFormat): Promise<void> {
  const ext = FORMAT_LABELS[format].ext;
  let blob: Blob;
  switch (format) {
    case "csv":
      blob = new Blob(["﻿" + tableToCsv(t)], { type: "text/csv;charset=utf-8" });
      break;
    case "xlsx":
      blob = await toXlsx(t);
      break;
    case "pdf":
      blob = await toPdf(t);
      break;
    default:
      blob = await toImage(t, format);
  }
  saveBlob(blob, fileName(t.filename, ext));
}
