import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { STAFF_ROLES } from "@/lib/roles";
import { hasCaseAccess } from "@/lib/hr/case-access";
import { personName } from "@/lib/hr/server";
import { NewCaseForm } from "./new-case-form";

/**
 * Open a case. From a link elsewhere (a complaint, a spot check, an absence
 * trigger, a probation review), the person and what it's linked to come
 * filled in.
 */
export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; kind?: string; subtype?: string; from?: string; fromId?: string; label?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const q = await searchParams;
  const admin = createAdminClient();
  const allowed = await hasCaseAccess(admin, context);
  // Every active member of staff: the server returns 1,000 rows a request.
  const people = await fetchAll((f, t) =>
    admin
      .from("users")
      .select("id, full_name, email, role")
      .eq("organisation_id", context.organisationId!)
      .in("role", STAFF_ROLES)
      .eq("status", "active")
      .order("full_name")
      .order("id")
      .range(f, t),
  );
  const list = (people ?? []).filter((p) => p.id !== context.userId).map((p) => ({ id: p.id as string, name: personName(p as never) }));
  return (
    <DashboardShell title="Open a case" context={context} back={{ href: "/org/hr/cases", label: "Cases" }}>
      {allowed ? (
        <NewCaseForm
          people={list}
          about={(people ?? []).map((p) => ({ id: p.id as string, name: personName(p as never) }))}
          initial={{
            kind: q.kind === "grievance" ? "grievance" : "disciplinary",
            subtype: q.subtype === "capability" ? "capability" : "conduct",
            userId: q.user ?? "",
            linkedType: q.from ?? "",
            linkedId: q.fromId ?? "",
            linkedLabel: q.label ?? "",
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Only managers, and office workers a manager has named, can open a case.</p>
      )}
    </DashboardShell>
  );
}
