import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { FormField } from "@/lib/forms";
import { FormFill } from "./form-fill";

export default async function FillFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // org_admin previews/fills. (Learner-facing fill is a natural extension.)
  const context = await requireConsole();
  const { id } = await params;

  const supabase = await createClient();
  await requireFeature(context, "forms.builder");

  const [{ data: form }, { data: fields }] = await Promise.all([
    supabase.from("forms").select("id, title, description").eq("id", id).maybeSingle(),
    supabase
      .from("form_fields")
      .select("id, label, type, options, required, conditional, sort_order")
      .eq("form_id", id)
      .order("sort_order"),
  ]);
  if (!form) notFound();

  return (
    <DashboardShell title={form.title} context={context}>
      <div className="mx-auto max-w-6xl *:max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{form.title}</CardTitle>
            {form.description && (
              <CardDescription>{form.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <FormFill
              formId={form.id}
              fields={(fields ?? []) as unknown as FormField[]}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
