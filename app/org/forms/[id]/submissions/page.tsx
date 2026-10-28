import Link from "next/link";
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
import { SubmissionsTable } from "./submissions-table";

export default async function SubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireConsole();
  const { id } = await params;

  const supabase = await createClient();
  await requireFeature(context, "forms.builder");

  // The newest 200 responses, with the true total beside them: each response
  // carries every answer, so the whole history is not read on every visit.
  const [{ data: form }, { data: fields }, { data: submissions, count }] =
    await Promise.all([
      supabase.from("forms").select("id, title").eq("id", id).maybeSingle(),
      supabase
        .from("form_fields")
        .select("id, label, type, options, required, conditional, sort_order")
        .eq("form_id", id)
        .order("sort_order"),
      supabase
        .from("form_submissions")
        .select("id, data, created_at", { count: "exact" })
        .eq("organisation_id", context.organisationId!)
        .eq("form_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
  if (!form) notFound();

  return (
    <DashboardShell title={`${form.title} — submissions`} context={context}>
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/org/forms" className="text-sm text-muted-foreground hover:underline">
          ← All forms
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Submissions</CardTitle>
            <CardDescription>
              {count ?? submissions?.length ?? 0} response(s)
              {count && submissions && count > submissions.length ? ` — the newest ${submissions.length} shown.` : "."}
            </CardDescription>
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
