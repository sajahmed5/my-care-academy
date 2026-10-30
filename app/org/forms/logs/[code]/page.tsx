import { notFound } from "next/navigation";
import { FileDown, Sheet } from "lucide-react";
import { STAFF_ROLES } from "@/lib/roles";
import { requireConsole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loadFormTemplate, templateVisible } from "@/lib/form-library";
import { lineFlagged, loadLogEntries, logCell, logColumns } from "@/lib/form-logs";
import { ukToday } from "@/lib/form-reviews";
import { formatDate } from "@/lib/dates";
import { ViewFile } from "../../library/[code]/responses/[assignmentId]/view-file";
import { AddLogLine } from "./add-line";
import { RemoveLine } from "./remove-line";

const fmt = (d: string) => formatDate(`${d}T12:00:00Z`, { day: "numeric", month: "short", year: "numeric" });

/**
 * One log (FORMS.md): add a line, and read the whole log as one table —
 * newest first, narrowed to a date range, with readings outside their range
 * in red. Downloads as a spreadsheet or a PDF for the same range.
 */
export default async function LogPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "forms.builder");
  const [{ code: rawCode }, { from: rawFrom, to: rawTo }] = await Promise.all([params, searchParams]);
  const code = decodeURIComponent(rawCode);
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [enabled, template] = await Promise.all([enabledMap(context), loadFormTemplate(supabase, code)]);
  if (!template || !template.is_log) notFound();
  if (!templateVisible(template, enabled, orgId)) notFound();

  const date = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const from = date(rawFrom);
  const to = date(rawTo);
  const aboutClients = template.audience === "client";
  const [entries, { data: staffRows }, { data: clientRows }] = await Promise.all([
    loadLogEntries(supabase, { organisationId: orgId, templateId: template.id, from, to }),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .in("role", STAFF_ROLES)
      .order("full_name")
      .limit(1000),
    aboutClients
      ? supabase.from("clients").select("id, full_name").eq("status", "active").order("full_name").limit(2000)
      : Promise.resolve({ data: null }),
  ]);

  const staff = (staffRows ?? []).map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) }));
  if (!staff.some((s) => s.id === context.userId)) staff.unshift({ id: context.userId, name: "You" });
  const cols = logColumns(template.fields);
  const personLabel = template.log_person_label ?? "Done by";
  const today = ukToday(new Date());
  const range = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const base = `/org/forms/logs/${encodeURIComponent(template.code)}`;
  // Your own lines from the last day can be taken back out (RLS says the same).
  const dayAgo = new Date(new Date().getTime() - 86_400_000).toISOString();
  const flaggedCount = entries.filter((e) => lineFlagged(template.fields, e.answers)).length;

  return (
    <DashboardShell title={template.title} context={context} back={{ href: "/org/forms#logs", label: "Forms" }}>
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{template.title}</h2>
          {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
        </div>

        <AddLogLine
          templateId={template.id}
          fields={template.fields}
          personLabel={personLabel}
          staff={staff}
          clients={aboutClients ? (clientRows ?? []).map((c) => ({ id: c.id as string, name: c.full_name as string })) : null}
          meId={context.userId}
          today={today}
        />

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <form className="flex flex-wrap items-end gap-2" action={base}>
              <div className="space-y-1">
                <label htmlFor="from" className="text-xs font-medium text-muted-foreground">From</label>
                <Input id="from" type="date" name="from" defaultValue={from ?? ""} className="h-8 w-40" />
              </div>
              <div className="space-y-1">
                <label htmlFor="to" className="text-xs font-medium text-muted-foreground">To</label>
                <Input id="to" type="date" name="to" defaultValue={to ?? ""} className="h-8 w-40" />
              </div>
              <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>Show</button>
            </form>
            <div className="flex gap-2">
              <a href={`${base}/csv${range ? `?${range}` : ""}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Sheet className="size-4" />
                Spreadsheet
              </a>
              <a href={`${base}/pdf${range ? `?${range}` : ""}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <FileDown className="size-4" />
                PDF
              </a>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {entries.length} {entries.length === 1 ? "line" : "lines"}
            {from || to ? ` ${from ? `from ${fmt(from)}` : ""}${to ? ` to ${fmt(to)}` : ""}` : ""}
            {flaggedCount > 0 && <span className="font-medium text-rose-600"> · {flaggedCount} out of range</span>}
          </p>

          {entries.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">No lines yet.</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">{personLabel}</th>
                      {aboutClients && <th className="px-3 py-2 font-medium">Client</th>}
                      {cols.map((c) => (
                        <th key={c.label} className="px-3 py-2 font-medium">{c.label}</th>
                      ))}
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {entries.map((e) => {
                      const mine = e.recorded_by === context.userId && e.created_at > dayAgo;
                      return (
                        <tr key={e.id} className="align-top">
                          <td className="whitespace-nowrap px-3 py-2">{fmt(e.entry_date)}</td>
                          <td className="px-3 py-2">{e.person}</td>
                          {aboutClients && <td className="px-3 py-2">{e.client_name ?? "—"}</td>}
                          {cols.map((c) => {
                            const cell = logCell(c, e.answers);
                            return (
                              <td key={c.label} className={`whitespace-pre-wrap px-3 py-2 ${cell.flagged ? "font-semibold text-rose-600" : ""}`}>
                                {cell.text}
                                {cell.flagged && <span className="sr-only"> (out of range)</span>}
                                {cell.filePath && <ViewFile path={cell.filePath} />}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right">{mine && <RemoveLine entryId={e.id} code={template.code} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
