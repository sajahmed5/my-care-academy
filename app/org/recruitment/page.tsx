import Link from "next/link";
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
import { AddCandidateForm } from "./add-candidate-form";
import type { Doc } from "./doc-controls";
import { RecruitmentTable, type CandidateRow } from "./recruitment-table";

export default async function RecruitmentPage() {
  const context = await requireConsole();

  const supabase = await createClient();
  await requireFeature(context, "recruitment.tracker");

  const [{ data: candidates }, { data: docs }] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, full_name, postcode, email, is_driver, entry_date, stage, status")
      .order("created_at", { ascending: false }),
    supabase
      .from("candidate_documents")
      .select(
        "id, candidate_id, doc_type, file_name, file_path, expires_at, not_required, not_required_reason",
      ),
  ]);

  // The whole row, not just a tick: a cell in the tracker opens the same
  // controls as the candidate page, so it needs the file and the reason.
  const docsByCandidate = new Map<string, Record<string, Doc>>();
  for (const d of docs ?? []) {
    const byType = docsByCandidate.get(d.candidate_id) ?? {};
    byType[d.doc_type] = d as Doc;
    docsByCandidate.set(d.candidate_id, byType);
  }

  const rows: CandidateRow[] = (candidates ?? []).map((c) => ({
    ...c,
    docs: docsByCandidate.get(c.id) ?? {},
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
