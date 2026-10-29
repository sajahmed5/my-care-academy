import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import type { Answers } from "@/lib/recruitment-application";
import { shadowingFlags } from "@/lib/recruitment-shadowing";
import { DashboardShell } from "@/components/dashboard-shell";
import { ShadowingForm } from "./shadowing-form";

/** The mentor's feedback on the candidate's shadowing shift. */
export default async function ShadowingPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: candidate }, { data: record }] = await Promise.all([
    supabase.from("candidates").select("full_name").eq("id", id).maybeSingle(),
    supabase.from("candidate_shadowing").select("answers, status").eq("candidate_id", id).maybeSingle(),
  ]);
  if (!candidate) notFound();
  const initial = (record?.answers as Answers | null) ?? { shadowDate: new Date().toISOString().slice(0, 10) };
  return (
    <DashboardShell
      title={`Shadowing: ${candidate.full_name as string}`}
      context={context}
      back={{ href: `/org/recruitment/${id}`, label: candidate.full_name as string }}
    >
      <ShadowingForm candidateId={id} initial={initial} complete={record?.status === "complete"} flags={record?.status === "complete" ? shadowingFlags(initial) : []} />
    </DashboardShell>
  );
}
