"use client";

import { Button } from "@/components/ui/button";
import type { FormField } from "@/lib/forms";
import { getSubmissionFileUrlAction } from "../../actions";
import { formatDateTime } from "@/lib/dates";

interface Submission {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
}

function cellText(field: FormField, value: unknown): string {
  if (value === undefined || value === null) return "";
  if (field.type === "signature") return value ? "✓ signed" : "";
  if (field.type === "file")
    return (value as { name?: string })?.name ?? "file";
  if (Array.isArray(value)) return value.join("; ");
  return String(value);
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function SubmissionsTable({
  fields,
  submissions,
}: {
  fields: FormField[];
  submissions: Submission[];
}) {
  function exportCsv() {
    const header = ["Submitted", ...fields.map((f) => f.label)];
    const lines = submissions.map((s) => [
      formatDateTime(s.created_at),
      ...fields.map((f) => cellText(f, s.data[f.id])),
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((c) => csvCell(String(c))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "submissions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function openFile(value: unknown) {
    const path = (value as { file?: string })?.file;
    if (!path) return;
    const { url } = await getSubmissionFileUrlAction(path);
    if (url) window.open(url, "_blank");
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={submissions.length === 0}>
          Export CSV
        </Button>
      </div>

      {submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No submissions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Submitted</th>
                {fields.map((f) => (
                  <th key={f.id} className="py-2 pr-4 font-medium">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                    {formatDateTime(s.created_at)}
                  </td>
                  {fields.map((f) => (
                    <td key={f.id} className="py-2 pr-4">
                      {f.type === "file" && s.data[f.id] ? (
                        <button
                          onClick={() => openFile(s.data[f.id])}
                          className="text-primary underline"
                        >
                          {cellText(f, s.data[f.id])}
                        </button>
                      ) : (
                        cellText(f, s.data[f.id])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
