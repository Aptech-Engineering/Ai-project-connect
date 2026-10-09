"use client";

/**
 * Reading a register out of a file, in the browser.
 *
 * A spreadsheet is a grid already, so it comes back as one. A PDF is not: its text
 * is a bag of positioned fragments, so they are grouped into lines by where they
 * sit on the page and split into columns by the gaps between them. That is a guess,
 * which is why nothing is imported until a person has looked at the table and said
 * which column is which.
 */

/** A file read into a grid, ready to be mapped onto student fields. */
export interface Sheet {
  /** The first row, if it looks like headings — used to guess the mapping. */
  headers: string[];
  rows: string[][];
  source: "sheet" | "pdf";
  /** Pages or sheets that yielded nothing, worth telling someone about. */
  note?: string;
}

export const IMPORT_FIELDS = [
  { key: "firstName", label: "First name", required: true, hints: ["first", "given", "forename"] },
  { key: "lastName", label: "Last name", required: true, hints: ["last", "surname", "family"] },
  { key: "studentId", label: "Student ID", required: false, hints: ["id", "student id", "reg", "matric", "number"] },
  { key: "phone", label: "Phone", required: false, hints: ["phone", "mobile", "tel", "gsm", "contact"] },
  { key: "email", label: "Email", required: false, hints: ["email", "e-mail", "mail"] },
  { key: "course", label: "Course", required: false, hints: ["course", "programme", "program", "track"] },
  { key: "batch", label: "Class or batch", required: false, hints: ["class", "batch", "group", "session"] },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

/** Does this row read like headings rather than a student? */
function looksLikeHeadings(row: string[]): boolean {
  const joined = row.join(" ").toLowerCase();
  const hits = IMPORT_FIELDS.filter((f) => f.hints.some((h) => joined.includes(h))).length;
  return hits >= 2;
}

/**
 * Takes the heading row out, along with anything above it.
 *
 * A printed register usually opens with a title — "Aptech Kaduna - Student Register"
 * — before the real headings, and a PDF hands those over as rows like any other. Left
 * in, the headings themselves get imported as a student called "First Name Surname".
 */
function liftHeadings(rows: string[][]): string[] {
  const at = rows.slice(0, 5).findIndex(looksLikeHeadings);
  if (at === -1) return [];
  const headers = rows[at];
  rows.splice(0, at + 1);
  return headers;
}

export async function readStudentFile(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return readPdf(file);
  return readSpreadsheet(file);
}

/** xlsx, xls, csv and tsv all come through SheetJS, so one path covers them. */
async function readSpreadsheet(file: File): Promise<Sheet> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const first = book.SheetNames[0];
  if (!first) throw new Error("That file has no sheets in it.");

  const grid = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[first], { header: 1, blankrows: false, defval: "" });
  const rows = grid.map((r) => (r as unknown[]).map(clean)).filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0) throw new Error("That sheet is empty.");

  const headers = liftHeadings(rows);
  return {
    headers,
    rows,
    source: "sheet",
    note: book.SheetNames.length > 1 ? `Read the first sheet, "${first}". The others were left alone.` : undefined,
  };
}

/**
 * PDF text, back into rows. Fragments on roughly the same baseline are one line;
 * a gap wider than a space starts a new column.
 */
async function readPdf(file: File): Promise<Sheet> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  const rows: string[][] = [];

  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    const lines = new Map<number, { x: number; text: string }[]>();

    for (const item of content.items) {
      if (!("str" in item) || item.str.trim() === "") continue;
      const x = item.transform[4] as number;
      const y = Math.round((item.transform[5] as number) / 4) * 4; // same baseline, give or take
      const line = lines.get(y) ?? [];
      line.push({ x, text: item.str });
      lines.set(y, line);
    }

    // Top of the page downwards.
    for (const y of [...lines.keys()].sort((a, b) => b - a)) {
      const parts = lines.get(y)!.sort((a, b) => a.x - b.x);
      const cells: string[] = [];
      let current = "";
      let endOfLast = -Infinity;
      for (const part of parts) {
        // A wide gap means a new column; a small one is just a space.
        if (current !== "" && part.x - endOfLast > 12) {
          cells.push(clean(current));
          current = "";
        }
        current += (current === "" ? "" : " ") + part.text;
        endOfLast = part.x + part.text.length * 5;
      }
      if (current !== "") cells.push(clean(current));
      if (cells.some((c) => c !== "")) rows.push(cells);
    }
  }

  // The worker holds the file open until the loading task lets it go.
  await task.destroy();
  if (rows.length === 0) {
    throw new Error("No text could be read from that PDF. If it is a scan, export the list as Excel or CSV instead.");
  }

  const headers = liftHeadings(rows);
  return {
    headers,
    rows,
    source: "pdf",
    note: "Read from a PDF, so the columns are a guess. Check the table below before importing.",
  };
}

/**
 * First go at which column is which: by heading where there is one, otherwise by
 * what the data looks like.
 */
export function guessMapping(sheet: Sheet): Record<ImportField, number> {
  const width = Math.max(...sheet.rows.map((r) => r.length), sheet.headers.length);
  const map = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, -1])) as Record<ImportField, number>;
  const taken = new Set<number>();

  // By heading.
  sheet.headers.forEach((head, i) => {
    const h = head.toLowerCase();
    for (const field of IMPORT_FIELDS) {
      if (map[field.key] === -1 && !taken.has(i) && field.hints.some((hint) => h.includes(hint))) {
        map[field.key] = i;
        taken.add(i);
        break;
      }
    }
  });

  // By what is in the column.
  const sample = sheet.rows.slice(0, 12);
  const column = (i: number) => sample.map((r) => r[i] ?? "").filter(Boolean);
  for (let i = 0; i < width; i++) {
    if (taken.has(i)) continue;
    const values = column(i);
    if (values.length === 0) continue;
    const most = (test: (v: string) => boolean) => values.filter(test).length / values.length > 0.6;

    if (map.email === -1 && most((v) => v.includes("@"))) {
      map.email = i;
    } else if (map.phone === -1 && most((v) => /^[+\d][\d\s()-]{6,}$/.test(v))) {
      map.phone = i;
    } else if (map.studentId === -1 && most((v) => /\d/.test(v) && /[/\-A-Za-z]/.test(v) && !v.includes(" "))) {
      map.studentId = i;
    } else {
      continue;
    }
    taken.add(i);
  }

  // Whatever is left, in order, for the names.
  const spare = Array.from({ length: width }, (_, i) => i).filter((i) => !taken.has(i));
  if (map.firstName === -1 && spare.length > 0) map.firstName = spare.shift()!;
  if (map.lastName === -1 && spare.length > 0) map.lastName = spare.shift()!;

  return map;
}

/** One name in one cell — "Adewunmi Emmanuel" — split for the two fields. */
export function splitName(value: string): [string, string] {
  const parts = value.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return ["", ""];
  if (parts.length === 1) return [parts[0], ""];
  return [parts[0], parts.slice(1).join(" ")];
}
