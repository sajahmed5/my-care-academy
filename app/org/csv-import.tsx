"use client";

import { useActionState, useState } from "react";
import { xlsxToCsv } from "@/lib/xlsx";
import { Button } from "@/components/ui/button";
import { bulkInviteStaffAction, type BulkState } from "./actions";

interface Row {
  name: string;
  email: string;
  role: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Split one CSV line respecting quoted fields ("Smith, Jo" stays one cell).
 * Handles both comma and semicolon delimiters (Excel exports semicolons in
 * some locales).
 */
function splitLine(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

/** Header names people actually use, mapped to our three columns. */
const HEADER_ALIASES: Record<keyof Row, string[]> = {
  name: ["name", "full name", "fullname", "staff name", "employee name"],
  email: ["email", "email address", "e-mail", "e-mail address", "mail"],
  role: ["role", "type", "user role", "account type"],
};

function matchHeader(cols: string[], key: keyof Row): number {
  return cols.findIndex((c) => HEADER_ALIASES[key].includes(c));
}

export function parseCsv(text: string): { rows: Row[]; problem?: string } {
  // Strip a UTF-8 BOM (Excel adds one) so the first header matches.
  const clean = text.replace(/^﻿/, "");
  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], problem: "The file is empty." };

  // Excel in some locales exports semicolon-separated "CSV".
  const delim =
    lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";

  let idx = { name: 0, email: 1, role: 2 };
  let start = 0;
  const first = splitLine(lines[0], delim).map((c) => c.toLowerCase());
  const looksLikeHeader = first.some((c) =>
    HEADER_ALIASES.email.includes(c) || HEADER_ALIASES.name.includes(c),
  );
  if (looksLikeHeader) {
    idx = {
      name: matchHeader(first, "name"),
      email: matchHeader(first, "email"),
      role: matchHeader(first, "role"),
    };
    if (idx.email < 0) {
      return {
        rows: [],
        problem:
          "Couldn't find an email column. Use headers: name, email, role.",
      };
    }
    start = 1;
  }

  const rows: Row[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitLine(lines[i], delim);
    const email = (idx.email >= 0 ? cells[idx.email] : cells[1]) ?? "";
    if (!email) continue;
    rows.push({
      name: (idx.name >= 0 ? cells[idx.name] : cells[0]) ?? "",
      email: email.toLowerCase(),
      role:
        ((idx.role >= 0 ? cells[idx.role] : cells[2]) || "learner").toLowerCase(),
    });
  }
  if (rows.length === 0) {
    return { rows: [], problem: "No rows with an email address were found." };
  }
  return { rows };
}

export function CsvImport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    bulkInviteStaffAction,
    {} as BulkState,
  );

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
      const { rows: parsed, problem: parseProblem } = parseCsv(text);
      setRows(parsed);
      setFileProblem(parseProblem ?? null);
    });
  }

  const invalid = rows.filter(
    (r) =>
      !EMAIL_RE.test(r.email) || r.role !== "learner",
  );

  function downloadTemplate() {
    const csv =
      "name,email,role\r\nJane Smith,jane.smith@example.com,learner\r\nSam Jones,sam.jones@example.com,org_admin\r\n";
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "staff-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Download the template, fill in one row per person, then upload it
        here as a CSV or an Excel file. Each person is emailed an invite. The
        role column takes <code>learner</code> (leave it blank for this) or{" "}
        <code>org_admin</code> for someone who manages training.
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

      {fileProblem && (
        <p className="text-sm text-destructive">{fileProblem}</p>
      )}

      {rows.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1 font-medium">Name</th>
                <th className="px-2 py-1 font-medium">Email</th>
                <th className="px-2 py-1 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const bad =
                  !EMAIL_RE.test(r.email) ||
                  r.role !== "learner";
                return (
                  <tr
                    key={`${r.email}-${i}`}
                    className={`border-b last:border-0 ${bad ? "text-destructive" : ""}`}
                  >
                    <td className="px-2 py-1">{r.name || "—"}</td>
                    <td className="px-2 py-1">{r.email}</td>
                    <td className="px-2 py-1">{r.role}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {rows.length} row(s) ready
          {invalid.length > 0
            ? ` — ${invalid.length} highlighted in red will be skipped or fail (check the email/role)`
            : ""}
          . Check the preview, then send the invites.
        </p>
      )}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending || rows.length === 0}>
          {pending
            ? "Importing…"
            : rows.length > 0
              ? `Invite ${rows.length} staff`
              : "Invite staff"}
        </Button>

        {state.error && (
          <span className="text-sm text-destructive">{state.error}</span>
        )}
        {state.ok && (
          <span className="text-sm text-green-700 dark:text-green-500">
            {state.created} invited
            {state.failures && state.failures.length > 0
              ? `, ${state.failures.length} failed`
              : ""}
            .
          </span>
        )}
      </div>

      {state.failures && state.failures.length > 0 && (
        <ul className="text-xs text-destructive">
          {state.failures.map((f) => (
            <li key={f.email}>
              {f.email}: {f.error}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
