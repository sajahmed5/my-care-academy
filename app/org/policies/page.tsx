import Link from "next/link";
import { FileText, ShieldCheck, Table2 } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PACK_LABEL,
  byCategory,
  loadAcceptanceCounts,
  loadCopies,
  loadLibrary,
  type OrgPolicyCopy,
  type PolicySummary,
} from "@/lib/policy-library";

/**
 * Policies, and the documents that go with them.
 *
 * Two tabs, deliberately: a policy is read and accepted and the acceptance is
 * the evidence; a document is a form or a log to download, print and fill in.
 * One list holding both would be scrolled past. With no documents published
 * to this organisation there is no second tab at all — an empty tab beside
 * the policies only raised the question of what goes in it (#73).
 */
export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "documents.library");

  const { tab } = await searchParams;

  const supabase = await createClient();
  const [enabled, { data: org }] = await Promise.all([
    enabledMap(context),
    supabase
      .from("organisations")
      .select("name, service_type")
      .eq("id", context.organisationId!)
      .single(),
  ]);

  const all = await loadLibrary(supabase, {
    enabled,
    serviceType: (org?.service_type as string | null) ?? null,
    userId: context.userId,
  });

  const policies = all.filter((d) => d.kind === "policy");
  const documents = all.filter((d) => d.kind !== "policy");
  const active = tab === "documents" && documents.length > 0 ? "documents" : "policies";
  const shown = active === "policies" ? policies : documents;

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
  const { counts, staff } =
    active === "policies"
      ? await loadAcceptanceCounts(supabase, published, context.organisationId)
      : { counts: new Map<string, number>(), staff: 0 };

  return (
    <DashboardShell title="Policies" context={context}>
      <div className="mx-auto max-w-6xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Templates for {org?.name ?? "your organisation"}, with your name already
          in them. Adopt a policy, complete the highlighted parts with what your
          service does, and publish it: your staff read and accept your version,
          never the template.
        </p>

        {/* Where the service stands, at a glance: every row used to say
            "Not adopted" in grey and nothing said what to do about it
            (design review, 28 Oct 2026). */}
        {active === "policies" && policies.length > 0 && (
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

        {documents.length > 0 && (
          <nav aria-label="Library" className="flex items-center gap-1 border-b">
            <Tab href="/org/policies" label="Policies" count={policies.length} active={active === "policies"} />
            <Tab
              href="/org/policies?tab=documents"
              label="Documents"
              count={documents.length}
              active={active === "documents"}
            />
          </nav>
        )}

        {shown.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nothing here for your service yet.
            </CardContent>
          </Card>
        ) : (
          byCategory(shown).map(([category, items]) => (
            <section key={category} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{category}</h3>
              <div className="space-y-2">
                {items.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    copy={copies.get(item.id) ?? null}
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

function Tab({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{count}</span>
    </Link>
  );
}

function Row({
  item,
  copy,
  accepted: acceptedCount,
  staff,
}: {
  item: PolicySummary;
  copy: OrgPolicyCopy | null;
  accepted: number;
  staff: number;
}) {
  const Icon = item.kind === "log" ? Table2 : item.kind === "policy" ? ShieldCheck : FileText;
  const live = copy && copy.status === "published" && copy.version > 0;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-6">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <Link href={`/org/policies/${item.code}`} className="font-medium text-primary hover:underline">
              {item.title}
            </Link>
            <p className="text-xs text-muted-foreground">
              {PACK_LABEL[item.pack]}
              {item.collection ? ` · ${item.collection}` : ""}
              {item.kind === "log" ? " · spreadsheet" : ""}
            </p>
          </div>
        </div>
        {item.kind === "policy" && (
          <div className="flex items-center gap-2">
            {live ? (
              <>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Published · v{copy.version}
                </span>
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
        )}
      </CardContent>
    </Card>
  );
}
