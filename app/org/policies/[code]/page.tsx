import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  PACK_LABEL,
  loadAcceptance,
  loadCopy,
  loadPolicy,
  render,
  visiblePacks,
} from "@/lib/policy-library";
import { formatDate } from "@/lib/dates";
import { AdoptButton } from "./adopt-button";
import { PolicyEditor } from "./policy-editor";
import { PolicyBody } from "@/components/policy-body";
import { orgBranding } from "@/lib/branding";
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
  const context = await requireConsole();
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
  // A policy is adopted, completed and published as the organisation's own
  // copy (ROADMAP §1); staff read and accept that, never the template.
  const copy = doc.kind === "policy" ? await loadCopy(supabase, context.organisationId!, doc.id) : null;
  const publishedCopy = copy && copy.status === "published" && copy.version > 0 ? copy : null;
  // Who has accepted the published version — the manager's half of the evidence.
  const acceptance = publishedCopy
    ? await loadAcceptance(supabase, doc.id, publishedCopy.version, context.organisationId, publishedCopy.id)
    : { accepted: [], outstanding: [], total: 0 };
  const toComplete = blocks.filter((b) => b.type === "guidance").length;
  const templateRevised = !!copy && (doc.version ?? 1) > (copy.template_version ?? 1);
  const myAck = publishedCopy
    ? (
        await supabase
          .from("policy_acknowledgements")
          .select("version")
          .eq("user_id", context.userId)
          .eq("organisation_policy_id", publishedCopy.id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data
    : null;

  const branding = await orgBranding(context.organisationId);

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
          {/* Their copy of the policy carries their logo, with white-label. */}
          {branding?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={`${branding.name} logo`} className="mb-3 max-h-12 max-w-48 object-contain" />
          )}
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
        ) : doc.kind !== "policy" ? (
          <Card>
            <CardContent className="pt-6">
              <PolicyBody blocks={blocks} />
            </CardContent>
          </Card>
        ) : !copy ? (
          <>
            <Card>
              <CardContent className="space-y-3 pt-6 text-sm">
                <p className="font-medium">This is our template — your staff cannot see it yet.</p>
                <p className="text-muted-foreground">
                  Adopt it to make your own copy, with {name} already in it. Complete the
                  {toComplete > 0 ? ` ${toComplete} highlighted ${toComplete === 1 ? "part" : "parts"}` : " highlighted parts"}{" "}
                  with what your service actually does, then publish it: your staff are asked to read and accept your
                  version.
                </p>
                <AdoptButton code={doc.code} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <PolicyBody blocks={blocks} />
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {publishedCopy
                ? `Published to staff — version ${publishedCopy.version}${publishedCopy.published_at ? `, ${formatDate(publishedCopy.published_at, { day: "numeric", month: "long", year: "numeric" })}` : ""}.${copy.draft_blocks ? " You have changes that are not published yet." : ""}`
                : "Your copy — not published to staff yet."}
            </p>
            {templateRevised && (
              <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
                Our template has been revised since you adopted it (now version {doc.version}). Compare it with your copy
                below and bring across anything that applies.
              </p>
            )}
            <Card>
              <CardContent className="pt-6">
                <PolicyEditor
                  copyId={copy.id}
                  code={doc.code}
                  initial={copy.draft_blocks ?? copy.blocks}
                  published={!!publishedCopy}
                />
              </CardContent>
            </Card>

            {publishedCopy && (
              <>
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-semibold">
                    What your staff read — version {publishedCopy.version}
                  </summary>
                  <div className="pt-4">
                    <PolicyBody blocks={publishedCopy.blocks} />
                  </div>
                </details>
                <Card>
                  <CardContent className="pt-6">
                    <PolicyAcceptButton
                      policyId={doc.id}
                      code={doc.code}
                      version={publishedCopy.version}
                      accepted={(myAck?.version as number | undefined ?? 0) >= publishedCopy.version}
                    />
                  </CardContent>
                </Card>
                <AcceptancePanel summary={acceptance} version={publishedCopy.version} />
              </>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
