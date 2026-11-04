// Email helpers for the messaging function. Pure, so they can be tested without a network.

export const MAX_EMAIL_BODY = 5000;
export const MAX_SUBJECT = 150;

const ADDRESS = /^[^\s@<>"',;()[\]\\]+@[^\s@<>"',;()[\]\\]+\.[^\s@<>"',;()[\]\\]{2,}$/;

/** A plain, single address in lower case, or null when it does not look right. */
export function normalizeEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (s.length > 254 || !ADDRESS.test(s)) return null;
  const [local, domain] = s.split("@");
  if (local.length > 64 || domain.includes("..") || domain.startsWith(".") || domain.startsWith("-")) return null;
  return s;
}

/** Split a typed list (lines, commas, semicolons or spaces) into valid addresses. */
export function parseEmailList(raw: string): { valid: string[]; invalid: string[]; duplicates: number } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const part of raw.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean)) {
    const e = normalizeEmail(part);
    if (!e) invalid.push(part);
    else if (seen.has(e)) duplicates++;
    else { seen.add(e); valid.push(e); }
  }
  return { valid, invalid, duplicates };
}

/** One line only: a line break in a header would let text smuggle in extra headers. */
const LINE_BREAKS = new RegExp("[\r\n\u2028\u2029]+", "g");
export function cleanHeader(s: string, max = MAX_SUBJECT): string {
  return s.replace(LINE_BREAKS, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
}

/** "Pinks Academy via PhiNova <address>", with anything that could break the header taken out. */
export function fromHeader(schoolName: string, address: string): string {
  const name = cleanHeader(schoolName, 60).replace(/["<>\\@,;:()[\]]/g, "").trim() || "School";
  return `${name} via PhiNova <${address}>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The words the person wrote, as a simple email: plain text for old readers, light HTML for the rest. */
export function buildEmail(body: string, school: string, replyTo: string | null) {
  const footerText = `\n\n--\nSent by ${school} through PhiNova.${replyTo ? ` Reply to this email to reach the school.` : ""}\nIf you do not want these emails, tell the school office.`;
  const paragraphs = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const html =
    `<div style="font:15px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:20px">` +
    paragraphs +
    `<hr style="border:none;border-top:1px solid #e5e5e5;margin:22px 0 12px">` +
    `<p style="margin:0;font-size:12px;color:#777">Sent by ${escapeHtml(school)} through PhiNova.` +
    `${replyTo ? " Reply to this email to reach the school." : ""}<br>If you do not want these emails, tell the school office.</p></div>`;
  return { text: body + footerText, html };
}

/** Turn the provider's complaint into something a school administrator can act on. */
export function friendlyEmailError(status: number, body: Record<string, unknown>): string {
  const raw = String(body?.message ?? body?.error ?? `HTTP ${status}`);
  const t = raw.toLowerCase();
  if (/domain.*not.*verif|not verified|verify.*domain/.test(t)) return "The sending address is not verified with the email provider yet.";
  if (status === 401 || status === 403 || /api.?key|unauthori[sz]ed|restricted/.test(t)) return "The email provider rejected the API key.";
  if (status === 429 || /rate|too many|quota|limit/.test(t)) return "The email provider's limit was reached. Try again later.";
  if (/invalid.*(to|email|address)|recipient/.test(t)) return "The email provider rejected the address.";
  return raw.slice(0, 200);
}
