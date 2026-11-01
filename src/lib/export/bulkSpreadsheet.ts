import * as XLSX from "xlsx";
import type { BulkStudentRowInput } from "../data/students";
import type { BulkStaffRowInput } from "../data/staff";

function normKey(k: string): string {
  return k
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function getVal(row: Record<string, unknown>, aliases: string[]): string {
  for (const [k, v] of Object.entries(row)) {
    if (aliases.includes(normKey(k))) {
      if (v === null || v === undefined) return "";
      return String(v).trim();
    }
  }
  return "";
}

function normalizeDateString(raw: string): string {
  if (!raw) return "";
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
}

export async function parseStudentSpreadsheet(
  file: File,
): Promise<BulkStudentRowInput[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false,
  });

  const parsed: BulkStudentRowInput[] = [];
  for (const r of rawRows) {
    let firstName = getVal(r, [
      "firstname",
      "first",
      "givenname",
      "pupilsfirstname",
    ]);
    let middleName = getVal(r, ["middlename", "middle", "othername", "othernames"]);
    let lastName = getVal(r, ["lastname", "surname", "familyname", "last"]);

    // Support single "Full Name" / "Name" column if First/Last weren't split
    if (!firstName && !lastName) {
      const full = getVal(r, ["fullname", "studentname", "pupilname", "name"]);
      if (full) {
        const parts = full.split(/\s+/);
        if (parts.length === 1) {
          firstName = parts[0];
          lastName = parts[0];
        } else if (parts.length === 2) {
          firstName = parts[0];
          lastName = parts[1];
        } else {
          firstName = parts[0];
          lastName = parts[parts.length - 1];
          middleName = parts.slice(1, -1).join(" ");
        }
      }
    }

    if (!firstName || !lastName) continue;

    const rawGender = getVal(r, ["gender", "sex"]).toLowerCase();
    const gender: "female" | "male" | "" =
      rawGender.startsWith("f") || rawGender === "girl"
        ? "female"
        : rawGender.startsWith("m") || rawGender === "boy"
          ? "male"
          : "";

    parsed.push({
      firstName,
      middleName,
      lastName,
      dateOfBirth: normalizeDateString(
        getVal(r, ["dateofbirth", "dob", "birthdate", "birthday"]),
      ),
      gender,
      admittedOn: normalizeDateString(
        getVal(r, ["admittedon", "admissiondate", "dateadmitted"]),
      ),
      residenceAddress: getVal(r, [
        "residenceaddress",
        "address",
        "homeaddress",
        "location",
      ]),
      guardianName: getVal(r, [
        "guardianname",
        "parentname",
        "guardian",
        "parent",
        "mothername",
        "fathername",
      ]),
      guardianPhone: getVal(r, [
        "guardianphone",
        "parentphone",
        "phone",
        "telephone",
        "mobile",
        "contact",
      ]),
      guardianRelationship:
        getVal(r, ["guardianrelationship", "relationship", "relation"]) ||
        "Guardian",
      guardianEmail: getVal(r, ["guardianemail", "parentemail", "email"]),
    });
  }

  return parsed;
}

export function downloadStudentImportTemplate(format: "csv" | "xlsx"): void {
  const sample = [
    {
      "First Name": "Ama",
      "Middle Name": "Serwaa",
      "Last Name": "Mensah",
      "Gender (female/male)": "female",
      "Date of Birth (YYYY-MM-DD)": "2015-04-12",
      "Residence Address": "East Legon, Accra",
      "Guardian Name": "Kofi Mensah",
      "Guardian Phone": "0244000001",
      "Guardian Relationship": "Father",
      "Guardian Email": "kofi.mensah@example.com",
    },
    {
      "First Name": "Kwame",
      "Middle Name": "",
      "Last Name": "Boateng",
      "Gender (female/male)": "male",
      "Date of Birth (YYYY-MM-DD)": "2014-11-23",
      "Residence Address": "Adenta, Accra",
      "Guardian Name": "Abena Boateng",
      "Guardian Phone": "0208000002",
      "Guardian Relationship": "Mother",
      "Guardian Email": "abena.boateng@example.com",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sample);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students Import Template");

  if (format === "csv") {
    const csv = "\uFEFF" + XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students-bulk-import-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } else {
    XLSX.writeFile(wb, "students-bulk-import-template.xlsx");
  }
}

export async function parseStaffSpreadsheet(
  file: File,
): Promise<BulkStaffRowInput[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false,
  });

  const parsed: BulkStaffRowInput[] = [];
  for (const r of rawRows) {
    let fullName = getVal(r, ["fullname", "name", "staffname", "teachername"]);
    if (!fullName) {
      const first = getVal(r, ["firstname", "first"]);
      const last = getVal(r, ["lastname", "surname", "last"]);
      fullName = [first, last].filter(Boolean).join(" ");
    }
    if (!fullName) continue;

    const rawType = getVal(r, ["category", "type", "stafftype", "department"]).toLowerCase();
    const type =
      rawType.includes("non") || rawType.includes("support") || rawType.includes("admin")
        ? "non_teaching"
        : "teaching";

    parsed.push({
      fullName,
      type,
      roleTitle: getVal(r, ["roletitle", "role", "jobtitle", "title", "position"]),
      phone: getVal(r, ["phone", "telephone", "mobile", "contact"]),
      email: getVal(r, ["email", "emailaddress"]),
      hiredOn: normalizeDateString(getVal(r, ["hiredon", "hiredate", "datehired", "startdate"])),
    });
  }

  return parsed;
}

export function downloadStaffImportTemplate(format: "csv" | "xlsx"): void {
  const sample = [
    {
      "Full Name": "Grace Owusu",
      "Category (teaching/non_teaching)": "teaching",
      "Role / Job Title": "Mathematics Teacher",
      Phone: "0244111222",
      Email: "grace.owusu@example.com",
      "Hired On (YYYY-MM-DD)": "2024-09-01",
    },
    {
      "Full Name": "Samuel Tetteh",
      "Category (teaching/non_teaching)": "non_teaching",
      "Role / Job Title": "School Bursar",
      Phone: "0208333444",
      Email: "samuel.tetteh@example.com",
      "Hired On (YYYY-MM-DD)": "2025-01-15",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sample);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Staff Import Template");

  if (format === "csv") {
    const csv = "\uFEFF" + XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "staff-bulk-import-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } else {
    XLSX.writeFile(wb, "staff-bulk-import-template.xlsx");
  }
}

