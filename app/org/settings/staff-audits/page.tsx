import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { enabledMap } from "@/lib/entitlements";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { lockedHref } from "@/lib/features";
import { COMPETENCY_FORMS, intervalLabel, type Interval } from "@/lib/audit-forms";
import { loadAuditForms } from "@/lib/audit-forms-data";
import { SkillSwitch } from "./skill-switch";

/**
 * Every Staff Audits form the company uses, with how often each falls due
 * (STAFF-AUDITS.md, Editable). Each starts as ours; a company changes any of
 * them, adds its own skills, or stops assessing one. Managers only, under Settings.
 */
export default async function AuditFormsPage() {
  const context = await requireRole("org_admin");
  const enabled = await enabledMap(context);
  const meetings = enabled["people.supervisions"];
  const checks = enabled["people.competency"];
  if (!meetings && !checks) redirect(lockedHref("people.supervisions"));
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [forms, { data: rows }] = await Promise.all([
    loadAuditForms(orgId),
    supabase.from("staff_audit_forms").select("kind, area_key, label, archived").eq("organisation_id", orgId).limit(200),
  ]);
  const changed = (kind: string, area = "") => (rows ?? []).some((r) => r.kind === kind && r.area_key === area && !r.archived);
  const stopped = (rows ?? []).filter((r) => r.kind === "competency" && r.archived);

  const row = (href: string, title: string, detail: string, due: Interval, isChanged: boolean, extra?: React.ReactNode) => (
    <div key={href} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <div>
        <Link href={href} className="font-medium text-primary hover:underline">
          {title}
        </Link>
        <p className="text-xs text-muted-foreground">
          {detail} · {intervalLabel(due).toLowerCase()} · {isChanged ? "changed by you" : "our default"}
        </p>
      </div>
      <span className="flex items-center gap-3">
        {extra}
        <Link href={href} className="text-sm font-medium text-primary hover:underline">
          Edit
        </Link>
      </span>
    </div>
  );

  return (
    <DashboardShell title="Staff audit forms" context={context} back={{ href: "/org/settings", label: "Settings" }}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          The questions on each audit, and how often it falls due. Each starts as ours — change any of them to suit how you work.
          Records already made keep the questions they were asked with.
        </p>

        {meetings && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Supervisions and appraisals</h2>
            <Card>
              <CardContent className="divide-y p-0">
                {row("/org/settings/staff-audits/edit?form=supervision", "Supervision", `${forms.supervision.questions.length} questions`, forms.supervision.due, changed("supervision"))}
                {row(
                  "/org/settings/staff-audits/edit?form=appraisal",
                  "Appraisal",
                  `${forms.appraisal.questions.length} questions, ${forms.appraisal.selfAssessment.length} in the self-assessment`,
                  forms.appraisal.due,
                  changed("appraisal"),
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {checks && (
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Spot checks and competency</h2>
              <Link href="/org/settings/staff-audits/edit?form=competency:new" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Plus className="size-4" /> Add a skill
              </Link>
            </div>
            <Card>
              <CardContent className="divide-y p-0">
                {row("/org/settings/staff-audits/edit?form=spot_check", "Spot check", `${forms.spotCheck.items.length} items`, forms.spotCheck.due, changed("spot_check"))}
                {forms.competency.map((f) =>
                  row(
                    `/org/settings/staff-audits/edit?form=competency:${f.key}`,
                    `Competency: ${f.label}`,
                    `${f.items.length} criteria${COMPETENCY_FORMS.some((d) => d.key === f.key) ? "" : " · your own skill"}`,
                    f.due,
                    changed("competency", f.key),
                    <SkillSwitch areaKey={f.key} archived={false} />,
                  ),
                )}
              </CardContent>
            </Card>
            {stopped.length > 0 && (
              <Card>
                <CardContent className="divide-y p-0">
                  {stopped.map((r) => (
                    <div key={r.area_key as string} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <span className="text-muted-foreground">
                        {(r.label as string | null) ?? (r.area_key as string)} — not assessed any more
                      </span>
                      <SkillSwitch areaKey={r.area_key as string} archived />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
