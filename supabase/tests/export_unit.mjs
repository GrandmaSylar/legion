// Unit tests for the table download helpers (CSV text and formula safety). No network.
// Run: node supabase/tests/export_unit.mjs   (Node 22.6+ strips the types)
import { tableToCsv } from "../../src/lib/export/tableExport.ts";

let fails = 0;
const eq = (label, got, want) => {
  if (got !== want) { fails++; console.log(`FAIL ${label}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};
const t = (rows) => ({ title: "t", filename: "t", columns: ["A", "B"], rows });

eq("plain", tableToCsv(t([["x", 1]])), "A,B\r\nx,1");
eq("comma and quote", tableToCsv(t([['a,"b"', "c"]])), 'A,B\r\n"a,""b""",c');
eq("newline", tableToCsv(t([["a\nb", "c"]])), 'A,B\r\n"a\nb",c');
eq("empty and null", tableToCsv(t([[null, undefined]])), "A,B\r\n,");
eq("formula =", tableToCsv(t([["=1+1", "x"]])), "A,B\r\n'=1+1,x");
eq("formula @", tableToCsv(t([["@SUM(A1)", "x"]])), "A,B\r\n'@SUM(A1),x");
eq("formula +cmd", tableToCsv(t([["+cmd|calc", "x"]])), "A,B\r\n'+cmd|calc,x");
eq("negative number text kept", tableToCsv(t([["-12.50", "x"]])), "A,B\r\n-12.50,x");
eq("phone with plus kept as text safely", tableToCsv(t([["+233201234567", "x"]])), "A,B\r\n+233201234567,x");
console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
