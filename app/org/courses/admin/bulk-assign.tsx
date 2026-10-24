"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { XlsxResult } from "@/lib/xlsx";
import { parseAssignCsv, type AssignCsvRow } from "@/lib/assign";
import { bulkAssignTrainingAction, type BulkAssignState } from "../../actions";

/**
 * lib/xlsx pulls in JSZip (~50 KB), which only an uploaded Excel file needs —
 * so it is fetched when one is chosen, not with the page.
 */
async function xlsxToCsv(data: ArrayBuffer): Promise<XlsxResult> {
  let xlsx: typeof import("@/lib/xlsx");
  try {
    xlsx = await import("@/lib/xlsx");
  } catch {
    // The chunk itself failed to download (signal dropped).
    return {
      problem: "That file couldn't be read. Check your connection and try again.",
    };
  }
  return xlsx.xlsxToCsv(data);
}

/**
 * Assign courses to staff in bulk from a spreadsheet (email, course, due
 * date). Takes .csv or .xlsx — managers kept uploading Excel files and being
 * told to go and convert them.
 *
 * `courseTitles` are this organisation's real course names: the template used
 * to contain invented examples, so copying its format produced a file where
 * every row failed, and a typo was only caught after upload.
 */
export function BulkAssign({ courseTitles = [] }: { courseTitles?: string[] }) {
  const [rows, setRows] = useState<AssignCsvRow[]>([]);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    bulkAssignTrainingAction,
    {} as BulkAssignState,
  );

  function downloadTemplate() {
    // Real course titles, so the example rows are ones that will actually work.
    const examples = courseTitles.slice(0, 2);
    const [first = "Fire Safety", second = "Safeguarding Adults Level 2"] = examples;
    const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv =
      "email,course,due date\r\n" +
      `jane.smith@example.com,${csvCell(first)},31/08/2026\r\n` +
      `jane.smith@example.com,${csvCell(second)},\r\n`;
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk-assign-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Read a .csv, or the first sheet of an .xlsx, into rows. */
  async function readFile(file: File): Promise<{ text?: string; problem?: string }> {
    const isExcel =
      /\.xlsx$/i.test(file.name) ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (isExcel) {
      const sheet = await xlsxToCsv(await file.arrayBuffer());
      return { text: sheet.csv, problem: sheet.problem };
    }
    if (/\.xls$/i.test(file.name)) {
      return {
        problem:
          "That's an old Excel file (.xls). In Excel choose File → Save As and pick .xlsx or .csv.",
      };
    }
    const text = await file.text();
    // A zip header means an Excel file wearing a .csv name.
    if (text.startsWith("PK")) {
      const r = await xlsxToCsv(await file.arrayBuffer());
      return { text: r.csv, problem: r.problem };
    }
    return { text };
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setRows([]);
    setFileProblem(null);
    if (!file) return;
    readFile(file).then(({ text, problem }) => {
      if (problem || text === undefined) {
        setFileProblem(problem ?? "That file couldn't be read.");
        return;
      }
      const { rows: parsed, problem: parseProblem } = parseAssignCsv(text);
      // Catch a mistyped course here rather than after the upload.
      const known = new Set(courseTitles.map((t) => t.toLowerCase()));
      setRows(
        known.size === 0
          ? parsed
          : parsed.map((r) =>
              r.problem || !r.course || known.has(r.course.toLowerCase())
                ? r
                : { ...r, problem: `No course called "${r.course}"` },
            ),
      );
      setFileProblem(parseProblem ?? null);
    });
  }

  const bad = rows.filter((r) => r.problem);

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        One row per person per course: <code>email, course, due date</code>.
        Upload a CSV or an Excel file. The course must match its title
        exactly — the template has your own course names in it — and a blank
        due date means the end of this month.
      </p>

      <button
        type="button"
        onClick={downloadTemplate}
        className="inline-flex min-h-11 items-center rounded-lg border px-3 py-1 text-sm font-medium transition-colors hover:bg-accent sm:min-h-0"
      >
        Download template (CSV)
      </button>

      <input
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={onFile}
        className="block text-sm"
      />
      <input type="hidden" name="rows" value={JSON.stringify(rows)} />

      {fileProblem && <p className="text-sm text-destructive">{fileProblem}</p>}

      {rows.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1 font-medium">Email</th>
                <th className="px-2 py-1 font-medium">Course</th>
                <th className="px-2 py-1 font-medium">Due date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.email}-${r.course}-${i}`}
                  className={`border-b last:border-0 ${r.problem ? "text-destructive" : ""}`}
                >
                  <td className="px-2 py-1">{r.email || "—"}</td>
                  <td className="px-2 py-1">{r.course || "—"}</td>
                  <td className="px-2 py-1">
                    {r.problem ?? r.dueDate ?? "end of month"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {rows.length} assignment(s) ready
          {bad.length > 0 ? ` — ${bad.length} highlighted in red will be skipped` : ""}
          .
        </p>
      )}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending || rows.length === 0}>
          {pending
            ? "Assigning…"
            : rows.length > 0
              ? `Assign ${rows.length} course(s)`
              : "Assign courses"}
        </Button>
        {state.error && (
          <span className="text-sm text-destructive">{state.error}</span>
        )}
        {state.ok && (
          <span className="text-sm text-green-700 dark:text-green-500">
            {state.assigned} assigned
            {state.failures && state.failures.length > 0
              ? `, ${state.failures.length} failed`
              : ""}
            .
          </span>
        )}
      </div>

      {state.failures && state.failures.length > 0 && (
        <ul className="text-xs text-destructive">
          {state.failures.map((f, i) => (
            <li key={`${f.line}-${i}`}>
              {f.line}: {f.error}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
