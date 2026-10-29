import Link from "next/link";
import {
  Building2,
  Users,
  Award,
  Target,
  BadgePoundSterling,
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
import { loadPlatformAnalytics, gbp } from "@/lib/platform-analytics";
import {
  TierMixChart,
  CategoryBarChart,
  CoursePopularityChart,
} from "./charts";

export default async function AnalyticsPage() {
  const context = await requireRole("platform_admin");
  const supabase = await createClient();
  const a = await loadPlatformAnalytics(supabase);

  return (
    <DashboardShell title="Analytics" context={context}>
      <div className="space-y-6">
        <Link href="/platform" className="text-sm text-muted-foreground hover:underline">
          ← Overview
        </Link>

        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="MRR at list price" value={gbp(a.mrr)} icon={BadgePoundSterling} color="#16a34a" hint="Before any Stripe discounts" />
          <StatTile label="Organisations" value={a.totals.orgs} icon={Building2} color="#0284c7" />
          <StatTile label="Learners" value={a.totals.learners} icon={Users} color="#7c3aed" />
          <StatTile label="Certificates" value={a.totals.certificates} icon={Award} color="#f59e0b" />
          <StatTile label="Pass rate" value={`${a.totals.passRate}%`} icon={Target} color="#ef4444" />
        </div>


        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Package mix</CardTitle>
              <CardDescription>Organisations by plan tier.</CardDescription>
            </CardHeader>
            <CardContent>
              <TierMixChart data={a.tierMix} />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {a.adoption.map((f) => (
                  <span key={f.key}>
                    {f.label}: {f.organisations}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Completions by month</CardTitle>
              <CardDescription>Certificates issued across all orgs.</CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryBarChart data={a.completionsByMonth} color="#0d9488" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Most popular courses</CardTitle>
            <CardDescription>
              Top courses by enrolments across every organisation (with completions).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CoursePopularityChart data={a.coursePopularity} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>Organisations by Stripe subscription status.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-sm">
              {a.subStatus.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1"
                >
                  <span className="capitalize">{s.label}</span>
                  <span className="font-semibold">{s.value}</span>
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {a.totals.assessments} assessments taken · {a.totals.passRate}% passed.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
