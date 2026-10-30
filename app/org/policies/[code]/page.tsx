import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  COMPANY_FIELDS,
  appliesTo,
  loadCopy,
  loadPolicy,
  loadPolicySettings,
  render,
  serviceLabel,
} from "@/lib/policy-library";
import { dueStatus } from "@/lib/records";
import { formatDate } from "@/lib/dates";
import { AdoptButton } from "./adopt-button";
import { PolicyEditor } from "./policy-editor";
import { PolicyBody } from "@/components/policy-body";
import { orgBranding } from "@/lib/branding";
import { PolicyAcceptButton } from "@/components/policy-accept-button";
import { AcceptancePanel, type AcceptanceRow } from "./acceptance-panel";
import { loadReading } from "@/lib/policy-reading-data";
import { AUDIENCES } from "@/lib/policy-reading";
import { FillDetailsButton, ReviewPanel, type ReviewEntry } from "./review-panel";

/**
 * One policy, with the organisation's name already in it.
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
  const [{ data: org }, doc] = await Promise.all([
    supabase
      .from("organisations")
      .select("name, service_type")
      .eq("id", context.organisationId!)
      .single(),
    loadPolicy(supabase, decodeURIComponent(code), context.userId),
  ]);
  // RLS shows published policies only; the list's own rule decides which
  // service's version this company has.
  if (!doc || doc.kind !== "policy") notFound();
  if (!appliesTo(doc.service_types, (org?.service_type as string | null) ?? null)) notFound();

  const name = (org?.name as string) ?? "Your organisation";
  const blocks = render(doc.blocks, name);
  // A policy is adopted, completed and published as the organisation's own
  // copy (ROADMAP §1); staff read and accept that, never the template.
  const copy = await loadCopy(supabase, context.organisationId!, doc.id);
  const publishedCopy = copy && copy.status === "published" && copy.version > 0 ? copy : null;
  // Who has accepted the published version — the manager's half of the evidence.
  // Who it is for, by when, and who is late — the same answer as every other view.
  const reading = publishedCopy ? await loadReading(supabase, context.organisationId!) : null;
  const personOf = new Map((reading?.people ?? []).map((p) => [p.id, p]));
  const acceptance: AcceptanceRow[] = (reading?.entries ?? [])
    .filter((e) => e.copyId === publishedCopy?.id)
    .map((e) => ({
      userId: e.userId,
      name: personOf.get(e.userId)?.name ?? "Unnamed",
      role: personOf.get(e.userId)?.role ?? "learner",
      status: e.status,
      dueOn: e.dueOn,
      acceptedVersion: e.acceptedVersion,
      acceptedAt: e.acceptedAt,
    }));
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

  const [branding, settings, { data: reviewRows }] = await Promise.all([
    orgBranding(context.organisationId),
    loadPolicySettings(supabase, context.organisationId!),
    publishedCopy
      ? supabase
          .from("organisation_policy_reviews")
          .select("id, reviewed_at, reviewed_by, outcome, version, note")
          .eq("organisation_policy_id", publishedCopy.id)
          .order("reviewed_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const isManager = context.role === "org_admin";
  // Who reviewed, by name: console users read their organisation's users.
  const reviewerIds = [...new Set((reviewRows ?? []).map((r) => r.reviewed_by as string).filter(Boolean))];
  const { data: reviewers } = reviewerIds.length
    ? await supabase.from("users").select("id, full_name, email").in("id", reviewerIds)
    : { data: [] as Record<string, unknown>[] };
  const nameOf = new Map((reviewers ?? []).map((u) => [u.id as string, ((u.full_name as string | null) ?? (u.email as string)) || "Someone"]));
  const history: ReviewEntry[] = (reviewRows ?? []).map((r) => ({
    id: r.id as string,
    at: formatDate(r.reviewed_at as string, { day: "numeric", month: "short", year: "numeric" }),
    by: nameOf.get(r.reviewed_by as string) ?? "Someone",
    outcome: r.outcome as ReviewEntry["outcome"],
    version: r.version as number,
    note: (r.note as string | null) ?? null,
  }));
  const reviewMonths = copy?.review_months ?? settings.review_months;
  // Company details this copy still asks for, as [Registered manager]-style fill-ins.
  const working = copy ? (copy.draft_blocks ?? copy.blocks) : [];
  const missingDetails = COMPANY_FIELDS.filter((f) => working.some((b) => b.text.includes(`[${f.label}]`))).map((f) => f.label);

  return (
    <DashboardShell title={doc.title} context={context}>
      <div className="space-y-6">
        <Link href="/org/policies" className="text-sm text-muted-foreground hover:underline">
          ← All policies
        </Link>

        <div className="space-y-1">
          {/* Their copy of the policy carries their logo, with white-label. */}
          {branding?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={`${branding.name} logo`} className="mb-3 max-h-12 max-w-48 object-contain" />
          )}
          <h2 className="text-xl font-semibold">{doc.title}</h2>
          <p className="text-sm text-muted-foreground">
            {doc.category}
            {serviceLabel(doc.service_types) ? ` · ${serviceLabel(doc.service_types)} version` : ""}
          </p>
        </div>

        {!copy ? (
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
            {missingDetails.length > 0 && <FillDetailsButton copyId={copy.id} code={doc.code} missing={missingDetails} />}
            <Card>
              <CardContent className="pt-6">
                <PolicyEditor
                  // A fresh editor when the saved text changes underneath it (details filled in).
                  key={`${copy.id}:${blocksKey(working)}`}
                  copyId={copy.id}
                  code={doc.code}
                  initial={working}
                  published={!!publishedCopy}
                  canPublish={isManager}
                />
              </CardContent>
            </Card>

            {publishedCopy && (
              <ReviewPanel
                copyId={publishedCopy.id}
                code={doc.code}
                dueLabel={
                  publishedCopy.review_due_on
                    ? formatDate(publishedCopy.review_due_on, { day: "numeric", month: "long", year: "numeric" })
                    : null
                }
                overdue={dueStatus(publishedCopy.review_due_on, new Date()) === "overdue"}
                periodLabel={`Reviewed every ${reviewMonths} months${copy.review_months ? "" : " (your company's period)"}`}
                canReview={isManager}
                history={history}
              />
            )}

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
                <AcceptancePanel
                  rows={acceptance}
                  version={publishedCopy.version}
                  audienceLabel={AUDIENCES[copy.audience].label}
                  days={copy.accept_within_days ?? reading?.companyDays ?? 14}
                />
              </>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}

/** A short fingerprint of a block list, to tell the editor its text was replaced. */
function blocksKey(blocks: { text: string }[]): string {
  let h = 5381;
  for (const b of blocks) for (let i = 0; i < b.text.length; i++) h = ((h << 5) + h + b.text.charCodeAt(i)) | 0;
  return `${blocks.length}-${h >>> 0}`;
}
