import { STAFF_ROLES } from "@/lib/roles";
import Link from "next/link";
import { tierLabel } from "@/lib/organisations";
import { formatDate } from "@/lib/dates";
import { notFound } from "next/navigation";
import { Users, CheckCircle2, AlertTriangle, MoonStar, UserRoundX } from "lucide-react";
import { requireRole, isConsoleRole, type UserRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatTile } from "@/components/learner-ui";
import { isInactive30d, isNeverActive, loadOrgLearners } from "@/lib/org-learners";
import { LearnersTable } from "@/app/org/learners/learners-table";
import { EditOrgForm } from "./edit-org-form";
import { OrgAdmins, type OrgPerson } from "./org-admins";
import { OrgNudgeButton } from "../../org-nudge-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { siteOrigin } from "@/lib/site-url";
import { IntegrationPanel } from "./integration-panel";
import { RemoveOrganisation } from "./remove-organisation";

// Removing an organisation deletes every account and file it holds, which
// runs longer than an ordinary page action.
export const maxDuration = 300;

/** The page in parts: what is going on, who is in it, how it is set up, how it connects. */
const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "learners", label: "Learners" },
  { key: "settings", label: "Settings" },
  { key: "integration", label: "Integration" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

export default async function OrganisationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const context = await requireRole("platform_admin");
  const { id } = await params;
  const { section: sectionParam } = await searchParams;
  // One page used to carry the stats, the admins, every learner and the
  // settings form in a single scroll; on a 260-learner organisation that was
  // a page nobody reached the bottom of (Saj, 24 Oct 2026).
  const section: Section = SECTIONS.some((s) => s.key === sectionParam)
    ? (sectionParam as Section)
    : "overview";

  const supabase = await createClient();
  // Each section reads only what it shows. All three used to load on every
  // tab — every learner with their enrolments and certificates (the heaviest
  // read on the page) even to open the settings form, which needs a count.
  const showsLearners = section === "overview" || section === "learners";
  const [{ data: org }, staff, learners, settings, learnerCounts] = await Promise.all([
    supabase
      .from("organisations")
      .select(
        "id, name, package_tier, status, service_type, size_band",
      )
      .eq("id", id)
      .single(),
    section === "overview"
      ? supabase
          .from("users")
          .select("id, full_name, email, role, status, created_at")
          .eq("organisation_id", id)
          .order("created_at", { ascending: true })
          .then((r) => r.data ?? [])
      : [],
    showsLearners ? loadOrgLearners(supabase, id) : [],
    section === "settings"
      ? Promise.all([
          supabase
            .from("organisation_features")
            .select("feature_key, enabled, note")
            .eq("organisation_id", id),
          supabase.from("tier_features").select("tier_key, feature_key"),
        ]).then(([o, t]) => ({ overrides: o.data ?? [], ticks: t.data ?? [] }))
      : { overrides: [], ticks: [] },
    // The settings tab still shows how many learners there are, and the
    // form checks the size band against current staff — counted, not loaded.
    showsLearners
      ? null
      : Promise.all([
          supabase
            .from("users")
            .select("id", { count: "exact", head: true })
            .eq("organisation_id", id)
            .in("role", STAFF_ROLES),
          supabase
            .from("users")
            .select("id", { count: "exact", head: true })
            .eq("organisation_id", id)
            .in("role", STAFF_ROLES)
            .neq("status", "deactivated"),
        ]).then(([all, cur]) => ({ all: all.count ?? 0, current: cur.count ?? 0 })),
  ]);
  const { overrides, ticks } = settings;

  if (!org) notFound();

  // A manager's open request to change package, from their Account page.
  const { data: asks } = await supabase
    .from("package_change_requests")
    .select("id, to_tier, note, created_at")
    .eq("organisation_id", id)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  // The rostering integration (myroster.care): the key's dates, whether the
  // package lets it be used, and how many carers it has linked. The key
  // columns are read as the service role, as the API reads them.
  const integration =
    section === "integration"
      ? await (async () => {
          const admin = createAdminClient();
          const [{ data: keyRow }, enabled, { count: linked }, origin] = await Promise.all([
            admin
              .from("organisations")
              .select("integration_key_hash, integration_key_created_at, integration_key_last_used_at")
              .eq("id", id)
              .maybeSingle(),
            hasFeatureForOrg(admin, id, "platform.portal_api"),
            admin
              .from("users")
              .select("id", { count: "exact", head: true })
              .eq("organisation_id", id)
              .not("external_ref", "is", null),
            siteOrigin(),
          ]);
          return {
            hasKey: !!keyRow?.integration_key_hash,
            createdAt: (keyRow?.integration_key_created_at as string | null) ?? null,
            lastUsedAt: (keyRow?.integration_key_last_used_at as string | null) ?? null,
            enabled,
            linked: linked ?? 0,
            origin,
          };
        })()
      : null;

  const tierFeatures: Record<string, string[]> = {};
  for (const t of ticks) {
    (tierFeatures[t.tier_key as string] ??= []).push(t.feature_key as string);
  }

  const nowMs = new Date().getTime();
  // Deactivated accounts (leavers) stay in the table for their history, but
  // the headline numbers describe the current workforce only.
  const current = learners.filter((r) => r.status !== "deactivated");
  const learnerTotal = learnerCounts?.all ?? learners.length;
  const currentTotal = learnerCounts?.current ?? current.length;
  const assigned = current.reduce((n, r) => n + r.stats.assigned, 0);
  const completed = current.reduce((n, r) => n + r.stats.completed, 0);
  const completionPct = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
  const overdueLearners = current.filter((r) => r.stats.overdue > 0).length;
  // Was "no last_seen_at OR stale", which silently folded never-signed-in
  // staff into "Inactive 30d+" — the same org then read 223 here and 0 on the
  // org's own page under an identical label. Both sides now share one
  // definition and never-signed-in gets its own tile (issue #22).
  const inactive = current.filter((r) => isInactive30d(r, nowMs)).length;
  const neverActive = current.filter(isNeverActive).length;

  const person = (u: (typeof staff)[number]): OrgPerson => ({
    id: u.id,
    name: u.full_name || u.email || "Unnamed",
    email: u.email,
    role: u.role,
  });
  const admins = staff.filter((u) => isConsoleRole(u.role as UserRole)).map(person);
  // Only active learners can be usefully promoted — a leaver can't log in.
  const promotable = staff
    .filter((u) => u.role === "learner" && u.status !== "deactivated")
    .map(person);

  return (
    <DashboardShell title={org.name} context={context}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/platform/organisations"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Organisations
          </Link>
          <OrgNudgeButton orgId={org.id} />
        </div>

        {(asks ?? []).map((a) => (
          <div key={a.id as string} role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p>
              <strong>Asked to move to {tierLabel(a.to_tier as string)}</strong> on{" "}
              {formatDate(a.created_at as string, { day: "numeric", month: "long", year: "numeric" })}.{" "}
              Set the package under{" "}
              <Link href={`/platform/organisations/${org.id}?section=settings`} className="font-medium underline">
                Settings
              </Link>{" "}
              once it&apos;s agreed; the request closes when you save it.
            </p>
            {a.note && <p className="mt-1 text-amber-900">Their note: {a.note as string}</p>}
          </div>
        ))}

        <nav aria-label="Sections" className="flex items-center gap-1 border-b">
          {SECTIONS.map((s) => (
            <Link
              key={s.key}
              href={`/platform/organisations/${org.id}?section=${s.key}`}
              aria-current={s.key === section ? "page" : undefined}
              className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors ${
                s.key === section
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
              {s.key === "learners" && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{learnerTotal}</span>
              )}
            </Link>
          ))}
        </nav>

        {section === "overview" && (
          <>
            {/* Engagement at a glance */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Learners" value={current.length} icon={Users} color="#0284c7" />
              <StatTile label="Assigned training complete" value={`${completionPct}%`} icon={CheckCircle2} color="#10b981" hint={`${completed} of ${assigned} courses`} />
              <StatTile label="With overdue" value={overdueLearners} icon={AlertTriangle} color="#ef4444" />
              <StatTile label="Inactive 30d+" value={inactive} icon={MoonStar} color="#8b5cf6" />
              <StatTile label="Never signed in" value={neverActive} icon={UserRoundX} color="#e11d48" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Admins</CardTitle>
                <CardDescription>
                  Who can manage this organisation. Role changes apply when that
                  person&apos;s session next refreshes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OrgAdmins orgId={org.id} admins={admins} promotable={promotable} />
              </CardContent>
            </Card>
          </>
        )}

        {section === "learners" && (
          <Card>
            <CardHeader>
              <CardTitle>Learners</CardTitle>
              <CardDescription>
                {learners.length} in this organisation. Filter by status or
                activity, including deactivated accounts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Its own page now, so no scroll cap: the cap existed because
                  a few hundred rows buried the settings form beneath them
                  (issues #19/#20). */}
              {learners.length > 0 ? (
                <LearnersTable rows={learners} readOnly />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No learners yet.</p>
              )}
            </CardContent>
          </Card>
        )}

        {section === "settings" && (
          <Card>
            <CardHeader>
              <CardTitle>Organisation settings</CardTitle>
              <CardDescription>
                Package, size, agreed amount, and any features that differ from
                the package.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EditOrgForm
                org={{
                  id: org.id,
                  name: org.name,
                  package_tier: org.package_tier,
                  status: org.status,
                  service_type: org.service_type,
                  size_band: org.size_band,
                  learners: currentTotal,
                  overrides: overrides.map((o) => ({
                    feature: o.feature_key as string,
                    enabled: o.enabled as boolean,
                    note: (o.note as string | null) ?? null,
                  })),
                }}
                tierFeatures={tierFeatures}
              />
            </CardContent>
          </Card>
        )}

        {section === "settings" && (
          <Card className="border-rose-200">
            <CardHeader>
              <CardTitle>Remove organisation</CardTitle>
              <CardDescription>
                Records are kept for as long as an organisation uses the platform, and removed when it leaves.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RemoveOrganisation orgId={org.id} name={org.name} suspended={org.status === "suspended"} />
            </CardContent>
          </Card>
        )}

        {section === "integration" && integration && (
          <Card>
            <CardHeader>
              <CardTitle>Rostering integration</CardTitle>
              <CardDescription>
                Lets the organisation&apos;s myroster.care account send its carers in as learners,
                assign their training, and read back their records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className={`rounded-lg p-3 text-sm ${integration.enabled ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-900"}`}>
                {integration.enabled
                  ? "Included for this organisation, so a valid key works."
                  : "Not included in this organisation's package, so even a valid key is refused. Switch on Rostering portal integration under Settings first."}
              </p>
              <IntegrationPanel
                orgId={org.id}
                orgName={org.name}
                hasKey={integration.hasKey}
                createdAt={integration.createdAt}
                lastUsedAt={integration.lastUsedAt}
                origin={integration.origin}
              />
              <p className="text-sm text-muted-foreground">
                {integration.linked > 0
                  ? `${integration.linked} learner${integration.linked === 1 ? "" : "s"} linked to the portal.`
                  : "No learners linked to the portal yet."}
              </p>
            </CardContent>
          </Card>
        )}

      </div>
    </DashboardShell>
  );
}
