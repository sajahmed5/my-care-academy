import Link from "next/link";
import { Building2, Activity, MoonStar, CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatTile } from "@/components/learner-ui";
import { loadOrgEngagement } from "@/lib/platform-orgs";
import { OrgsTable } from "./orgs-table";
import { InviteOrgPanel } from "./invite-org-panel";

export default async function OrganisationsPage() {
  const context = await requireRole("platform_admin");
  const supabase = await createClient();
  const { orgs, totals } = await loadOrgEngagement(supabase);

  return (
    <DashboardShell title="Organisations" context={context}>
      <div className="space-y-6">
        <Link href="/platform" className="text-sm text-muted-foreground hover:underline">
          ← Overview
        </Link>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Organisations" value={totals.orgs} icon={Building2} color="#0284c7" />
          <StatTile label="Active" value={totals.activeOrgs} icon={Activity} color="#10b981" />
          <StatTile label="Dormant" value={totals.dormantOrgs} icon={MoonStar} color="#8b5cf6" />
          <StatTile label="Overall completion" value={`${totals.completionPct}%`} icon={CheckCircle2} color="#16a34a" />
        </div>

        {totals.outgrownOrgs > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            {totals.outgrownOrgs}{" "}
            {totals.outgrownOrgs === 1 ? "organisation has" : "organisations have"} more
            staff than the size band their price was agreed on. They&apos;re
            marked below — nothing changes until you update the band and amount
            on their page.
          </p>
        )}

        <InviteOrgPanel />

        <OrgsTable rows={orgs} />
      </div>
    </DashboardShell>
  );
}
