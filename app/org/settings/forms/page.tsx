import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FORM_AUDIENCES,
  SUMMARY_COLUMNS,
  loadFormChoices,
  templateVisible,
  toSummary,
  type FormTemplateSummary,
} from "@/lib/form-library";
import { SettingsShell } from "../settings-shell";
import { copyLibraryFormAction, setFormHiddenAction } from "./actions";
import { NewOwnForm, ReviewPeriod } from "./controls";

const STATUS: Record<string, { label: string; chip: string }> = {
  draft: { label: "Draft", chip: "bg-amber-100 text-amber-800" },
  published: { label: "In use", chip: "bg-teal-50 text-teal-800" },
  retired: { label: "Retired", chip: "bg-muted text-muted-foreground" },
};

const kindLabel = (t: Pick<FormTemplateSummary, "is_log" | "audience">) =>
  t.is_log ? "Log" : (FORM_AUDIENCES.find((a) => a.value === t.audience)?.label.replace(/s$/, "") ?? "Form");

/**
 * Settings → Forms (FORMS.md, "Editable"): our library is the starting
 * point. Switch any of ours off, set how often each is reviewed, make your
 * own copy of one to change, or build your own. Manager-only; the office
 * fills forms in from Documents → Forms.
 */
export default async function FormsSettingsPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "forms.builder");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [enabled, { data: rows }, choices, { data: org }] = await Promise.all([
    enabledMap(context),
    supabase
      .from("form_templates")
      .select(SUMMARY_COLUMNS)
      .or(`status.eq.published,organisation_id.eq.${orgId}`)
      .order("sort_order")
      .order("title")
      .limit(1000),
    loadFormChoices(supabase, orgId),
    supabase.from("organisations").select("service_type").eq("id", orgId).single(),
  ]);
  const summaries = (rows ?? []).map((r) => toSummary(r as Record<string, unknown>));
  const serviceType = (org?.service_type as string | null) ?? null;
  const ours = summaries.filter(
    (t) =>
      !t.organisation_id &&
      t.status === "published" &&
      templateVisible(t, enabled, orgId) &&
      (!t.service_types?.length || !serviceType || serviceType === "both" || t.service_types.includes(serviceType)),
  );
  const own = summaries.filter((t) => t.organisation_id === orgId);
  const copyOf = new Map(own.filter((t) => t.based_on_id).map((t) => [t.based_on_id as string, t]));
  const groups = [
    ...FORM_AUDIENCES.map((a) => ({ key: a.value, label: a.label, items: ours.filter((t) => !t.is_log && t.audience === a.value) })),
    { key: "logs", label: "Logs", items: ours.filter((t) => t.is_log) },
  ].filter((g) => g.items.length > 0);

  return (
    <SettingsShell context={context} active="/org/settings/forms">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <h3 className="text-sm font-semibold">Build a form of your own</h3>
            <p className="text-sm text-muted-foreground">
              Or make your own copy of one of ours below and change it. You can still ask us to build one for you.
            </p>
          </div>
          <NewOwnForm />
        </CardContent>
      </Card>

      {own.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Your own forms ({own.length})</h3>
          <Card>
            <CardContent className="divide-y p-0">
              {own.map((t) => {
                const base = t.based_on_id ? ours.find((o) => o.id === t.based_on_id) ?? summaries.find((o) => o.id === t.based_on_id) : null;
                return (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <Link href={`/org/settings/forms/${encodeURIComponent(t.code)}`} className="font-medium hover:underline">
                        {t.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {kindLabel(t)}
                        {base && ` · your copy of “${base.title}”${base.version > (t.based_on_version ?? 0) ? " — ours has been updated since" : ""}`}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[t.status]?.chip ?? ""}`}>
                      {STATUS[t.status]?.label ?? t.status}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      )}

      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h3 className="text-sm font-semibold">Our {g.label.toLowerCase()} ({g.items.length})</h3>
          <Card>
            <CardContent className="divide-y p-0">
              {g.items.map((t) => {
                const choice = choices.get(t.id);
                const copy = copyOf.get(t.id);
                const off = choice?.hidden === true;
                return (
                  <div key={t.id} className="space-y-2 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className={`font-medium ${off ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
                        {copy?.status === "published" && (
                          <span className="ml-2 rounded bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-800">Replaced by your copy</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={copyLibraryFormAction}>
                          <input type="hidden" name="templateId" value={t.id} />
                          <Button type="submit" size="sm" variant="outline">
                            {copy ? "Edit your copy" : "Make your own copy"}
                          </Button>
                        </form>
                        <form action={setFormHiddenAction}>
                          <input type="hidden" name="templateId" value={t.id} />
                          <input type="hidden" name="hidden" value={off ? "0" : "1"} />
                          <Button type="submit" size="sm" variant={off ? "default" : "ghost"}>
                            {off ? "Switch on" : "Switch off"}
                          </Button>
                        </form>
                      </div>
                    </div>
                    {!t.is_log && !off && !copy && (
                      <ReviewPeriod templateId={t.id} value={choice?.review_months ?? null} ours={t.review_months} />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        Switching a form off takes it out of your forms list; anything already filled in stays on record.{" "}
        <Link href="/org/forms" className={buttonVariants({ variant: "link", size: "sm" })}>Go to your forms</Link>
      </p>
    </SettingsShell>
  );
}
