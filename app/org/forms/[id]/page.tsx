import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { FormField } from "@/lib/forms";
import { FormBuilder } from "./form-builder";

export default async function FormBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireConsole();
  const { id } = await params;

  const supabase = await createClient();
  await requireFeature(context, "forms.builder");

  const [{ data: form }, { data: fields }] = await Promise.all([
    supabase.from("forms").select("id, title, status").eq("id", id).maybeSingle(),
    supabase
      .from("form_fields")
      .select("id, label, type, options, required, conditional, sort_order")
      .eq("form_id", id)
      .order("sort_order"),
  ]);
  if (!form) notFound();

  const typedFields = (fields ?? []) as unknown as FormField[];

  return (
    <DashboardShell title={form.title} context={context}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/org/forms" className="text-sm text-muted-foreground hover:underline">
            ← All forms
          </Link>
          <div className="flex gap-2">
            <Link
              href={`/org/forms/${id}/fill`}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Preview / fill
            </Link>
            <Link
              href={`/org/forms/${id}/submissions`}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Submissions
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Build form</CardTitle>
            <CardDescription>
              Add fields, set options and conditional logic, then publish.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormBuilder
              formId={form.id}
              title={form.title}
              status={form.status}
              initialFields={typedFields}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
