import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { wordingInForce } from "@/lib/signing";
import { DEFAULT_SIGNING_DOCUMENTS, MERGE_FIELDS, SIGNING_DOC_KEYS, blanksIn, knownBlanks } from "@/lib/signing-documents";
import { probationFromRow } from "@/lib/hr/probation";
import { holidaySettingsFromRow } from "@/lib/hr/holidays";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { WordingEditor } from "./wording-editor";

/**
 * The documents a candidate signs in stage 4, in this company's wording
 * (RECRUITMENT.md, release 6). Our template leaves each company's own terms
 * as [blanks]; nothing can be sent while one remains. Managers edit; every
 * save is a new version, and signed copies keep the wording they were signed on.
 */
export default async function DocumentsToSignPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  const admin = createAdminClient();
  const [wording, { data: org }, { data: hr }] = await Promise.all([
    wordingInForce(admin, context.organisationId!),
    admin.from("organisations").select("name").eq("id", context.organisationId!).maybeSingle(),
    admin.from("hr_settings").select("probation_months, leave_year_start").eq("organisation_id", context.organisationId!).maybeSingle(),
  ]);
  const companyName = (org?.name as string | undefined) ?? "your company";
  const known = knownBlanks({ probationMonths: probationFromRow(hr).months, yearStart: holidaySettingsFromRow(hr).yearStart });
  const docs = SIGNING_DOC_KEYS.map((k) => ({
    key: k,
    title: wording[k].title,
    countersigned: wording[k].countersigned,
    parts: wording[k].parts.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      ours: DEFAULT_SIGNING_DOCUMENTS[k].parts.find((d) => d.id === p.id)?.body ?? "",
      version: wording[k].versions[p.id] ?? 0,
      optional: p.optional === true,
    })),
  }));
  const blankCount = docs.flatMap((d) => d.parts).reduce((n, p) => n + blanksIn(p.body).length, 0);
  return (
    <SettingsShell context={context} active="/org/settings/recruitment/documents">
      <div className="max-w-4xl space-y-5">
        <p className="text-sm text-muted-foreground">
          What a new carer signs once their checks are done: role acceptance, the contract and the refund of training agreement. This is
          our template, written for home care. It isn&apos;t legal advice: have it checked before you use it.
        </p>
        <div className={`rounded-xl px-4 py-3 text-sm ${blankCount ? "bg-amber-50 text-amber-950" : "bg-accent text-accent-foreground"}`}>
          {blankCount
            ? `${blankCount} blank${blankCount === 1 ? "" : "s"} in [square brackets], highlighted below, still to fill in with your own terms (pay, hours, notice and so on). Nothing can be sent to a candidate until they're all filled in. Words in {{double curly brackets}} aren't blanks: we fill those in for you.`
            : "Every blank is filled in: these are ready to send."}
        </div>
        <details className="rounded-xl border bg-card px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Filled in automatically: the {"{{double curly brackets}}"}</summary>
          <p className="mt-2 text-muted-foreground">
            You don&apos;t fill these in. Your company name is always {companyName}; the rest is filled in from each candidate&apos;s record when you send them the documents.
          </p>
          <ul className="mt-2 space-y-1">
            {MERGE_FIELDS.map((f) => (
              <li key={f.field}>
                <code className="rounded bg-muted px-1">{`{{${f.field}}}`}</code> {f.meaning}
                {f.field === "companyName" && <>: <strong>{companyName}</strong></>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted-foreground">&ldquo;## &rdquo; starts a heading, &ldquo;- &rdquo; a bullet, and a blank line a new paragraph.</p>
        </details>
        <WordingEditor docs={docs} canEdit companyName={companyName} known={known} />
      </div>
    </SettingsShell>
  );
}
