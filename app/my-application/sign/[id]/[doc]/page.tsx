import type { Metadata } from "next";
import Link from "next/link";
import { requireCandidate } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PartState, Snapshot } from "@/lib/signing-documents";
import { SignDocument } from "./sign-document";

export const metadata: Metadata = { title: "Read and sign" };

/** The candidate reads one document, part by part, and signs each. */
export default async function SignPage({ params }: { params: Promise<{ id: string; doc: string }> }) {
  const context = await requireCandidate();
  const { id, doc } = await params;
  const admin = createAdminClient();
  const { data: c } = await admin.from("candidates").select("user_id, status, full_name, organisations(name)").eq("id", id).maybeSingle();
  const { data: row } =
    c?.user_id === context.userId
      ? await admin.from("candidate_signings").select("status, snapshot, state").eq("candidate_id", id).eq("doc_key", doc).maybeSingle()
      : { data: null };
  if (!c || !row || c.status !== "candidate") {
    return (
      <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-5 py-10">
        <h1 className="text-xl font-semibold">This document isn&apos;t open</h1>
        <p className="mt-2 text-sm text-muted-foreground">It hasn&apos;t been sent to you, or your application has closed.</p>
        <Link href="/my-application" className="mt-4 text-sm font-medium text-primary underline">Back to your application</Link>
      </div>
    );
  }
  return (
    <SignDocument
      candidateId={id}
      docKey={doc}
      company={(c.organisations as unknown as { name: string } | null)?.name ?? ""}
      fullName={c.full_name as string}
      snapshot={row.snapshot as Snapshot}
      initialState={(row.state ?? {}) as Record<string, PartState>}
      signed={row.status !== "sent"}
    />
  );
}
