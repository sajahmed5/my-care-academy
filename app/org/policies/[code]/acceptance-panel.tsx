import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { roleLabel } from "@/lib/auth";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return formatDate(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export interface AcceptanceRow {
  userId: string;
  name: string;
  role: string;
  status: "accepted" | "outstanding" | "late";
  dueOn: string;
  acceptedVersion: number | null;
  acceptedAt: string | null;
}

/**
 * Who has accepted this version, and who has not — of the people it is for.
 *
 * The number an inspector asks for is the outstanding one, so it leads, late
 * first. Someone who accepted an older version is outstanding: a revision is
 * a new document as far as the reader is concerned, and their old acceptance
 * is shown for what it is — true about the old text.
 */
export function AcceptancePanel({
  rows,
  version,
  audienceLabel,
  days,
}: {
  rows: AcceptanceRow[];
  version: number;
  audienceLabel: string;
  days: number;
}) {
  const accepted = rows.filter((r) => r.status === "accepted");
  const outstanding = rows
    .filter((r) => r.status !== "accepted")
    .sort((a, b) => (a.status === b.status ? a.dueOn.localeCompare(b.dueOn) : a.status === "late" ? -1 : 1));
  const late = outstanding.filter((r) => r.status === "late").length;
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Who has accepted version {version}</h3>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{accepted.length}</span> of {rows.length}
            {late > 0 && <span className="ml-2 font-medium text-rose-700">{late} late</span>}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          For: {audienceLabel.toLowerCase()} · {days} days to accept, from publishing or the day they started. Change it under
          Settings → Policies.
        </p>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Still to accept ({outstanding.length})
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody in your company is in this policy&apos;s audience yet.</p>
          ) : outstanding.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody — everyone has accepted.</p>
          ) : (
            <ul className="divide-y text-sm">
              {outstanding.map((p) => (
                <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>
                    {p.name}
                    {p.role !== "learner" && <span className="ml-2 text-xs text-muted-foreground">{roleLabel(p.role).toLowerCase()}</span>}
                  </span>
                  <span className={`text-xs ${p.status === "late" ? "font-medium text-rose-700" : "text-muted-foreground"}`}>
                    {p.status === "late" ? `late — was due ${fmtDate(p.dueOn)}` : `by ${fmtDate(p.dueOn)}`}
                    {p.acceptedVersion != null && ` · accepted version ${p.acceptedVersion} on ${fmtDate(p.acceptedAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {accepted.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Accepted ({accepted.length})
            </summary>
            <ul className="mt-2 divide-y text-sm">
              {accepted.map((p) => (
                <li key={p.userId} className="flex items-center justify-between gap-2 py-1.5">
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(p.acceptedAt)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
