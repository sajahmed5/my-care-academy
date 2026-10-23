import Link from "next/link";
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
import { AddCandidateForm } from "./add-candidate-form";
import { RecruitmentTable, type CandidateRow } from "./recruitment-table";

export default async function RecruitmentPage() {
  const context = await requireRole("org_admin");

  const supabase = await createClient();
  await requireFeature(context, "recruitment.tracker");

  const [{ data: candidates }, { data: docs }] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, full_name, postcode, email, is_driver, entry_date, stage, status")
      .order("created_at", { ascending: false }),
    supabase.from("candidate_documents").select("candidate_id, doc_type"),
  ]);

  const docsByCandidate = new Map<string, string[]>();
  for (const d of docs ?? []) {
    const arr = docsByCandidate.get(d.candidate_id) ?? [];
    arr.push(d.doc_type);
    docsByCandidate.set(d.candidate_id, arr);
  }

  const rows: CandidateRow[] = (candidates ?? []).map((c) => ({
    ...c,
    docs: docsByCandidate.get(c.id) ?? [],
  }));

  return (
    <DashboardShell title="Recruitment" context={context}>
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/org" className="text-sm text-muted-foreground hover:underline">
          ← Back to console
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Add candidate</CardTitle>
          </CardHeader>
          <CardContent>
            <AddCandidateForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Applicant tracker</CardTitle>
            <CardDescription>
              {rows.length} candidate(s). Click a name to manage documents and
              stage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecruitmentTable candidates={rows} />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
