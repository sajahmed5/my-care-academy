import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadFormTemplate } from "@/lib/form-library";
import { TemplateEditor } from "./template-editor";

/** One form template: its fields, and whether customers can see it. */
export default async function PlatformFormPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const context = await requireRole("platform_admin");
  const { code } = await params;
  const supabase = await createClient();
  const template = await loadFormTemplate(supabase, decodeURIComponent(code));
  if (!template) notFound();

  return (
    <DashboardShell title={template.title} context={context}>
      <div className="space-y-6">
        <Link href="/platform/forms" className="text-sm text-muted-foreground hover:underline">
          ← Forms library
        </Link>
        <TemplateEditor template={template} />
      </div>
    </DashboardShell>
  );
}
