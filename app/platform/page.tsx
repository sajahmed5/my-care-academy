import Link from "next/link";
import {
  Building2,
  Activity,
  MoonStar,
  Users,
  CheckCircle2,
  Award,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatTile } from "@/components/learner-ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { loadOrgEngagement } from "@/lib/platform-orgs";
import { completionsByWeek } from "@/lib/org-learners";
import { CompletionsChart } from "@/app/org/completions-chart";
import { InviteOrgForm } from "./invite-org-form";
import { InviteAdminForm } from "./invite-admin-form";
import { OrgNudgeButton } from "./org-nudge-button";

export default async function PlatformDashboard() {
  const context = await requireRole("platform_admin");

  const supabase = await createClient();
  const [{ orgs, totals }, weekly] = await Promise.all([
    loadOrgEngagement(supabase),
    completionsByWeek(supabase, 12),
  ]);

  const needsAttention = orgs
    .filter(
      (o) =>
        o.status !== "suspended" &&
        (o.dormant || (o.assigned > 0 && o.completionPct < 50)),
    )
    .slice(0, 6);

  return (
    <DashboardShell title="Platform console" context={context}>
      <div className="space-y-8">
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Organisations" value={totals.orgs} icon={Building2} color="#0284c7" href="/platform/organisations" />
          <StatTile label="Active" value={totals.activeOrgs} icon={Activity} color="#10b981" />
          <StatTile label="Dormant" value={totals.dormantOrgs} icon={MoonStar} color="#8b5cf6" />
          <StatTile label="Learners" value={totals.learners} icon={Users} color="#7c3aed" />
          <StatTile label="Completions" value={totals.completions} icon={Award} color="#0d9488" />
          <StatTile label="Completion" value={`${totals.completionPct}%`} icon={CheckCircle2} color="#16a34a" />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Completions trend</CardTitle>
              <CardDescription>Courses completed across all orgs.</CardDescription>
            </CardHeader>
            <CardContent>
              <CompletionsChart data={weekly} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Needs attention</CardTitle>
                <CardDescription>Dormant or low-completion orgs.</CardDescription>
              </div>
              <Link
                href="/platform/organisations"
                className="text-sm text-primary hover:underline"
              >
                All organisations →
              </Link>
            </CardHeader>
            <CardContent>
              {needsAttention.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Every organisation is engaged ✓
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {needsAttention.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <Link
                        href={`/platform/organisations/${o.id}`}
                        className="min-w-0 truncate hover:underline"
                      >
                        {o.name}
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        {o.dormant && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
                            dormant
                          </span>
                        )}
                        {o.assigned > 0 && o.completionPct < 50 && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                            {o.completionPct}%
                          </span>
                        )}
                        <OrgNudgeButton orgId={o.id} size="xs" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Manage</CardTitle>
              <CardDescription>
                Organisations, courses, billing and automation.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/platform/organisations" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Organisations
              </Link>
              <Link href="/platform/courses" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Courses
              </Link>
              <Link href="/platform/billing" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Billing
              </Link>
              <Link href="/platform/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Automation
              </Link>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Invite an organisation</CardTitle>
              <CardDescription>
                Creates the org and invites its first administrator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InviteOrgForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add a platform admin</CardTitle>
              <CardDescription>
                Grants another member of your team global access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InviteAdminForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
