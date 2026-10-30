import Link from "next/link";
import { FileDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { recordHref, type FormRecord } from "@/lib/form-records";
import { formatDate } from "@/lib/dates";
import { dueStatus } from "@/lib/records";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

const CHIP = {
  overdue: "bg-rose-100 text-rose-700",
  due_soon: "bg-amber-100 text-amber-700",
  scheduled: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
} as const;

/**
 * Completed client or company forms, newest first: what, about whom, who
 * filled it in and when, whether it was signed on the device, and the PDF.
 * The latest of each form carries its review date, red when it has passed;
 * an older one has been reviewed since and its date no longer counts.
 * `show` picks the first column — the form's title on a client page, the
 * client's name on a form's own page.
 */
export function RecordList({
  records,
  show,
  empty,
}: {
  records: FormRecord[];
  show: "form" | "client" | "date";
  empty: string;
}) {
  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">{empty}</CardContent>
      </Card>
    );
  }
  // Newest first, so the first of each form (and client) is its latest.
  const seen = new Set<string>();
  const latest = new Set<string>();
  for (const r of records) {
    const k = `${r.template_id}|${r.client_id ?? ""}`;
    if (!seen.has(k)) latest.add(r.id);
    seen.add(k);
  }
  const now = new Date();
  return (
    <Card>
      <CardContent className="divide-y p-0">
        {records.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <div className="min-w-0">
              <Link href={recordHref(r.id)} className="font-medium hover:underline">
                {show === "form" ? r.template_title : show === "client" ? (r.client_name ?? "Client removed from the list") : fmt(r.submitted_at)}
              </Link>
              <p className="text-xs text-muted-foreground">
                {show === "date" ? "" : `${fmt(r.submitted_at)} · `}
                {r.user_name}
                {r.signatures.length > 0 && ` · signed by ${r.signatures.map((s) => s.name).join(", ")}`}
              </p>
            </div>
            <span className="flex items-center gap-3">
              {r.review_due && latest.has(r.id) && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[dueStatus(`${r.review_due}T23:59:59Z`, now)]}`}>
                  Review by {fmt(r.review_due)}
                </span>
              )}
              <a
                href={`${recordHref(r.id)}/pdf`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <FileDown className="size-3.5" aria-hidden />
                PDF
              </a>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
