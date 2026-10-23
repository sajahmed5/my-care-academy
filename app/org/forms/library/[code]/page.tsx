import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  categoryLabel,
  loadAssignmentsForTemplate,
  loadFormTemplate,
  visibleFormPacks,
} from "@/lib/form-library";
import { AssignForm } from "./assign-form";
import { AssignmentList } from "./assignment-list";

/**
 * One form, as a manager sees it: what it asks, who has been asked, who has
 * done it, and the button to ask more people.
 */
export default async function OrgFormPage({ params }: { params: Promise<{ code: string }> }) {
  const context = await requireRole("org_admin");
  await requireFeature(context, "forms.builder");
  const { code } = await params;

  const supabase = await createClient();
  const [enabled, template] = await Promise.all([
    enabledMap(context),
    loadFormTemplate(supabase, decodeURIComponent(code)),
  ]);
  if (!template) notFound();
  const { packs, collections } = visibleFormPacks(enabled);
  if (!packs.includes(template.pack) || (template.pack === "addon" && !collections.includes(template.collection ?? ""))) {
    notFound();
  }

  const [assignments, { data: staff }] = await Promise.all([
    loadAssignmentsForTemplate(supabase, template.id),
    supabase
      .from("users")
      .select("id, full_name, email, role")
      .eq("status", "active")
      .in("role", ["learner", "org_admin"])
      .order("full_name")
      .limit(1000),
  ]);

  const people = (staff ?? []).map((u) => ({
    id: u.id as string,
    name: (u.full_name as string | null) ?? (u.email as string),
    role: u.role as string,
  }));

  return (
    <DashboardShell title={template.title} context={context}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/org/forms" className="text-sm text-muted-foreground hover:underline">
          ← All forms
        </Link>

        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{template.title}</h2>
          <p className="text-sm text-muted-foreground">
            {categoryLabel(template.category)} · {template.fields.length} questions · version {template.version}
          </p>
          {template.description && <p className="text-sm">{template.description}</p>}
        </div>

        <AssignForm templateId={template.id} people={people} />

        <AssignmentList assignments={assignments} />

        <Card>
          <CardContent className="space-y-1 pt-6">
            <h3 className="text-sm font-semibold">What it asks</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {template.fields.map((f) => (
                <li key={f.id}>
                  {f.label}
                  {f.required && <span className="text-muted-foreground"> · required</span>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
