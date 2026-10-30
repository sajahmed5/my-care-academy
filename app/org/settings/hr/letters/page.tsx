import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { LETTER_FIELDS, LETTER_TEMPLATES, sanitiseOverrides } from "@/lib/hr/letters";
import { sanitiseLetterhead } from "@/lib/hr/letterhead";
import { orgBranding } from "@/lib/branding";
import { TemplateEditor } from "./template-editor";
import { LetterheadForm } from "./letterhead-form";

/**
 * Every HR letter's wording (HR-PACK.md). Each starts as ours; a company
 * changes the subject and body. The right to be accompanied and the right to
 * appeal (ACAS) are added to the letters that need them and can't be edited
 * away. Managers only.
 */
export default async function LetterTemplatesPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const [{ data }, brand] = await Promise.all([
    supabase.from("hr_settings").select("letter_templates, letterhead").eq("organisation_id", context.organisationId!).maybeSingle(),
    orgBranding(context.organisationId),
  ]);
  const own = sanitiseOverrides(data?.letter_templates);
  const groups = [...new Set(LETTER_TEMPLATES.map((t) => t.group))];
  return (
    <SettingsShell context={context} active="/org/settings/hr/letters">
      <div className="max-w-3xl space-y-5">
        <LetterheadForm company={brand?.name ?? ""} initial={sanitiseLetterhead(data?.letterhead)} hasLogo={!!brand?.logoUrl} />
        <details className="rounded-xl border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">What you can put in {"{{double brackets}}"}</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {LETTER_FIELDS.map((f) => (
              <li key={f.field}>
                <code className="text-xs">{`{{${f.field}}}`}</code> <span className="text-muted-foreground">{f.meaning}</span>
              </li>
            ))}
          </ul>
        </details>
        {groups.map((g) => (
          <section key={g} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g}</h3>
            {LETTER_TEMPLATES.filter((t) => t.group === g).map((t) => (
              <TemplateEditor
                key={t.kind}
                kind={t.kind}
                label={t.label}
                ours={{ subject: t.subject, body: t.body }}
                own={own[t.kind] ?? null}
                fixed={t.fixed ?? []}
              />
            ))}
          </section>
        ))}
      </div>
    </SettingsShell>
  );
}
