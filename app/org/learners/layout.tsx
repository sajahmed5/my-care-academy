import { requireConsole } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

/**
 * The Learners area is three sub-pages — Overview (/org/learners),
 * Statistics (/statistics), Admin (/admin) — navigated from the left
 * panel's sub-headings (design doc v2). Child pages render content only.
 */
export default async function LearnersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireConsole();
  return (
    <DashboardShell title="Learners" context={context}>
      <div className="mx-auto max-w-6xl space-y-6">{children}</div>
    </DashboardShell>
  );
}
