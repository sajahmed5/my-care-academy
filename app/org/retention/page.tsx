import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteStaffButton } from "@/app/org/delete-staff-button";
import { RETENTION_YEARS, keptUntil, retentionCutoff } from "@/lib/retention";
import { formatDate } from "@/lib/dates";
import { RetentionDelete } from "./delete-button";
import { deleteRetainedComplaintAction, deleteRetainedIncidentAction } from "./actions";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "long", year: "numeric" });

/**
 * What has passed 7-year retention (lib/retention.ts), for a manager to
 * delete. Nothing is deleted automatically: a provider may be holding a
 * record for a claim or an investigation, and that is a person's call.
 */
export default async function RetentionPage() {
  const context = await requireRole("org_admin");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const cutoff = retentionCutoff(new Date());

  const [{ data: leavers }, { data: complaints }, { data: incidents }] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, email, deactivated_at")
      .eq("organisation_id", orgId)
      .eq("status", "deactivated")
      .lt("deactivated_at", cutoff)
      .order("deactivated_at")
      .limit(500),
    supabase
      .from("complaints")
      .select("id, reference, status, closed_on")
      .eq("organisation_id", orgId)
      .neq("status", "open")
      .lt("closed_on", cutoff)
      .order("closed_on")
      .limit(500),
    supabase
      .from("incidents")
      .select("id, kind, summary, closed_on")
      .eq("organisation_id", orgId)
      .eq("status", "closed")
      .lt("closed_on", cutoff)
      .order("closed_on")
      .limit(500),
  ]);

  const none = !leavers?.length && !complaints?.length && !incidents?.length;

  return (
    <DashboardShell title="Records past retention" context={context}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/org/billing" className="text-sm text-muted-foreground hover:underline">
          ← Account
        </Link>
        <p className="text-sm text-muted-foreground">
          Records are kept for {RETENTION_YEARS} years: a leaver&apos;s file for {RETENTION_YEARS} years after they left, a
          complaint or incident for {RETENTION_YEARS} years after it closed. Anything past that is listed here for you to
          delete. Nothing is deleted automatically — keep a record longer if it is needed for a claim or an investigation.
        </p>

        {none && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nothing has passed retention. The first records reach it {RETENTION_YEARS} years after someone leaves or a
              complaint closes.
            </CardContent>
          </Card>
        )}

        {!!leavers?.length && (
          <Card>
            <CardHeader>
              <CardTitle>Leavers</CardTitle>
              <CardDescription>
                Deleting removes their account and everything on their file: training, certificates, supervisions,
                spot checks and documents.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {leavers.map((u) => (
                <div key={u.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {(u.full_name as string | null) || (u.email as string)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      left {fmt(u.deactivated_at as string)} · kept until {fmt(keptUntil(u.deactivated_at as string))}
                    </span>
                  </span>
                  <DeleteStaffButton userId={u.id as string} name={(u.full_name as string | null) || (u.email as string)} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!!complaints?.length && (
          <Card>
            <CardHeader>
              <CardTitle>Complaints</CardTitle>
              <CardDescription>Deleting removes the record, its stages, actions and documents.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {complaints.map((c) => (
                <div key={c.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {c.reference as string}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.status as string} {fmt(c.closed_on as string)}
                    </span>
                  </span>
                  <RetentionDelete id={c.id as string} label={c.reference as string} action={deleteRetainedComplaintAction} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!!incidents?.length && (
          <Card>
            <CardHeader>
              <CardTitle>Incidents &amp; accidents</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {incidents.map((i) => (
                <div key={i.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {i.summary as string}
                    <span className="ml-2 text-xs text-muted-foreground">closed {fmt(i.closed_on as string)}</span>
                  </span>
                  <RetentionDelete id={i.id as string} label="this incident" action={deleteRetainedIncidentAction} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
