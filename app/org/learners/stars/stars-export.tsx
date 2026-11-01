"use client";

export interface StarsExportRow {
  rank: number;
  name: string;
  role: string;
  total: number;
  gain: number;
  courses: number;
  last: string;
}

function cell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The leaderboard as a spreadsheet, the same columns in the same order. */
export function StarsExport({ rows, filename, period }: { rows: StarsExportRow[]; filename: string; period: string }) {
  function download() {
    const header = `rank,name,role,stars,earned ${period},courses passed,last star`;
    const body = rows.map((r) => [r.rank, r.name, r.role, r.total, r.gain, r.courses, r.last].map(cell).join(",")).join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={rows.length === 0}
      className="inline-flex h-11 items-center rounded-xl border bg-card px-4 text-[15px] font-bold transition-colors hover:bg-muted disabled:opacity-50"
    >
      Export
    </button>
  );
}
