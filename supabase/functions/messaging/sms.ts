// Pure SMS helpers shared by the app and the `messaging` Edge Function.
// supabase/functions/messaging/sms.ts must stay byte-identical to this file;
// supabase/tests/sms_unit.mjs fails if the two drift apart.

/** Placeholders a template may use. Unknown ones are left as typed. */
export const PLACEHOLDERS = ["parent", "student", "class", "school", "balance", "date"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

/**
 * Turn a phone number as people write it into international form without a
 * plus sign (233244123456). Ghana numbers: 0244123456, 244123456, +233 24 412 3456,
 * 233244123456 and 00233244123456 all become 233244123456. Other countries are
 * accepted when they already carry their country code. Returns null if unusable.
 */
export function normalizePhone(input: string): string | null {
  let d = (input ?? "").replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (!/^\d+$/.test(d)) return null;

  if (d.startsWith("233")) return d.length === 12 ? d : null;
  if (d.startsWith("0")) return d.length === 10 ? "233" + d.slice(1) : null; // local Ghana format
  if (d.length === 9) return "233" + d; // Ghana without the leading zero
  return d.length >= 11 && d.length <= 15 ? d : null; // another country, code included
}

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f"; // each of these takes two characters

export interface SegmentInfo {
  encoding: "GSM-7" | "UCS-2";
  /** Characters counted against the limit (extended characters count twice). */
  length: number;
  segments: number;
}

/** How many SMS parts a message will be billed as. */
export function countSegments(text: string): SegmentInfo {
  let units = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) units += 1;
    else if (GSM_EXTENDED.includes(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    return { encoding: "GSM-7", length: units, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153) };
  }
  const length = [...text].reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  return { encoding: "UCS-2", length, segments: length === 0 ? 0 : length <= 70 ? 1 : Math.ceil(length / 67) };
}

/** Fill {placeholders}. Unknown names stay as typed so a typo is visible, not silently dropped. */
export function render(template: string, vars: Partial<Record<Placeholder, string>>): string {
  return template
    .replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? (vars[name as Placeholder] ?? "") : whole))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/** 1234.5 becomes "GHS 1,234.50". */
export function formatMoney(amount: number): string {
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, cents] = fixed.split(".");
  return `${amount < 0 ? "-" : ""}GHS ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

/** Split a pasted list of numbers (commas, spaces, new lines) into usable and unusable ones. */
export function parseNumberList(raw: string): { valid: string[]; invalid: string[]; duplicates: number } {
  const valid = new Set<string>();
  const invalid: string[] = [];
  let duplicates = 0;
  for (const token of (raw ?? "").split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean)) {
    const n = normalizePhone(token);
    if (!n) invalid.push(token);
    else if (valid.has(n)) duplicates++;
    else valid.add(n);
  }
  return { valid: [...valid], invalid, duplicates };
}
