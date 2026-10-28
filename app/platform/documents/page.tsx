import Link from "next/link";
import { AlertTriangle, FileText, ShieldCheck, Table2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { StatTile } from "@/components/learner-ui";
import { PACK_LABEL, type PolicyBlock, type PolicyKind, type PolicyPack } from "@/lib/policy-library";
import { PackActions } from "./pack-actions";

/**
 * The document library, as the people who own it see it.
 *
 * The org-side library shows published documents to a customer. This shows
 * everything, with what is wrong with it: a library of 129 imported files is
 * reviewed by finding the handful that need attention, not by opening all of
 * them in order.
 */

interface Row {
  code: string;
  title: string;
  category: string;
  pack: PolicyPack;
  kind: PolicyKind;
  status: string;
  blocks: PolicyBlock[];
  source_file: string | null;
}

/** What makes a document worth looking at before it is published. */
function flagsFor(row: Row): string[] {
  const flags: string[] = [];
  const blocks = row.blocks ?? [];
  if (blocks.length === 0) {
    flags.push(row.kind === "log" ? "spreadsheet — no text" : "no content");
  } else {
    const guidance = blocks.filter((b) => b.type === "guidance").length;
    if (guidance > 0) flags.push(`${guidance} to write`);
    if (!blocks.some((b) => b.text.includes("{{organisation}}")))
      flags.push("no organisation name");
    if (blocks.length < 15) flags.push("very short");
  }
  return flags;
}

export default async function PlatformDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string }>;
}) {
  const context = await requireRole("platform_admin");
  const { status, kind } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase
    .from("policy_documents")
    .select("code, title, category, pack, kind, status, blocks, source_file")
    .order("category")
    .order("sort_order")
    .limit(500);

  const rows = (data ?? []) as Row[];
  const published = rows.filter((r) => r.status === "published").length;
  const drafts = rows.filter((r) => r.status === "draft").length;
  const needsAttention = rows.filter((r) =>
    flagsFor(r).some((f) => f === "no content" || f === "no organisation name" || f === "very short"),
  );

  const shown = rows.filter(
    (r) => (!status || r.status === status) && (!kind || r.kind === kind),
  );

  const groups = new Map<string, Row[]>();
  for (const row of shown) {
    const list = groups.get(row.category) ?? [];
    list.push(row);
    groups.set(row.category, list);
  }

  return (
    <DashboardShell title="Document library" context={context}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            label="All"
            value={rows.length}
            icon={FileText}
            color="#6366f1"
            href="/platform/documents"
            hint={status || kind ? "Show all" : "Showing all"}
          />
          <StatTile
            label="Published"
            value={published}
            icon={ShieldCheck}
            color="#10b981"
            href="/platform/documents?status=published"
            hint={status === "published" ? "Showing these" : undefined}
          />
          <StatTile
            label="Draft"
            value={drafts}
            icon={Table2}
            color="#f59e0b"
            href="/platform/documents?status=draft"
            hint={status === "draft" ? "Showing these" : undefined}
          />
          <StatTile
            label="Worth a look"
            value={needsAttention.length}
            icon={AlertTriangle}
            color="#ef4444"
          />
        </div>

        {needsAttention.length > 0 && (
          <Card>
            <CardContent className="space-y-2 pt-6">
              <h3 className="text-sm font-semibold">Worth a look first</h3>
              <p className="text-sm text-muted-foreground">
                Imported from Word, so these are the ones where the import or
                the source document has a problem — no readable content, no
                place for the organisation&apos;s name, or oddly short.
              </p>
              <ul className="space-y-1 pt-1">
                {needsAttention.slice(0, 8).map((row) => (
                  <li key={row.code} className="text-sm">
                    <Link
                      href={`/platform/documents/${row.code}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.title}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      — {flagsFor(row).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
              {needsAttention.length > 8 && (
                <p className="text-xs text-muted-foreground">
                  …and {needsAttention.length - 8} more.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <PackActions />
          {/* Status and type, as links: the list is filtered server-side and a
              filter should survive a refresh and a shared URL. */}
          <nav aria-label="Filter" className="flex flex-wrap items-center gap-1 text-xs">
            {[
              { label: "All", href: "/platform/documents", on: !status && !kind },
              { label: "Published", href: "/platform/documents?status=published", on: status === "published" },
              { label: "Draft", href: "/platform/documents?status=draft", on: status === "draft" },
              { label: "Retired", href: "/platform/documents?status=retired", on: status === "retired" },
            ].map((f) => (
              <Link
                key={f.label}
                href={f.href}
                className={`rounded-full px-2.5 py-1 font-medium ${
                  f.on ? "bg-[#134f63] text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </Link>
            ))}
            <span className="mx-1 text-muted-foreground">·</span>
            {[
              { label: "Policies", value: "policy" },
              { label: "Forms", value: "form" },
              { label: "Logs", value: "log" },
            ].map((f) => (
              <Link
                key={f.value}
                href={`/platform/documents?${status ? `status=${status}&` : ""}kind=${f.value}`}
                className={`rounded-full px-2.5 py-1 font-medium ${
                  kind === f.value ? "bg-[#134f63] text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </div>

        {[...groups.entries()].map(([category, items]) => (
          <section key={category} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">{category}</h3>
            <div className="space-y-2">
              {items.map((row) => {
                const flags = flagsFor(row);
                return (
                  <Card key={row.code}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-6">
                      <div className="min-w-0">
                        <Link
                          href={`/platform/documents/${row.code}`}
                          className="font-medium hover:underline"
                        >
                          {row.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {PACK_LABEL[row.pack]} · {row.kind}
                          {flags.length ? ` · ${flags.join(", ")}` : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.status === "published"
                            ? "bg-green-100 text-green-700"
                            : row.status === "retired"
                              ? "bg-muted text-muted-foreground"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {row.status}
                      </span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </DashboardShell>
  );
}
