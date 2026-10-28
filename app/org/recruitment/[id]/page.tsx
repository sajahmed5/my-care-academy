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
import { CandidateDetail, type Doc } from "./candidate-detail";

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireConsole();
  const { id } = await params;

  const supabase = await createClient();
  await requireFeature(context, "recruitment.tracker");

  const [{ data: candidate }, { data: documents }] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, full_name, email, phone, postcode, is_driver, entry_date, stage, status")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("candidate_documents")
      .select("id, doc_type, file_name, file_path, expires_at, not_required, not_required_reason")
      .eq("candidate_id", id),
  ]);
  if (!candidate) notFound();

  return (
    <DashboardShell title={candidate.full_name} context={context}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/org/recruitment" className="text-sm text-muted-foreground hover:underline">
            ← All candidates
          </Link>
          <a
            href={`/org/recruitment/${id}/zip`}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            Download ZIP
          </a>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{candidate.full_name}</CardTitle>
            <CardDescription>
              {[candidate.email, candidate.phone, candidate.postcode]
                .filter(Boolean)
                .join(" · ")}
              {candidate.is_driver ? " · driver" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CandidateDetail
              candidate={candidate}
              documents={(documents ?? []) as Doc[]}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
