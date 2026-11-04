// Downloads of the term calendar: a list (bulleted or numbered) as PDF, text or Excel; a picture of
// the month grids as PNG, JPEG or PDF; and a file a phone's calendar app can open. Who may download is
// decided by the caller (the calendar.download action). The heavy libraries load only when used.
import {
  KIND_COLORS, KIND_LABELS, AUDIENCE_LABELS, MONTH_NAMES, WEEKDAY_NAMES, eventsOnDay, formatRange, listLines, listText, monthGrid,
  monthsBetween, sortEvents, toIcs, type CalEvent, type ListStyle,
} from "../calendar";
import { downloadTable, fileName, saveBlob } from "./tableExport";

export interface CalendarFile {
  /** The heading, for example "Term 1 calendar". */
  title: string;
  /** A line under it, for example the school's name. */
  subtitle: string;
  events: CalEvent[];
  /** The first and last day shown in a picture. */
  from: string;
  to: string;
}

export type ListFormat = "pdf" | "txt" | "xlsx";
export type PictureFormat = "png" | "jpeg" | "pdf";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "calendar";

export async function downloadList(f: CalendarFile, style: ListStyle, format: ListFormat): Promise<void> {
  const base = `${slug(f.title)}-list`;
  if (format === "txt") {
    saveBlob(new Blob(["﻿" + listText(f.title, f.subtitle, f.events, style)], { type: "text/plain;charset=utf-8" }), fileName(base, "txt"));
    return;
  }
  if (format === "xlsx") {
    await downloadTable({
      title: f.title, subtitle: f.subtitle, filename: base,
      columns: ["Starts", "Ends", "Time", "Event", "Kind", "For", "Status"],
      rows: sortEvents(f.events).map((e) => [
        e.startsOn, e.endsOn, e.startsAt ? `${e.startsAt.slice(0, 5)}${e.endsAt ? " to " + e.endsAt.slice(0, 5) : ""}` : "",
        e.title, KIND_LABELS[e.kind], AUDIENCE_LABELS[e.audience], e.published ? "Published" : "Draft",
      ]),
    }, "xlsx");
    return;
  }
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;
  doc.setFont("helvetica", "bold").setFontSize(18).text(f.title, M, y);
  y += 20;
  if (f.subtitle) { doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(110).text(f.subtitle, M, y); y += 14; }
  doc.setTextColor(0);
  y += 10;
  const lines = listLines(f.events, style);
  if (lines.length === 0) doc.setFont("helvetica", "normal").setFontSize(11).text("No events.", M, y);
  for (const l of lines) {
    if (l.heading) {
      if (y + 40 > H - M) { doc.addPage(); y = M; }
      y += 8;
      doc.setFont("helvetica", "bold").setFontSize(12).text(l.heading, M, y);
      y += 16;
    }
    doc.setFont("helvetica", "normal").setFontSize(11);
    const wrapped = doc.splitTextToSize(l.text, W - M * 2 - 14) as string[];
    if (y + wrapped.length * 15 > H - M) { doc.addPage(); y = M; }
    doc.text(wrapped, M + 14, y, { baseline: "alphabetic" });
    y += wrapped.length * 15;
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) doc.setPage(p).setFontSize(8).setTextColor(130).text(`Page ${p} of ${pages}`, W - M, H - 20, { align: "right" });
  saveBlob(doc.output("blob"), fileName(base, "pdf"));
}

export function downloadIcs(f: CalendarFile): void {
  saveBlob(new Blob([toIcs(f.events, f.title)], { type: "text/calendar;charset=utf-8" }), fileName(slug(f.title), "ics"));
}

// ─── The picture ─────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function monthHtml(year: number, month: number, events: CalEvent[]): string {
  const head = WEEKDAY_NAMES.map((d) => `<div style="padding:6px 8px;font-weight:600;color:#555;background:#f3f3f3;border:1px solid #ddd">${d}</div>`).join("");
  const cells = monthGrid(year, month).flat().map((c) => {
    const day = eventsOnDay(events, c.key);
    const chips = day.slice(0, 4).map((e) => {
      const col = KIND_COLORS[e.kind];
      return `<div style="margin-top:3px;padding:2px 5px;border-radius:4px;background:${col.bg};color:${col.fg};font-size:11px;line-height:1.25;overflow:hidden">${esc(e.title)}</div>`;
    }).join("");
    const more = day.length > 4 ? `<div style="margin-top:3px;font-size:10px;color:#666">+${day.length - 4} more</div>` : "";
    return `<div style="min-height:84px;padding:4px 5px;border:1px solid #ddd;background:${c.inMonth ? "#fff" : "#fafafa"};color:${c.inMonth ? "#111" : "#aaa"};overflow:hidden">` +
      `<div style="font-size:12px;font-weight:600">${c.day}</div>${c.inMonth ? chips + more : ""}</div>`;
  }).join("");
  return `<div style="margin-bottom:22px"><div style="font-size:17px;font-weight:700;margin:0 0 8px">${MONTH_NAMES[month]} ${year}</div>` +
    `<div style="display:grid;grid-template-columns:repeat(7,1fr);width:980px;font-size:12px">${head}${cells}</div></div>`;
}

function legendHtml(events: CalEvent[]): string {
  const used = [...new Set(events.map((e) => e.kind))];
  return `<div style="display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:#444;margin-top:4px">${used.map((k) =>
    `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${KIND_COLORS[k].bg};border:1px solid ${KIND_COLORS[k].fg};margin-right:5px"></span>${KIND_LABELS[k]}</span>`).join("")}</div>`;
}

async function renderHtml(html: string, as: "png" | "jpeg" = "png"): Promise<{ dataUrl: string; width: number; height: number }> {
  const { toJpeg, toPng } = await import("html-to-image");
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;padding:24px;background:#fff;color:#111;font:13px/1.35 system-ui,sans-serif;width:max-content";
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    // The picture is taken from a copy of the page, so the copy must sit at the origin even though the original is off-screen.
    const opts = { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: false, style: { position: "static", left: "0", top: "0" } };
    const dataUrl = as === "png" ? await toPng(host, opts) : await toJpeg(host, { ...opts, quality: 0.9 });
    const r = host.getBoundingClientRect();
    return { dataUrl, width: r.width, height: r.height };
  } finally {
    document.body.removeChild(host);
  }
}

async function toJpegBlob(dataUrl: string): Promise<Blob> {
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("image")); img.src = dataUrl; });
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0);
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("jpeg"))), "image/jpeg", 0.92));
}

export async function downloadPicture(f: CalendarFile, format: PictureFormat): Promise<void> {
  const months = monthsBetween(f.from, f.to);
  const heading = (small: boolean) =>
    `<div style="font-size:${small ? 20 : 24}px;font-weight:700">${esc(f.title)}</div><div style="color:#666;margin:2px 0 14px">${esc(f.subtitle)}</div>`;
  const base = slug(f.title);

  if (format === "pdf") {
    const { jsPDF } = await import("jspdf");
    // Pages are stored as compressed JPEG, which keeps a whole term to a few hundred kilobytes.
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    for (let i = 0; i < months.length; i++) {
      const m = months[i];
      const { dataUrl, width, height } = await renderHtml(heading(true) + monthHtml(m.year, m.month, f.events) + legendHtml(f.events), "jpeg");
      if (i > 0) doc.addPage();
      const scale = Math.min((W - 40) / width, (H - 40) / height);
      doc.addImage(dataUrl, "JPEG", (W - width * scale) / 2, 20, width * scale, height * scale);
    }
    saveBlob(doc.output("blob"), fileName(base, "pdf"));
    return;
  }

  const html = heading(false) + months.map((m) => monthHtml(m.year, m.month, f.events)).join("") + legendHtml(f.events);
  const { dataUrl } = await renderHtml(html);
  const blob = format === "png" ? await (await fetch(dataUrl)).blob() : await toJpegBlob(dataUrl);
  saveBlob(blob, fileName(base, format === "png" ? "png" : "jpg"));
}
