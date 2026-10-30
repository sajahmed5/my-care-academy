import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { dueStatus } from "@/lib/records";
import { formatDate } from "@/lib/dates";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  byCategory,
  loadAcceptanceCounts,
  loadCopies,
  loadLibrary,
  type OrgPolicyCopy,
  serviceLabel,
  type PolicySummary,
} from "@/lib/policy-library";

/**
 * The company's policies: our templates, adopted, completed and published.
 *
 * Policies only since 31 Oct 2026 — the forms and logs that used to sit on a
 * second tab belong to Forms (FORMS.md), where they are filled in rather than
 * printed.
 */
export default async function PoliciesPage() {
  const context = await requireConsole();
  await requireFeature(context, "documents.library");

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organisations")
    .select("name, service_type")
    .eq("id", context.organisationId!)
    .single();

  const policies = await loadLibrary(supabase, {
    serviceType: (org?.service_type as string | null) ?? null,
    userId: context.userId,
  });
  // A company running both kinds of service sees both versions of a title,
  // so each says which it is.
  const showService = org?.service_type === "both";

  // "12 of 40 accepted" against each policy: the number a manager scans for,
  // and the one an inspector asks about.
  // Each policy's own copy, if adopted: what the manager is working on, and
  // what staff have been given to accept.
  const copies = await loadCopies(supabase, context.organisationId!);
  const published = policies.flatMap((p) => {
    const c = copies.get(p.id);
    return c && c.status === "published" && c.version > 0 ? [{ id: p.id, version: c.version, copyId: c.id }] : [];
  });
  const drafts = policies.filter((p) => {
    const c = copies.get(p.id);
    return c && !(c.status === "published" && c.version > 0);
  }).length;
  const notAdopted = policies.length - published.length - drafts;
  const { counts, staff } = await loadAcceptanceCounts(supabase, published, context.organisationId);

  return (
    <DashboardShell title="Policies" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Templates for {org?.name ?? "your organisation"}, with your name already
          in them. Adopt a policy, complete the highlighted parts with what your
          service does, and publish it: your staff read and accept your version,
          never the template.
        </p>

        {/* Where the service stands, at a glance: every row used to say
            "Not adopted" in grey and nothing said what to do about it
            (design review, 28 Oct 2026). */}
        {policies.length > 0 && (
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">
              {published.length} published
            </span>
            {drafts > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700">
                {drafts} in draft
              </span>
            )}
            {notAdopted > 0 && (
              <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">
                {notAdopted} still to adopt
              </span>
            )}
          </div>
        )}

        {policies.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nothing here for your service yet.
            </CardContent>
          </Card>
        ) : (
          byCategory(policies).map(([category, items]) => (
            <section key={category} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{category}</h3>
              <div className="space-y-2">
                {items.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    copy={copies.get(item.id) ?? null}
                    showService={showService}
                    accepted={counts.get(item.id) ?? 0}
                    staff={staff}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </DashboardShell>
  );
}

function Row({
  item,
  copy,
  showService,
  accepted: acceptedCount,
  staff,
}: {
  item: PolicySummary;
  copy: OrgPolicyCopy | null;
  showService: boolean;
  accepted: number;
  staff: number;
}) {
  const live = copy && copy.status === "published" && copy.version > 0;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-6">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <Link href={`/org/policies/${item.code}`} className="font-medium text-primary hover:underline">
              {item.title}
            </Link>
            {showService && serviceLabel(item.service_types) && (
              <p className="text-xs text-muted-foreground">{serviceLabel(item.service_types)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {live ? (
            <>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Published · v{copy.version}
              </span>
              <ReviewBadge on={copy.review_due_on} />
              {staff > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    acceptedCount >= staff ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {acceptedCount} of {staff} accepted
                </span>
              )}
            </>
          ) : copy ? (
            <>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Draft</span>
              <Link href={`/org/policies/${item.code}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                Finish and publish
              </Link>
            </>
          ) : (
            <>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Not adopted</span>
              <Link href={`/org/policies/${item.code}`} className={buttonVariants({ size: "sm" })}>
                Review and adopt
              </Link>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** The review date, once it is within a month or past. */
function ReviewBadge({ on }: { on: string | null }) {
  const status = dueStatus(on, new Date());
  if (!on || (status !== "overdue" && status !== "due_soon")) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        status === "overdue" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
      }`}
    >
      {status === "overdue" ? "Review overdue" : `Review by ${formatDate(on, { day: "numeric", month: "short" })}`}
    </span>
  );
}
