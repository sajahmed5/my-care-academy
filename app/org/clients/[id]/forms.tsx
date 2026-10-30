import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ClipboardPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserContext } from "@/lib/auth";
import { enabledMap } from "@/lib/entitlements";
import { loadFormLibrary } from "@/lib/form-library";
import { loadRecordsForClient } from "@/lib/form-records";
import { loadLogEntriesForClient, logCell, logColumns } from "@/lib/form-logs";
import { formatDate } from "@/lib/dates";
import { RecordList } from "@/app/org/forms/record-list";

/**
 * The forms about one client (FORMS.md): every care plan, assessment and
 * consent filled in about them, newest first, each with its PDF — and the
 * picker to fill in another. Only where Forms is in the package.
 */
export async function ClientForms({
  supabase,
  context,
  clientId,
}: {
  supabase: SupabaseClient;
  context: UserContext;
  clientId: string;
}) {
  const [enabled, { data: org }, records, logLines] = await Promise.all([
    enabledMap(context),
    supabase.from("organisations").select("service_type").eq("id", context.organisationId!).single(),
    loadRecordsForClient(supabase, clientId),
    loadLogEntriesForClient(supabase, clientId),
  ]);
  const library = await loadFormLibrary(supabase, {
    enabled,
    serviceType: (org?.service_type as string | null) ?? null,
    organisationId: context.organisationId!,
  });
  const clientForms = library.filter((t) => t.audience === "client" && !t.is_log);

  return (
    <section id="forms" className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Forms{records.length ? ` · ${records.length}` : ""}</h2>
        {clientForms.length > 0 && (
          <form action="/org/forms/fill" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="client" value={clientId} />
            <label htmlFor="client-form" className="sr-only">Form to fill in</label>
            <select
              id="client-form"
              name="code"
              required
              className="flex h-8 max-w-64 rounded-lg border border-input bg-background px-2 text-sm"
            >
              <option value="">Choose a form…</option>
              {clientForms.map((t) => (
                <option key={t.id} value={t.code}>{t.title}</option>
              ))}
            </select>
            <Button type="submit" variant="outline" size="sm">
              <ClipboardPen className="size-4" />
              Fill in
            </Button>
          </form>
        )}
      </div>
      <RecordList records={records} show="form" empty="No forms filled in about this client yet." />
      {logLines.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In the logs</h3>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {logLines.slice(0, 20).map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-x-4 px-4 py-2">
                <span>
                  <Link href={`/org/forms/logs/${encodeURIComponent(l.template_code)}`} className="font-medium hover:underline">
                    {l.template_title}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {logColumns(l.fields).map((c) => logCell(c, l.answers).text).filter(Boolean).slice(0, 3).join(" · ")}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(`${l.entry_date}T12:00:00Z`, { day: "numeric", month: "short", year: "numeric" })} · {l.person}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
