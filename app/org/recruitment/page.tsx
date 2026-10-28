import { Plus } from "lucide-react";
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

  // The whole row, not just a tick: a cell in the tracker opens the same
  // controls as the candidate page, so it needs the file and the reason.
  // Embedded rather than read separately: twelve checklist rows a candidate
  // passes the 1,000-row cap at 84 candidates, and the cap drops rows
  // silently — a held DBS would show as missing.
  const { data: candidates } = await supabase
    .from("candidates")
    .select(
      "id, full_name, postcode, email, is_driver, entry_date, stage, status, candidate_documents (id, doc_type, file_name, file_path, expires_at, not_required, not_required_reason)",
    )
    .eq("organisation_id", context.organisationId!)
    .order("created_at", { ascending: false });

  const rows: CandidateRow[] = (candidates ?? []).map(({ candidate_documents, ...c }) => {
    const docs: Record<string, Doc> = {};
    for (const d of (candidate_documents ?? []) as Doc[]) docs[d.doc_type] = d;
    return { ...c, docs };
  });

  return (
    <DashboardShell title="Recruitment" context={context}>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Folded away until it's wanted: open on every visit, the form sat
            above the tracker and pushed the people you came to see below
            the fold. Adding one opens their page, so it never needs closing. */}
        <details className="group rounded-2xl border bg-card shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
            <Plus className="size-4 transition-transform group-open:rotate-45" />
            Add a candidate
          </summary>
          <div className="border-t px-5 pb-5 pt-4">
            <AddCandidateForm />
          </div>
        </details>

        <Card>
          <CardHeader>
            <CardTitle>Applicant tracker</CardTitle>
            <CardDescription>
              {rows.length} candidate(s). Click a name to manage documents and
              status.
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
