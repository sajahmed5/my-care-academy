import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
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
import { SubmissionsTable } from "./submissions-table";

export default async function SubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireRole("org_admin");
  const { id } = await params;

  const supabase = await createClient();
  await requireFeature(context, "forms.builder");

  const [{ data: form }, { data: fields }, { data: submissions }] =
    await Promise.all([
      supabase.from("forms").select("id, title").eq("id", id).maybeSingle(),
      supabase
        .from("form_fields")
        .select("id, label, type, options, required, conditional, sort_order")
        .eq("form_id", id)
        .order("sort_order"),
      supabase
        .from("form_submissions")
        .select("id, data, created_at")
        .eq("form_id", id)
        .order("created_at", { ascending: false }),
    ]);
  if (!form) notFound();

  return (
    <DashboardShell title={`${form.title} — submissions`} context={context}>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/org/forms" className="text-sm text-muted-foreground hover:underline">
          ← All forms
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Submissions</CardTitle>
            <CardDescription>{submissions?.length ?? 0} response(s).</CardDescription>
          </CardHeader>
          <CardContent>
            <SubmissionsTable
              fields={(fields ?? []) as unknown as FormField[]}
              submissions={
                (submissions ?? []) as unknown as {
                  id: string;
                  data: Record<string, unknown>;
                  created_at: string;
                }[]
              }
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
