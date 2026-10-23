import { Card, CardContent } from "@/components/ui/card";
import type { AcceptanceSummary } from "@/lib/policy-library";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Who has accepted this version, and who has not.
 *
 * The number an inspector asks for is the outstanding one, so it leads.
 * Someone who accepted an older version is outstanding: a revision is a new
 * document as far as the reader is concerned, and their old acceptance is
 * shown for what it is — true about the old text.
 */
export function AcceptancePanel({
  summary,
  version,
}: {
  summary: AcceptanceSummary;
  version: number;
}) {
  const { accepted, outstanding, total } = summary;
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Who has accepted version {version}</h3>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{accepted.length}</span> of {total}{" "}
            active staff
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Still to accept ({outstanding.length})
          </p>
          {outstanding.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody — everyone has accepted.</p>
          ) : (
            <ul className="divide-y text-sm">
              {outstanding.map((p) => (
                <li key={p.user_id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    {p.name}
                    {p.role === "org_admin" && (
                      <span className="ml-2 text-xs text-muted-foreground">admin</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.version != null
                      ? `accepted version ${p.version} on ${fmtDate(p.acknowledged_at)}`
                      : "not yet"}
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
                <li key={p.user_id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(p.acknowledged_at)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
