// Unit tests for the email helpers (address checking, header safety, the email body). No network.
// Run: node supabase/tests/email_unit.mjs   (Node 22.6+ strips the types)
import {
  buildEmail, cleanHeader, friendlyEmailError, fromHeader, normalizeEmail, parseEmailList,
} from "../functions/messaging/email.ts";

let fails = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fails++; console.log(`FAIL ${label}\n  got:  ${a}\n  want: ${b}`); } else console.log(`ok   ${label}`);
};

// addresses
eq("plain address", normalizeEmail("Parent@Example.com"), "parent@example.com");
eq("trims spaces", normalizeEmail("  a.b+c@school.edu.gh "), "a.b+c@school.edu.gh");
eq("no at sign", normalizeEmail("parent.example.com"), null);
eq("no domain dot", normalizeEmail("parent@localhost"), null);
eq("two addresses", normalizeEmail("a@b.com, c@d.com"), null);
eq("angle brackets", normalizeEmail("Name <a@b.com>"), null);
eq("header injection in address", normalizeEmail("a@b.com\r\nBcc: x@y.com"), null);
eq("double dot in domain", normalizeEmail("a@b..com"), null);
eq("empty", normalizeEmail(""), null);

// lists
eq("list with junk and duplicates", parseEmailList("a@b.com, A@B.com;c@d.org\nnope  e@f.gh"), {
  valid: ["a@b.com", "c@d.org", "e@f.gh"], invalid: ["nope"], duplicates: 1,
});

// headers
eq("subject loses line breaks", cleanHeader("Fees\r\nBcc: evil@x.com"), "Fees Bcc: evil@x.com");
eq("subject is capped", cleanHeader("x".repeat(400)).length, 150);
eq("from header", fromHeader("Pinks Academy", "notify@phinova.example"), "Pinks Academy via PhiNova <notify@phinova.example>");
eq("from header strips tricks", fromHeader('Evil" <bad@x.com>\r\nBcc: z', "notify@phinova.example"), "Evil badx.com Bcc z via PhiNova <notify@phinova.example>");
eq("from header with empty name", fromHeader("<>", "n@p.example"), "School via PhiNova <n@p.example>");

// body
const mail = buildEmail("Dear Ama,\nFees are due.\n\nThank you <script>alert(1)</script> & co.", "Pinks Academy", "office@pinks.edu.gh");
eq("html escapes the message", mail.html.includes("<script>"), false);
eq("html keeps the words", mail.html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; co."), true);
eq("html makes line breaks", mail.html.includes("Dear Ama,<br>Fees are due."), true);
eq("html makes paragraphs", (mail.html.match(/<p /g) ?? []).length, 3);
eq("text version says who sent it", mail.text.includes("Sent by Pinks Academy through PhiNova."), true);
eq("reply note appears with a reply address", mail.text.includes("Reply to this email"), true);
eq("no reply note without a reply address", buildEmail("Hi", "S", null).text.includes("Reply to this email"), false);

// provider errors
eq("bad key", friendlyEmailError(401, { message: "API key is invalid" }), "The email provider rejected the API key.");
eq("unverified domain", friendlyEmailError(403, { message: "The phinova.com domain is not verified." }), "The sending address is not verified with the email provider yet.");
eq("rate limit", friendlyEmailError(429, { message: "Too many requests" }), "The email provider's limit was reached. Try again later.");

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
