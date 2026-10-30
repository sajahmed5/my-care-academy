import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { wordingInForce } from "@/lib/signing";
import { DEFAULT_SIGNING_DOCUMENTS, MERGE_FIELDS, SIGNING_DOC_KEYS, blanksIn } from "@/lib/signing-documents";
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
  const wording = await wordingInForce(createAdminClient(), context.organisationId!);
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
            ? `${blankCount} blank${blankCount === 1 ? "" : "s"} in [square brackets] still to fill in with your own terms (pay, hours, notice and so on). Nothing can be sent to a candidate until they're all filled in.`
            : "Every blank is filled in: these are ready to send."}
        </div>
        <details className="rounded-xl border bg-card px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Filled in for each candidate</summary>
          <ul className="mt-2 space-y-1">
            {MERGE_FIELDS.map((f) => (
              <li key={f.field}><code className="rounded bg-muted px-1">{`{{${f.field}}}`}</code> {f.meaning}</li>
            ))}
          </ul>
          <p className="mt-2 text-muted-foreground">&ldquo;## &rdquo; starts a heading, &ldquo;- &rdquo; a bullet, and a blank line a new paragraph.</p>
        </details>
        <WordingEditor docs={docs} canEdit />
      </div>
    </SettingsShell>
  );
}
