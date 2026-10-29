"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { funderLabel, parseClientsCsv, type ParsedClientRow } from "@/lib/clients";
import { importClientsAction } from "../actions";

/**
 * Upload a spreadsheet saved as CSV: read and checked here first, so the
 * manager sees every row and what's wrong with any of them before anything
 * is saved. A client already on the list (same name and date of birth) is
 * updated rather than added twice.
 */
export function ImportClients() {
  const [rows, setRows] = useState<ParsedClientRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const good = (rows ?? []).filter((r) => r.problems.length === 0);
  const bad = (rows ?? []).filter((r) => r.problems.length > 0);

  async function read(file: File | undefined) {
    setRows(null);
    setResult(null);
    setError(null);
    if (!file) return;
    const parsed = parseClientsCsv(await file.text());
    setProblem(parsed.problem ?? null);
    setRows(parsed.problem ? null : parsed.rows);
  }

  if (result) {
    return (
      <div role="status" className="flex max-w-2xl gap-3 rounded-2xl bg-accent p-5">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-semibold">
            {result.added} added{result.updated > 0 && `, ${result.updated} updated`}
            {result.skipped > 0 && `, ${result.skipped} left out`}.
          </p>
          <Link href="/org/clients" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
            See the client list
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Download the template and fill it in, one client a row. Only the name is needed; dates as 01/02/1940.
          </li>
          <li>Save it as CSV (in Excel: File, Save As, CSV UTF-8).</li>
          <li>Choose the file below, check what it found, then add them.</li>
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href="/org/clients/template" prefetch={false} className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Download className="size-4" aria-hidden="true" /> Download the template
          </Link>
          <label className="text-sm font-medium">
            <span className="sr-only">Choose your CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => read(e.target.files?.[0])}
              className="block text-sm file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:font-semibold file:text-primary-foreground"
            />
          </label>
        </div>
        {problem && (
          <p role="alert" className="mt-3 text-sm text-destructive">{problem}</p>
        )}
      </div>

      {rows && (
        <div className="space-y-3">
          <p className="text-sm">
            <strong>{good.length}</strong> client{good.length === 1 ? "" : "s"} ready to add
            {bad.length > 0 && (
              <>
                , <strong className="text-destructive">{bad.length}</strong> with something to fix (left out)
              </>
            )}
            .
          </p>
          <div className="max-h-[28rem] overflow-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2.5 font-semibold">Row</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Name</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Date of birth</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Region</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Funded by</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Medication</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-b last:border-0 align-top">
                    <td className="px-3 py-2.5 text-muted-foreground">{r.line}</td>
                    <td className="px-3 py-2.5">
                      {r.client.fullName || "—"}
                      {r.problems.length > 0 && (
                        <span className="block text-xs text-destructive">{r.problems.join(". ")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{r.client.dateOfBirth ?? "—"}</td>
                    <td className="px-3 py-2.5">{r.client.region ?? "—"}</td>
                    <td className="px-3 py-2.5">{funderLabel(r.client.funderType, r.client.funderName)}</td>
                    <td className="px-3 py-2.5">{r.client.medicationSupport ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
          <Button
            size="lg"
            disabled={pending || good.length === 0}
            onClick={() =>
              start(async () => {
                const r = await importClientsAction(good.map((g) => g.client));
                if (r.ok) setResult({ added: r.added ?? 0, updated: r.updated ?? 0, skipped: (r.skipped ?? 0) + bad.length });
                else setError(r.error ?? "The upload didn't work. Try again.");
              })
            }
          >
            {pending ? "Adding…" : `Add ${good.length} client${good.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
    </div>
  );
}
