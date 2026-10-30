import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  dashboardPathForRole,
  getUserContext,
  isConsoleRole,
  memberStatus,
  requireAdminMfa,
} from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { PACKAGE_TIERS, TIER_DETAILS, tierLabel } from "@/lib/organisations";
import { LIST_PRICE_GBP } from "@/lib/pricing";
import { STAFF_ROLES } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { trialState } from "@/lib/trial";
import { ChangePackage } from "@/app/org/billing/change-package";
import { SameTeam } from "@/components/same-team";

export const metadata = { title: "Trial ended" };

const longDate = { weekday: "long", day: "numeric", month: "long" } as const;

/**
 * Where everyone in a company goes once its free trial has ended (TRIAL.md):
 * the whole company pauses, its records kept for 30 days. A manager can ask
 * for a package from here; office staff and carers are told to speak to
 * their manager. Sent here by assertActiveMember (lib/auth.ts).
 */
export default async function TrialEndedPage() {
  const context = await getUserContext();
  if (!context) redirect("/login");
  if (context.role === "platform_admin" || !context.organisationId) redirect(dashboardPathForRole(context.role));

  const member = await memberStatus(context.userId, context.organisationId);
  if (member.status === "deactivated" || member.orgStatus === "suspended") redirect("/suspended");
  const trial = trialState(member.trialEndsAt);
  if (trial.kind !== "ended") redirect(dashboardPathForRole(context.role));
  if (isConsoleRole(context.role)) await requireAdminMfa();

  const orgId = context.organisationId;
  const supabase = await createClient();
  const { data: org } = await supabase.from("organisations").select("name, package_tier").eq("id", orgId).maybeSingle();
  const orgName = (org?.name as string | undefined) ?? "Your company";
  const endedOn = formatDate(trial.endsAt, longDate);
  const keptUntil = formatDate(trial.removeAt, longDate);

  if (context.role !== "org_admin") {
    return (
      <AuthShell
        title="Your company's trial has ended"
        description={
          <>
            {orgName}&apos;s free trial of My Care Academy ended on {endedOn}. Your training records and
            certificates are kept safe. Speak to your manager about carrying on: you&apos;ll be able to sign in
            again as soon as they do.
          </>
        }
      >
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </AuthShell>
    );
  }

  // What they did in the week, counted as the service role and held to
  // their own organisation.
  const admin = createAdminClient();
  const count = (table: string, roles?: readonly string[]) => {
    let q = admin.from(table).select("id", { count: "exact", head: true }).eq("organisation_id", orgId);
    if (roles) q = q.in("role", roles);
    return q.then((r) => r.count ?? 0);
  };
  const [staff, certificates, candidates, supervisions, checks, { data: openAsk }] = await Promise.all([
    count("users", STAFF_ROLES),
    count("certificates"),
    count("candidates"),
    count("supervisions"),
    count("competency_checks"),
    supabase
      .from("package_change_requests")
      .select("to_tier, created_at")
      .eq("organisation_id", orgId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const used = [
    { value: staff, label: staff === 1 ? "member of staff" : "staff added" },
    { value: certificates, label: certificates === 1 ? "course completed" : "courses completed" },
    { value: candidates, label: candidates === 1 ? "candidate in recruitment" : "candidates in recruitment" },
    { value: supervisions + checks, label: "staff audits recorded" },
  ];

  return (
    <div className="min-h-svh bg-background">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <span className="rounded-md bg-white px-2 py-1">
            <Logo width={130} eager />
          </span>
          <form action="/auth/signout" method="post" className="ml-auto">
            <Button type="submit" variant="outline" size="sm" className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-white">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <div>
          <p className="text-sm text-muted-foreground">{orgName}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Your free trial has ended</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Your trial ended at the end of {endedOn}. Everything you set up is kept until{" "}
            <strong className="text-foreground">{keptUntil}</strong>. Choose a package before then to carry on where
            you left off. After that date, your company&apos;s records are removed.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>During your trial</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {used.map((u) => (
                <div key={u.label}>
                  <dd className="text-2xl font-bold">{u.value}</dd>
                  <dt className="text-sm text-muted-foreground">{u.label}</dt>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Choose a package</CardTitle>
            <CardDescription>
              We&apos;ll be in touch within one working day to set it up, and you&apos;ll be back in straight away.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePackage
              trial
              current={(org?.package_tier as string | undefined) ?? "full"}
              preselect={null}
              asked={
                openAsk
                  ? {
                      label: tierLabel(openAsk.to_tier as string),
                      on: formatDate(openAsk.created_at as string, { day: "numeric", month: "long", year: "numeric" }),
                    }
                  : null
              }
              options={PACKAGE_TIERS.map((t) => ({
                value: t.value,
                label: t.label,
                price: LIST_PRICE_GBP[t.value],
                points: TIER_DETAILS[t.value].features.slice(0, 4),
              }))}
            />
          </CardContent>
        </Card>

        <SameTeam context={context} layout="row" hideable={false} />
      </main>
    </div>
  );
}
