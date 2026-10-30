import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { render, serviceLabel, type PolicyBlock } from "@/lib/policy-library";
import { PolicyBody } from "@/components/policy-body";
import { StatusForm } from "./status-form";

/** The name stood in for a real customer's, so the preview reads as theirs will. */
const SAMPLE_ORG = "Sample Care Services Ltd";

/**
 * One document, as a customer will read it, with the controls that are ours.
 *
 * The preview substitutes a sample organisation name rather than leaving the
 * placeholder visible: the question being answered here is "does this read
 * properly to a customer", and {{organisation}} in the middle of a sentence
 * answers a different one.
 */
export default async function PlatformDocumentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const context = await requireRole("platform_admin");
  const { code } = await params;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("policy_documents")
    .select(
      "code, title, category, kind, status, version, blocks, source_file, service_types",
    )
    .eq("code", decodeURIComponent(code))
    .maybeSingle();
  if (!row) notFound();

  const blocks = (row.blocks as PolicyBlock[]) ?? [];
  const rendered = render(blocks, SAMPLE_ORG);
  const guidance = blocks.filter((b) => b.type === "guidance").length;
  const hasOrgName = blocks.some((b) => b.text.includes("{{organisation}}"));

  return (
    <DashboardShell title={row.title as string} context={context}>
      <div className="space-y-6">
        <Link
          href={row.kind === "policy" ? "/platform/documents" : "/platform/documents?kind=form"}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {row.kind === "policy" ? "Policy library" : "Forms waiting for Forms"}
        </Link>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{row.title as string}</h2>
              <p className="text-sm text-muted-foreground">
                {row.kind as string} · {row.category as string}
              </p>
            </div>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Service</dt>
                <dd>
                  {serviceLabel(row.service_types as string[] | null) ?? "every service"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Parts to write</dt>
                <dd>{guidance}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Organisation name</dt>
                <dd>{hasOrgName ? "yes" : "not in this document"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Blocks</dt>
                <dd>{blocks.length}</dd>
              </div>
            </dl>
            {row.source_file && (
              <p className="break-all text-xs text-muted-foreground">
                From: {row.source_file as string}
              </p>
            )}
            {row.kind === "policy" ? (
              <StatusForm code={row.code as string} status={row.status as string} />
            ) : (
              <p className="text-sm text-muted-foreground">
                A form waiting to move to Forms — it is never published from the policy library.
              </p>
            )}
          </CardContent>
        </Card>

        {blocks.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No readable content. Either it is a spreadsheet, or the source
              file is not what its name says it is.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="text-xs text-muted-foreground">
                Previewed as {SAMPLE_ORG}.
              </p>
              <PolicyBody blocks={rendered} />
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
