import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import type { CompanySignature, PartState, Snapshot } from "@/lib/signing-documents";
import { SignedDocument } from "@/components/recruit/signed-document";
import { DashboardShell } from "@/components/dashboard-shell";
import { Countersign } from "./countersign";

/**
 * A document the candidate was sent, exactly as they read it: each part,
 * their signatures, and the company's countersignature or acceptance.
 */
export default async function SignedPage({ params }: { params: Promise<{ id: string; doc: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id, doc } = await params;
  const supabase = await createClient();
  const [{ data: candidate }, { data: row }, { data: me }] = await Promise.all([
    supabase.from("candidates").select("full_name, organisations(name)").eq("id", id).maybeSingle(),
    supabase.from("candidate_signings").select("status, snapshot, state, company, sent_at, signed_at, countersigned_at").eq("candidate_id", id).eq("doc_key", doc).maybeSingle(),
    supabase.from("users").select("full_name").eq("id", context.userId).maybeSingle(),
  ]);
  if (!candidate || !row) notFound();
  const snap = row.snapshot as Snapshot;
  const company = (candidate.organisations as unknown as { name: string } | null)?.name ?? "";
  const status = row.status as string;

  return (
    <DashboardShell
      title={`${snap.title}: ${candidate.full_name as string}`}
      context={context}
      back={{ href: `/org/recruitment/${id}`, label: candidate.full_name as string }}
    >
      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Sent {formatDate(row.sent_at as string)}.{" "}
          {status === "sent"
            ? "Not signed yet."
            : status === "signed"
              ? `Signed by them ${formatDate(row.signed_at as string)}.`
              : `Signed by them ${formatDate(row.signed_at as string)}, and ${snap.countersigned ? "by you" : "accepted"} ${formatDate(row.countersigned_at as string)}.`}
        </p>
        {status === "signed" && (
          <Countersign candidateId={id} docKey={doc} countersigned={snap.countersigned} defaultName={(me?.full_name as string | null) ?? ""} />
        )}
        <SignedDocument
          parts={snap.parts}
          state={(row.state ?? {}) as Record<string, PartState>}
          company={(row.company as CompanySignature | null) ?? null}
          companyName={company}
        />
      </div>
    </DashboardShell>
  );
}
