"use client";

import { useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { importStudents, type ImportRow } from "@/lib/students";
import { IMPORT_FIELDS, guessMapping, hasName, looksLikeFullNames, readStudentFile, splitName, type ImportField, type Sheet } from "@/lib/studentImport";
import { cn } from "@/lib/format";
import type { Notify } from "../PortalApp";

const input = "h-9 w-full rounded-lg border border-line px-2 text-sm outline-none focus:border-brand";

/**
 * With whole names in one column there is no surname column, so whatever was taken
 * for one is something else — usually the course, which is the next thing a printed
 * register puts beside a name.
 */
function releaseLastName(map: Record<ImportField, number>): Record<ImportField, number> {
  if (map.lastName < 0) return map;
  const freed = map.lastName;
  return { ...map, lastName: -1, course: map.course < 0 ? freed : map.course };
}

/**
 * Bringing a register in from a spreadsheet or a PDF.
 *
 * The file is read here in the browser, then shown as a table with a dropdown over
 * each column saying what it is. Nothing reaches the server until someone has
 * looked at that table — a misread PDF should waste a moment, not fill the
 * register with rubbish.
 */
export default function StudentImport({ onClose, notify }: { onClose: () => void; notify: Notify }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [map, setMap] = useState<Record<ImportField, number>>();
  /** One cell holding a whole name: split it on the way in. */
  const [oneNameColumn, setOneNameColumn] = useState(false);
  /** A register often lists one student once per course. Those are one student. */
  const [skipRepeats, setSkipRepeats] = useState(true);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ created: number; skipped: number; problems: string[] } | null>(null);

  const pick = async (file: File) => {
    setReading(true);
    setError("");
    try {
      const read = await readStudentFile(file);
      const guess = guessMapping(read);
      setSheet(read);
      setMap(guess);
      // A single column of "CHIKA LEONARD UWAKWE" is a whole name, not a first name.
      const whole = guess.firstName >= 0 && looksLikeFullNames(read.rows.map((r) => r[guess.firstName] ?? ""));
      if (whole) setMap(releaseLastName(guess));
      setOneNameColumn(whole);
      setSkipRepeats(true);
    } catch (e) {
      setError(errorMessage(e));
      setSheet(null);
    } finally {
      setReading(false);
    }
  };

  const width = sheet ? Math.max(...sheet.rows.map((r) => r.length), sheet.headers.length) : 0;

  /** The rows as they will be sent, with the mapping applied. */
  const prepared: (ImportRow & { asWritten: string })[] = !sheet || !map
    ? []
    : sheet.rows
        .map((row) => {
          const at = (field: ImportField) => (map[field] >= 0 ? (row[map[field]] ?? "").trim() : "");
          let firstName = at("firstName");
          let lastName = at("lastName");
          // Kept as written, so two people are not taken for one just because the
          // bit between their names was dropped.
          const asWritten = (oneNameColumn ? firstName : `${firstName} ${lastName}`).trim();
          if (oneNameColumn) [firstName, lastName] = splitName(firstName);
          return {
            asWritten,
            firstName,
            lastName,
            studentId: at("studentId"),
            phone: at("phone"),
            email: at("email"),
            course: at("course"),
            batch: at("batch"),
          };
        })
        // Both halves have to read as a name. A fee sheet's "2,600,000" is a row of
        // the same table, and it is not a student.
        .filter((r) => hasName(r.firstName) && hasName(r.lastName));

  // The same person on two courses is one student, so by default only the first
  // line for a name is kept — and the server would skip the rest anyway.
  const seen = new Set<string>();
  const repeats: ImportRow[] = [];
  const unique = prepared.filter((row) => {
    const key = row.asWritten.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) {
      repeats.push(row);
      return false;
    }
    seen.add(key);
    return true;
  });
  const sending = skipRepeats ? unique : prepared;

  // Written differently but the same two names once middle names are dropped —
  // "HENRY ESOGA PROSPER" and "HENRY PROSPER". The server treats those as one
  // person, so say so here rather than letting the number quietly shrink.
  const pairs = new Set<string>();
  const sameTwoNames = sending.filter((row) => {
    const key = [row.firstName, row.lastName].map((v) => v.toLowerCase().replace(/[^a-z]/g, "")).sort().join("|");
    if (pairs.has(key)) return true;
    pairs.add(key);
    return false;
  }).length;
  const unusable = sheet ? sheet.rows.length - prepared.length : 0;

  const send = async () => {
    if (busy || sending.length === 0) return;
    setBusy(true);
    try {
      const result = await importStudents(sending);
      setDone(result);
      notify(
        result.created > 0
          ? `${result.created} ${result.created === 1 ? "student" : "students"} added to the register.`
          : "Nothing new to add — they are all on the register already.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/70 p-4 backdrop-blur-sm" role="dialog" aria-label="Import students">
      <div className="my-6 w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line p-5">
          <FileSpreadsheet className="size-5 text-brand" />
          <div className="flex-1">
            <p className="font-display font-bold text-navy">Import students</p>
            <p className="text-xs text-muted">From Excel, CSV or a PDF list. Nobody already on the register is added twice.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="cursor-pointer rounded-lg p-1.5 text-muted hover:bg-mist hover:text-navy">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5">
          {error && (
            <p className="mb-4 flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          {done ? (
            <div className="py-6 text-center">
              <Check className="mx-auto size-10 text-teal" />
              <p className="mt-3 font-display text-xl font-bold text-navy">
                {done.created} added{done.skipped > 0 ? `, ${done.skipped} already there` : ""}
              </p>
              <p className="mt-1 text-sm text-muted">Everyone imported starts as not cleared. Clear them when they have settled up.</p>
              {done.problems.length > 0 && (
                <ul className="mx-auto mt-4 max-w-md space-y-1 rounded-xl bg-mist p-3 text-left text-xs text-muted">
                  {done.problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
              <button onClick={onClose} className="mt-5 cursor-pointer rounded-xl bg-navy px-5 py-2.5 text-sm font-bold text-white">
                Done
              </button>
            </div>
          ) : !sheet ? (
            <>
              <label
                htmlFor="student-import-file"
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-6 py-12 text-center hover:border-brand",
                  reading && "opacity-60",
                )}
              >
                {reading ? <Loader2 className="size-8 animate-spin text-brand" /> : <Upload className="size-8 text-brand" />}
                <span className="font-display font-bold text-navy">{reading ? "Reading the file…" : "Choose a file"}</span>
                <span className="text-xs text-muted">Excel (.xlsx, .xls), CSV, or PDF</span>
              </label>
              <input
                id="student-import-file"
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void pick(file);
                  e.target.value = "";
                }}
              />
              <div className="mt-4 rounded-xl bg-mist p-4 text-xs text-muted">
                <p className="font-bold text-navy">What the file needs</p>
                <p className="mt-1">
                  A column of first names and a column of last names. Everything else — Student ID, phone, email, course, class — is
                  optional, and you say which column is which on the next screen. If names are in one column (&ldquo;Adewunmi
                  Emmanuel&rdquo;) there is a tick for that.
                </p>
                <p className="mt-2">A Student ID is made up for anyone who has not got one.</p>
              </div>
            </>
          ) : (
            <>
              {sheet.note && <p className="mb-3 rounded-xl bg-brand-soft p-3 text-xs font-semibold text-brand-700">{sheet.note}</p>}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">
                  <span className="font-bold text-navy">{sheet.rows.length}</span> rows read. Say which column is which:
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-navy">
                    <input
                      type="checkbox"
                      checked={oneNameColumn}
                      onChange={(e) => {
                        setOneNameColumn(e.target.checked);
                        if (e.target.checked) setMap((current) => (current ? releaseLastName(current) : current));
                      }}
                    />
                    Full name is in one column
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-navy">
                    <input type="checkbox" checked={skipRepeats} onChange={(e) => setSkipRepeats(e.target.checked)} />
                    One row per student
                  </label>
                </div>
              </div>

              <div className="table-scroll mt-3 max-h-80 overflow-auto rounded-xl border border-line">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr>
                      {Array.from({ length: width }, (_, i) => (
                        <th key={i} className="border-b border-line p-2 text-left align-top">
                          <select
                            value={Object.entries(map ?? {}).find(([, col]) => col === i)?.[0] ?? ""}
                            onChange={(e) => {
                              const chosen = e.target.value as ImportField | "";
                              setMap((current) => {
                                const next = { ...(current as Record<ImportField, number>) };
                                for (const key of Object.keys(next) as ImportField[]) if (next[key] === i) next[key] = -1;
                                if (chosen) next[chosen] = i;
                                return next;
                              });
                            }}
                            aria-label={`What is in column ${i + 1}`}
                            className={input}
                          >
                            <option value="">Ignore this column</option>
                            {IMPORT_FIELDS.map((f) => (
                              <option key={f.key} value={f.key}>
                                {oneNameColumn && f.key === "firstName" ? "Full name" : f.label}
                                {f.required && !(oneNameColumn && f.key === "lastName") ? " *" : ""}
                              </option>
                            ))}
                          </select>
                          {sheet.headers[i] && <span className="mt-1 block text-[11px] font-normal text-muted">{sheet.headers[i]}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.rows.slice(0, 50).map((row, r) => (
                      <tr key={r} className="border-t border-line">
                        {Array.from({ length: width }, (_, c) => (
                          <td key={c} className="whitespace-nowrap p-2 text-muted">
                            {row[c] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sheet.rows.length > 50 && <p className="mt-1 text-xs text-muted">Showing the first 50 of {sheet.rows.length} rows.</p>}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void send()}
                  disabled={busy || sending.length === 0}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {busy ? "Importing…" : `Import ${sending.length} ${sending.length === 1 ? "student" : "students"}`}
                </button>
                <button onClick={() => setSheet(null)} className="cursor-pointer rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-navy">
                  Choose another file
                </button>
                <p className="text-xs text-muted">
                  {repeats.length > 0 && skipRepeats && (
                    <span className="block">
                      {repeats.length} {repeats.length === 1 ? "row is" : "rows are"} the same name again — a student on two courses is
                      still one student. Untick &ldquo;one row per student&rdquo; to bring them all in.
                    </span>
                  )}
                  {sameTwoNames > 0 && (
                    <span className="block">
                      {sameTwoNames} more share a first and last name with someone else once middle names are dropped, so about{" "}
                      <span className="font-bold text-navy">{sending.length - sameTwoNames}</span> will actually be added.
                    </span>
                  )}
                  {unusable > 0 && (
                    <span className="block">
                      {unusable} {unusable === 1 ? "row has" : "rows have"} no usable name and will be left out.
                    </span>
                  )}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
