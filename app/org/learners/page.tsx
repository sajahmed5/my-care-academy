import Link from "next/link";
import { Plus } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { enabledMap } from "@/lib/entitlements";
import { isActiveLearner, loadOrgLearners } from "@/lib/org-learners";
import { checkPill, loadStaffChecks } from "@/lib/staff-checks";
import { FILTERS, needsAttention, type Filter, type StaffRow } from "@/lib/staff-list";
import { CHECK_ORDER } from "@/lib/staff-checks";
import { LearnersTable } from "./learners-table";
import { MatrixExport } from "../matrix-export";

/**
 * Staff (docs/redesign image 3): everyone, with their training, supervision
 * and appraisal on one line, and the whole row opening their file. The
 * headline tiles that sat above the table are gone; the count under the
 * title says how many need looking at.
 */
export default async function StaffListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const context = await requireConsole();
  const orgId = context.organisationId!;
  const { filter, q } = await searchParams;
  const initialFilter: Filter = FILTERS.includes(filter as Filter) ? (filter as Filter) : "all";
  const now = new Date();

  const supabase = await createClient();
  const [allRows, { data: organisation }, enabled, people, employment] = await Promise.all([
    loadOrgLearners(supabase, orgId),
    supabase.from("organisations").select("name").eq("id", orgId).single(),
    enabledMap(context),
    // Their role, for the line under the name. Paged past 1,000.
    fetchAll((f, t) => supabase.from("users").select("id, role").eq("organisation_id", orgId).order("id").range(f, t)),
    // Their job title, where the HR pack has one.
    fetchAll((f, t) => supabase.from("staff_employment").select("user_id, job_title").eq("organisation_id", orgId).order("user_id").range(f, t)).catch(() => []),
  ]);
  const active = allRows.filter(isActiveLearner);
  const checks = enabled["people.supervisions"]
    ? await loadStaffChecks(supabase, orgId, active.map((r) => ({ id: r.id, name: r.name })), now)
    : null;

  const roleOf = new Map(people.map((u) => [u.id as string, u.role as string]));
  const titleOf = new Map(employment.map((e) => [e.user_id as string, (e.job_title as string | null) ?? null]));
  const pill = (row: ReturnType<typeof checkPill> & { order?: number }, status: string) => ({
    ...row,
    late: status === "overdue" || status === "never",
    order: CHECK_ORDER.indexOf(status as (typeof CHECK_ORDER)[number]),
  });
  const rows: StaffRow[] = allRows.map((r) => {
    const c = checks?.get(r.id);
    return {
      ...r,
      role: roleOf.get(r.id) ?? null,
      jobTitle: titleOf.get(r.id) ?? null,
      supervision: c ? pill(checkPill(c.supervision, now), c.supervision.status) : null,
      appraisal: c ? pill(checkPill(c.appraisal, now), c.appraisal.status) : null,
    };
  });
  const attention = rows.filter(needsAttention).length;
  const name = organisation?.name ?? "org";

  return (
    <DashboardShell
      title="Staff"
      context={context}
      header={
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">Staff</h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              {rows.length} {rows.length === 1 ? "person" : "people"}
              {attention > 0 && (
                <>
                  {" · "}
                  <Link href="/org/learners?filter=attention" className="font-semibold text-foreground hover:underline">
                    {attention} need{attention === 1 ? "s" : ""} attention
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/org/learners/statistics" className="inline-flex h-11 items-center rounded-xl border bg-card px-4 text-[15px] font-bold transition-colors hover:bg-muted">
              Training matrix
            </Link>
            <Link href="/org/learners/admin?section=invite" className="inline-flex h-11 items-center rounded-xl border bg-card px-4 text-[15px] font-bold transition-colors hover:bg-muted">
              Import
            </Link>
            <Link href="/org/learners/admin?section=invite" className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary-hover">
              <Plus className="size-4" aria-hidden />
              Add staff
            </Link>
          </div>
        </div>
      }
    >
      {/* Keyed on the filter and the search so a link re-selects them — the
          table holds its own state and would otherwise survive the same-page
          navigation unchanged. */}
      <LearnersTable key={`${initialFilter}:${q ?? ""}`} rows={rows} initialFilter={initialFilter} initialQuery={q ?? ""} filename={`${name}-staff.csv`} />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-card border bg-card px-5 py-4">
        <div>
          <p className="font-bold">Training matrix as a spreadsheet</p>
          <p className="text-sm text-muted-foreground">Every person against every course, for an inspector or your own records.</p>
        </div>
        <MatrixExport filename={`${name}-training-matrix.csv`} />
      </div>
    </DashboardShell>
  );
}
