import Link from "next/link";
import { FileText, ShieldCheck, Table2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  PACK_LABEL,
  byCategory,
  loadLibrary,
  type PolicySummary,
} from "@/lib/policy-library";

/**
 * Policies and documents.
 *
 * Two tabs, deliberately: a policy is read and accepted and the acceptance is
 * the evidence; a document is a form or a log to download, print and fill in.
 * One list holding both would be scrolled past.
 */
export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const context = await requireRole("org_admin");
  await requireFeature(context, "documents.library");

  const { tab } = await searchParams;
  const active = tab === "documents" ? "documents" : "policies";

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
  const shown = active === "policies" ? policies : documents;

  return (
    <DashboardShell title="Policies & documents" context={context}>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/org" className="text-sm text-muted-foreground hover:underline">
          ← Back to console
        </Link>

        <p className="text-sm text-muted-foreground">
          Templates for {org?.name ?? "your organisation"}, with your name already
          in them. Anything in square brackets is for you to complete before you
          publish it to your team.
        </p>

        <nav aria-label="Library" className="flex items-center gap-1 border-b">
          <Tab href="/org/policies" label="Policies" count={policies.length} active={active === "policies"} />
          <Tab
            href="/org/policies?tab=documents"
            label="Documents"
            count={documents.length}
            active={active === "documents"}
          />
        </nav>

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
                  <Row key={item.id} item={item} />
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

function Row({ item }: { item: PolicySummary }) {
  const accepted =
    item.kind === "policy" && item.acknowledgedVersion != null &&
    item.acknowledgedVersion === (item.version ?? 1);
  const Icon = item.kind === "log" ? Table2 : item.kind === "policy" ? ShieldCheck : FileText;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-6">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <Link href={`/org/policies/${item.code}`} className="font-medium hover:underline">
              {item.title}
            </Link>
            <p className="text-xs text-muted-foreground">
              {PACK_LABEL[item.pack]}
              {item.collection ? ` · ${item.collection}` : ""}
              {item.kind === "log" ? " · spreadsheet" : ""}
            </p>
          </div>
        </div>
        {accepted && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            You have accepted this
          </span>
        )}
      </CardContent>
    </Card>
  );
}
