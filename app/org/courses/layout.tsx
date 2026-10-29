import { requireConsole } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

/**
 * The Courses area (renamed from Course coverage, design doc v2) — three
 * sub-pages navigated from the left panel: Overview (/org/courses),
 * Statistics (/statistics), Admin (/admin).
 */
export default async function CoursesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireConsole();
  return (
    <DashboardShell title="Courses" context={context}>
      <div className="space-y-6">{children}</div>
    </DashboardShell>
  );
}
