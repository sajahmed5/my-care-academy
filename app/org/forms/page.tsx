import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { FORM_AUDIENCES, categoryLabel, loadFormLibrary } from "@/lib/form-library";
import { fetchAll } from "@/lib/fetch-all";

/**
 * The organisation's forms, in the three kinds FORMS.md sets out: client
 * forms the office fills in about a client, carer forms asked of staff, and
 * company forms about the business. Carer forms show how many asks are open.
 * The old builder is still reachable under "your own forms" for anything
 * bespoke.
 */
export default async function OrgFormsPage() {
  const context = await requireConsole();
  await requireFeature(context, "forms.builder");

  const supabase = await createClient();
  const orgId = context.organisationId!;
  // The open asks do not depend on the library, so they are read alongside
  // it — by organisation, on the (organisation_id, completed_at) index, and
  // paged: "everyone" on a few forms passes the 1,000-row cap quickly.
  const [enabled, { data: org }, open] = await Promise.all([
    enabledMap(context),
    supabase.from("organisations").select("service_type").eq("id", orgId).single(),
    fetchAll<{ id: string; template_id: string }>((from, to) =>
      supabase
        .from("form_assignments")
        .select("id, template_id")
        .eq("organisation_id", orgId)
        .is("completed_at", null)
        .order("id")
        .range(from, to),
    ),
  ]);
  const templates = await loadFormLibrary(supabase, {
    enabled,
    serviceType: (org?.service_type as string | null) ?? null,
  });

  const openCount = new Map<string, number>();
  for (const a of open) {
    openCount.set(a.template_id as string, (openCount.get(a.template_id as string) ?? 0) + 1);
  }

  const kinds = FORM_AUDIENCES.map((a) => ({ ...a, items: templates.filter((t) => t.audience === a.value) })).filter(
    (k) => k.items.length > 0,
  );

  return (
    <DashboardShell title="Forms" context={context}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href="/org/forms/own" className="text-sm text-primary hover:underline">
            Your own forms →
          </Link>
        </div>

        {templates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nothing in the library for your service yet.
            </CardContent>
          </Card>
        ) : (
          kinds.map((k) => (
            <section key={k.value} className="space-y-2">
              <div>
                <h3 className="text-base font-semibold">{k.label}</h3>
                <p className="text-sm text-muted-foreground">{k.hint}</p>
              </div>
              <div className="space-y-2">
                {k.items.map((t) => (
                  <Card key={t.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-6">
                      <div className="flex min-w-0 items-start gap-3">
                        <ClipboardList className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0">
                          <Link href={`/org/forms/library/${t.code}`} className="font-medium hover:underline">
                            {t.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {t.description ?? categoryLabel(t.category)}
                          </p>
                        </div>
                      </div>
                      {(openCount.get(t.id) ?? 0) > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {openCount.get(t.id)} open
                        </span>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
