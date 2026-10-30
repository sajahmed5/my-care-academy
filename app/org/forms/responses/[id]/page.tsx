import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, RefreshCw } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { responseRows } from "@/lib/form-library";
import { loadRecord, signerLabel } from "@/lib/form-records";
import { formatDate, formatDateTime } from "@/lib/dates";
import { reviewHref } from "@/lib/form-reviews";
import { ViewFile } from "../../library/[code]/responses/[assignmentId]/view-file";

/**
 * A completed form, read back: what it is about, who filled it in and when,
 * every answer against its question, the signatures, and the PDF. Read-only —
 * a completed form is a fact with a date.
 */
export default async function FormRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "forms.builder");
  const { id } = await params;
  const supabase = await createClient();
  const record = await loadRecord(supabase, id);
  if (!record) notFound();

  const rows = responseRows(record.fields, record.answers, { withHeadings: true });
  const revised = record.template_version !== record.current_version;
  const back =
    record.subject === "client" && record.client_id
      ? { href: `/org/clients/${record.client_id}`, label: record.client_name ?? "Client" }
      : record.subject === "carer"
        ? { href: `/org/staff/${record.user_id}#forms`, label: record.user_name }
        : { href: `/org/forms/library/${encodeURIComponent(record.template_code)}`, label: record.template_title };

  return (
    <DashboardShell title={record.template_title} context={context} back={back}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{record.template_title}</h2>
            {record.subject === "client" && (
              <p className="text-sm font-medium">About {record.client_name ?? "a client no longer on the list"}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {record.subject === "carer" ? "Completed" : "Filled in"} by{" "}
              <Link href={`/org/staff/${record.user_id}`} className="font-medium text-foreground hover:underline">
                {record.user_name}
              </Link>{" "}
              on {formatDateTime(record.submitted_at)} · version {record.template_version}
            </p>
            {record.review_due && (
              <p className="text-sm text-muted-foreground">
                Review by {formatDate(record.review_due, { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
            {record.review_of && (
              <p className="text-sm text-muted-foreground">
                A review of{" "}
                <Link href={`/org/forms/responses/${record.review_of}`} className="hover:underline">
                  the version before
                </Link>
                .
              </p>
            )}
            {revised && (
              <p className="text-xs text-amber-700">
                The form has been revised since (it is now version {record.current_version}), so some questions may read differently from when this was filled in.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {record.subject !== "carer" && (
              <Link
                href={reviewHref({ id: record.id, templateCode: record.template_code, subject: record.subject, clientId: record.client_id })}
                className={buttonVariants({ variant: "outline" })}
              >
                <RefreshCw className="size-4" />
                Review it
              </Link>
            )}
            <a href={`/org/forms/responses/${record.id}/pdf`} className={buttonVariants({ variant: "outline" })}>
              <FileDown className="size-4" />
              Download PDF
            </a>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <dl className="divide-y">
              {rows.map((r) =>
                r.heading ? (
                  <h3 key={r.fieldId} className="pb-1 pt-5 text-base font-semibold first:pt-0">{r.label}</h3>
                ) : (
                <div key={r.fieldId} className="space-y-1 py-3 first:pt-0 last:pb-0">
                  <dt className={`text-sm font-medium ${r.removed ? "italic text-muted-foreground" : ""}`}>{r.label}</dt>
                  <dd className="flex flex-wrap items-center gap-2 whitespace-pre-wrap text-sm">
                    {r.value || <span className="text-muted-foreground">Not answered</span>}
                    {r.filePath && <ViewFile path={r.filePath} />}
                  </dd>
                </div>
                ),
              )}
            </dl>
          </CardContent>
        </Card>

        {(record.signed_name || record.signatures.length > 0) && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h3 className="text-sm font-semibold">Signatures</h3>
              {record.signed_name && (
                <p className="text-sm">
                  <span className="text-muted-foreground">{record.subject === "carer" ? "Signed" : "Staff"}: </span>
                  {record.signed_name}, by typing their name, {formatDateTime(record.submitted_at)}
                </p>
              )}
              {record.signatures.map((s, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-sm">
                    <span className="text-muted-foreground">{signerLabel(s)}: </span>
                    {s.name}, {formatDateTime(s.signed_at)}
                  </p>
                  {s.image && (
                    // A data URL from the signature pad; next/image adds nothing here.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.image} alt={`Signature of ${s.name}`} className="h-16 w-auto rounded border bg-white" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
