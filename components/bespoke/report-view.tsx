import { formatValue, type SectionResult, type Value } from "@/lib/bespoke/run";
import type { ReportRun } from "@/lib/bespoke/load";

/**
 * A bespoke report on screen, live: each section's count per group as bars,
 * then its table. The same SectionResult the PDF and Excel are drawn from.
 */

function Table({ section, rows }: { section: SectionResult; rows: Value[][] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          {section.columns.map((c) => (
            <th key={c.key} className={`py-2 pr-3 font-medium ${c.type === "number" ? "text-right" : ""}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((v, j) => (
              <td key={j} className={`py-1.5 pr-3 align-top ${section.columns[j].type === "number" ? "text-right tabular-nums" : ""}`}>
                {formatValue(section.columns[j], v)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SectionView({ section }: { section: SectionResult }) {
  const max = Math.max(1, ...(section.summary ?? []).map((g) => g.count));
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">{section.title}</h2>
        <p className="text-xs text-muted-foreground">
          {section.basis}
          {!section.unavailable && ` · ${section.total} ${section.total === 1 ? "row" : "rows"}`}
        </p>
        {section.note && <p className="mt-1 text-sm text-muted-foreground">{section.note}</p>}
      </div>
      {section.unavailable ? (
        <p className="text-sm text-muted-foreground">Not included in your package.</p>
      ) : section.total === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to show.</p>
      ) : (
        <>
          {section.summary && (
            <ul className="space-y-1.5 text-sm">
              {section.summary.map((g) => (
                <li key={g.label} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="truncate">{g.label}</span>
                  {section.chart ? (
                    <span className="h-3 rounded-full bg-muted" aria-hidden="true">
                      <span className="block h-3 rounded-full bg-primary" style={{ width: `${(g.count / max) * 100}%` }} />
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="text-right tabular-nums text-muted-foreground">
                    {g.count} <span className="text-xs">({g.percent}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {section.showTable && (
            <div className="overflow-x-auto">
              {section.groups ? (
                <div className="space-y-4">
                  {section.groups.map((g) => (
                    <div key={g.label}>
                      <p className="flex justify-between rounded-md bg-muted/60 px-2 py-1 text-sm font-medium">
                        <span>{g.label}</span>
                        <span className="tabular-nums">{g.count}</span>
                      </p>
                      <Table section={section} rows={g.rows} />
                    </div>
                  ))}
                </div>
              ) : (
                <Table section={section} rows={section.rows} />
              )}
            </div>
          )}
          {section.truncated && section.showTable && (
            <p className="text-xs text-muted-foreground">
              Only the first rows are shown here. The Excel download has all {section.total}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function ReportView({ run }: { run: ReportRun }) {
  if (run.sections.length === 0) return <p className="text-sm text-muted-foreground">This report has no sections yet.</p>;
  return (
    <div className="space-y-4">
      {run.sections.map((s) => (
        <SectionView key={s.id} section={s} />
      ))}
    </div>
  );
}
