import { STAFF_ROLES } from "@/lib/roles";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardPen } from "lucide-react";
import {
  FORM_AUDIENCES,
  categoryLabel,
  loadAssignmentsForTemplate,
  loadFormTemplate,
  templateVisible,
} from "@/lib/form-library";
import { loadRecordsForTemplate } from "@/lib/form-records";
import { startOwnFormAction } from "../../library-actions";
import { RecordList } from "../../record-list";
import { AssignForm } from "./assign-form";
import { AssignmentList } from "./assignment-list";

/**
 * One form, as the office sees it. A carer form: who has been asked, who has
 * done it, the button to ask more people, and the button to complete it
 * themselves (issue #50). A client form: pick a client and fill it in, and
 * every one filled in so far. A company form: fill it in, and every version.
 */
export default async function OrgFormPage({ params }: { params: Promise<{ code: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "forms.builder");
  const { code } = await params;

  const supabase = await createClient();
  const [enabled, template] = await Promise.all([
    enabledMap(context),
    loadFormTemplate(supabase, decodeURIComponent(code)),
  ]);
  if (!template) notFound();
  if (template.is_log) redirect(`/org/forms/logs/${encodeURIComponent(template.code)}`);
  if (!templateVisible(template, enabled, context.organisationId!)) notFound();

  const orgId = context.organisationId!;
  const isCarer = template.audience === "carer";
  const [assignments, { data: staff }, records, { data: clientRows }] = await Promise.all([
    loadAssignmentsForTemplate(supabase, template.id),
    // Pick-lists a page at a time: one read returns at most 1,000 rows.
    isCarer
      ? fetchAll((f, t) =>
          supabase
            .from("users")
            .select("id, full_name, email")
            .eq("status", "active")
            .in("role", STAFF_ROLES)
            .order("full_name")
            .order("id")
            .range(f, t),
        ).then((data) => ({ data }))
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
    isCarer ? Promise.resolve([]) : loadRecordsForTemplate(supabase, orgId, template.id, template.audience as "client" | "company"),
    template.audience === "client"
      ? fetchAll((f, t) =>
          supabase.from("clients").select("id, full_name").eq("status", "active").order("full_name").order("id").range(f, t),
        ).then((data) => ({ data }))
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const people = (staff ?? []).map((u) => ({
    id: u.id as string,
    name: (u.full_name as string | null) ?? (u.email as string),
  }));

  return (
    <DashboardShell title={template.title} context={context}>
      <div className="space-y-6">
        <Link href="/org/forms" className="text-sm text-muted-foreground hover:underline">
          ← All forms
        </Link>

        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{template.title}</h2>
          <p className="text-sm text-muted-foreground">
            {FORM_AUDIENCES.find((a) => a.value === template.audience)?.label.replace(/s$/, "")} · {categoryLabel(template.category)} · {template.fields.length} questions · version {template.version}
          </p>
          {template.description && <p className="text-sm">{template.description}</p>}
        </div>

        {isCarer && (
          <>
            <div className="flex flex-wrap items-start gap-2">
              <AssignForm templateId={template.id} people={people} />
              <form action={startOwnFormAction}>
                <input type="hidden" name="templateId" value={template.id} />
                <Button type="submit" variant="outline">
                  <ClipboardPen className="size-4" />
                  Complete it yourself
                </Button>
              </form>
            </div>

            <AssignmentList assignments={assignments} currentUserId={context.userId} />
          </>
        )}

        {template.audience === "client" && (
          <>
            {(clientRows ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add your clients first —{" "}
                <Link href="/org/clients" className="text-primary hover:underline">the client list</Link>.
              </p>
            ) : (
              <form action={`/org/forms/fill/${encodeURIComponent(template.code)}`} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <label htmlFor="client" className="text-sm font-medium">Fill it in for</label>
                  <select id="client" name="client" required className="flex h-9 min-w-56 rounded-lg border border-input bg-background px-3 text-sm">
                    <option value="">Choose a client…</option>
                    {(clientRows ?? []).map((c) => (
                      <option key={c.id as string} value={c.id as string}>{c.full_name as string}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit">
                  <ClipboardPen className="size-4" />
                  Fill it in
                </Button>
              </form>
            )}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Filled in ({records.length})</h3>
              <RecordList records={records} show="client" empty="Not filled in for anyone yet." />
            </section>
          </>
        )}

        {template.audience === "company" && (
          <>
            <Link href={`/org/forms/fill/${encodeURIComponent(template.code)}`} className={buttonVariants()}>
              <ClipboardPen className="size-4" />
              {records.length ? "Fill in a new version" : "Fill it in"}
            </Link>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Versions on record ({records.length})</h3>
              <RecordList records={records} show="date" empty="Not filled in yet." />
            </section>
          </>
        )}

        {!isCarer && assignments.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Asked of staff before it became a {template.audience} form</h3>
            <AssignmentList assignments={assignments} currentUserId={context.userId} />
          </section>
        )}

        <Card>
          <CardContent className="space-y-1 pt-6">
            <h3 className="text-sm font-semibold">What it asks</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {template.fields.map((f) => (
                <li key={f.id}>
                  {f.label}
                  {f.required && <span className="text-muted-foreground"> · required</span>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
