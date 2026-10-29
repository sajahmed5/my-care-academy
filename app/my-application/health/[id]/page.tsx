import type { Metadata } from "next";
import Link from "next/link";
import { requireCandidate } from "@/lib/auth";
import { loadStarterAction } from "../../actions";
import { StarterForm } from "./starter-form";

export const metadata: Metadata = { title: "Health, equality and DBS form" };

/** The candidate fills in the health, equality and DBS form, after their offer. */
export default async function StarterFormPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCandidate();
  const { id } = await params;
  const loaded = await loadStarterAction(id);
  if ("error" in loaded) {
    return (
      <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-5 py-10">
        <h1 className="text-xl font-semibold">This form isn&apos;t open</h1>
        <p className="mt-2 text-sm text-muted-foreground">{loaded.error}</p>
        <Link href="/my-application" className="mt-4 text-sm font-medium text-primary underline">Back to your application</Link>
      </div>
    );
  }
  return <StarterForm candidateId={id} initial={loaded.answers} note={loaded.note} />;
}
