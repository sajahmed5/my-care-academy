import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { loadFormTemplate } from "@/lib/form-library";
import { SettingsShell } from "../../settings-shell";
import { OwnFormEditor } from "./own-form-editor";

/** One of the company's own forms, being built or changed. Manager-only. */
export default async function OwnFormPage({ params }: { params: Promise<{ code: string }> }) {
  const context = await requireRole("org_admin");
  await requireFeature(context, "forms.builder");
  const { code } = await params;
  const supabase = await createClient();
  const template = await loadFormTemplate(supabase, decodeURIComponent(code));
  if (!template || template.organisation_id !== context.organisationId) notFound();

  let base: { title: string; version: number } | null = null;
  if (template.based_on_id) {
    const { data } = await supabase.from("form_templates").select("title, version").eq("id", template.based_on_id).maybeSingle();
    if (data) base = { title: data.title as string, version: data.version as number };
  }

  return (
    <SettingsShell context={context} active="/org/settings/forms">
      <div className="space-y-1">
        <Link href="/org/settings/forms" className="text-sm text-muted-foreground hover:underline">← Your forms</Link>
        <h3 className="text-lg font-semibold">{template.title}</h3>
        {base && (
          <p className="text-sm text-muted-foreground">
            Your copy of our &ldquo;{base.title}&rdquo;, taken at version {template.based_on_version}.
            {base.version > (template.based_on_version ?? 0) && ` Ours has been updated since (now version ${base.version}).`}
          </p>
        )}
      </div>
      <OwnFormEditor template={template} />
    </SettingsShell>
  );
}
