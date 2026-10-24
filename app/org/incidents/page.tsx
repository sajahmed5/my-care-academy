import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { StatTile } from "@/components/learner-ui";
import { AlertTriangle, FolderOpen, Search } from "lucide-react";
import { loadIncidents } from "@/lib/incidents";
import { RecordIncident } from "./record-incident";
import { RegisterRow } from "./register-row";

/**
 * The complaints, accidents and safeguarding register.
 *
 * One list for the whole organisation, newest first, with the counts an
 * inspector opens with: how many are still open, and how many are being
 * looked into. Who was involved is tagged from a carer's own file, which is
 * where the training suggestions live too.
 */
export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "complaints.register");

  const { status } = await searchParams;
  const supabase = await createClient();
  const incidents = await loadIncidents(supabase, context.organisationId);

  const open = incidents.filter((i) => i.status === "open").length;
  const investigating = incidents.filter((i) => i.status === "investigating").length;
  const shown = status
    ? incidents.filter((i) => i.status === status)
    : incidents;

  return (
    <DashboardShell title="Complaints & incidents" context={context}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/org" className="text-sm text-muted-foreground hover:underline">
          ← Back to console
        </Link>

        <div className="grid grid-cols-3 gap-4">
          <StatTile
            label="All"
            value={incidents.length}
            icon={FolderOpen}
            color="#6366f1"
            href="/org/incidents"
            hint={status ? "Show all" : "Showing all"}
          />
          <StatTile
            label="Open"
            value={open}
            icon={AlertTriangle}
            color="#ef4444"
            href="/org/incidents?status=open"
            hint={status === "open" ? "Showing these" : undefined}
          />
          <StatTile
            label="Investigating"
            value={investigating}
            icon={Search}
            color="#f59e0b"
            href="/org/incidents?status=investigating"
            hint={status === "investigating" ? "Showing these" : undefined}
          />
        </div>

        <RecordIncident />

        {shown.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {incidents.length === 0
                ? "Nothing recorded yet. Complaints, accidents, near misses and safeguarding concerns all live here."
                : "Nothing with that status."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {shown.map((incident) => (
              <RegisterRow key={incident.id} incident={incident} />
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
