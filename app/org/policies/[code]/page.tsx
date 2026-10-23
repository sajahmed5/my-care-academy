import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  PACK_LABEL,
  loadAcceptance,
  loadPolicy,
  render,
  visiblePacks,
} from "@/lib/policy-library";
import { PolicyBody } from "@/components/policy-body";
import { PolicyAcceptButton } from "@/components/policy-accept-button";
import { AcceptancePanel } from "./acceptance-panel";

/**
 * One policy or document, with the organisation's name already in it.
 *
 * Guidance — the bracketed notes the template leaves for the provider to
 * complete — is shown as guidance rather than as policy text. A template that
 * looks finished and is not would be worse than no template at all, so the
 * page says plainly how many parts are still to be written.
 */
export default async function PolicyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const context = await requireRole("org_admin");
  await requireFeature(context, "documents.library");
  const { code } = await params;

  const supabase = await createClient();
  const [enabled, { data: org }] = await Promise.all([
    enabledMap(context),
    supabase
      .from("organisations")
      .select("name")
      .eq("id", context.organisationId!)
      .single(),
  ]);

  const doc = await loadPolicy(supabase, decodeURIComponent(code), context.userId);
  if (!doc) notFound();

  // The same gate the list uses: a pack they do not have must not be readable
  // by guessing a URL.
  const { packs, collections } = visiblePacks(enabled);
  const allowed =
    packs.includes(doc.pack) &&
    (doc.pack !== "addon" || collections.includes(doc.collection ?? ""));
  if (!allowed) notFound();

  const name = (org?.name as string) ?? "Your organisation";
  const blocks = render(doc.blocks, name);
  const version0 = doc.version ?? 1;
  // Who has accepted this version — the manager's half of the evidence. Only
  // for policies: a form is printed, not accepted.
  const acceptance =
    doc.kind === "policy"
      ? await loadAcceptance(supabase, doc.id, version0)
      : { accepted: [], outstanding: [], total: 0 };
  const toComplete = blocks.filter((b) => b.type === "guidance").length;
  const version = doc.version ?? 1;

  return (
    <DashboardShell title={doc.title} context={context}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href={doc.kind === "policy" ? "/org/policies" : "/org/policies?tab=documents"}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {doc.kind === "policy" ? "All policies" : "All documents"}
        </Link>

        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{doc.title}</h2>
          <p className="text-sm text-muted-foreground">
            {PACK_LABEL[doc.pack]}
            {doc.collection ? ` · ${doc.collection}` : ""} · {doc.category}
          </p>
        </div>

        {doc.kind === "log" ? (
          <Card>
            <CardContent className="space-y-2 py-8 text-center text-sm text-muted-foreground">
              <p>This one is a spreadsheet — a log to keep, not text to read.</p>
              <p>Downloading it is not built yet.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {toComplete > 0 && (
              <Card>
                <CardContent className="flex items-start gap-3 pt-6 text-sm">
                  <Pencil className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                  <p>
                    <span className="font-medium">
                      {toComplete} {toComplete === 1 ? "part" : "parts"} still to write.
                    </span>{" "}
                    The highlighted notes are guidance for you to replace with
                    what your service actually does, before this goes to your team.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-6">
                <PolicyBody blocks={blocks} />
              </CardContent>
            </Card>

            {doc.kind === "policy" && (
              <>
                <Card>
                  <CardContent className="pt-6">
                    <PolicyAcceptButton
                      policyId={doc.id}
                      code={doc.code}
                      version={version}
                      accepted={doc.acknowledgedVersion != null && doc.acknowledgedVersion >= version}
                    />
                  </CardContent>
                </Card>
                <AcceptancePanel summary={acceptance} version={version} />
              </>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
