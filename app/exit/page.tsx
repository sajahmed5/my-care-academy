import type { Metadata } from "next";
import { loadExitAction, submitExitAction } from "./actions";
import { ExitForm } from "@/components/hr/exit-form";

export const metadata: Metadata = { title: "Leaving: a few questions", robots: { index: false } };

/** The exit interview, from the emailed link (HR-PACK.md). */
export default async function ExitPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  const loaded = await loadExitAction(t);
  async function submit(answers: unknown) {
    "use server";
    return submitExitAction(t, answers);
  }
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-10">
      {!loaded.ok ? (
        <p className="text-sm">{loaded.error}</p>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-muted-foreground">{loaded.company}</p>
            <h1 className="text-xl font-semibold">A few questions as you leave</h1>
            <p className="text-sm text-muted-foreground">Hi {loaded.name}. Your answers help make it better for the people who come after you. Only the office reads them.</p>
          </div>
          <ExitForm submit={submit} />
        </>
      )}
    </main>
  );
}
