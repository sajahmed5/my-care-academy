import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { isUntriaged, kindLabel, statusLabel } from "@/lib/complaints/stages";
import { categoryLabel } from "@/lib/complaints/categories";
import type { ComplaintSummary } from "@/lib/complaints/data";
import type { NextStep } from "@/lib/complaints/steps";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  closed: "bg-green-100 text-green-700",
  withdrawn: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** One record in the list: what it is, where it has got to, what to do next. */
export function ComplaintRow({
  complaint,
  next,
  stepLabel,
}: {
  complaint: ComplaintSummary;
  next: NextStep;
  stepLabel: string | null;
}) {
  return (
    <Link href={`/org/complaints/${complaint.id}`} className="block">
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="space-y-2 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              <span className="font-mono text-xs text-muted-foreground">{complaint.reference}</span>{" "}
              · {kindLabel(complaint.kind)}
              {complaint.category ? ` · ${categoryLabel(complaint.category)}` : ""}
              {complaint.aboutName ? ` · ${complaint.aboutName}` : ""}
            </p>
            <div className="flex items-center gap-2 text-xs">
              {stepLabel && <span className="text-muted-foreground">{stepLabel}</span>}
              {isUntriaged(complaint.kind) && complaint.status === "open" && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-700">Waiting to be looked at</span>
              )}
              <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[complaint.status] ?? ""}`}>
                {statusLabel(complaint.status)}
              </span>
            </div>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{complaint.description}</p>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Reported {fmtDate(complaint.reportedOn)}
              {complaint.raisedByName ? ` by ${complaint.raisedByName}` : ""}
              {complaint.completeBy ? ` · response due ${fmtDate(complaint.completeBy)}` : ""}
            </span>
            <span className={next.late ? "font-medium text-rose-600" : ""}>{next.text}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
