import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadFormTemplate, visibleFormPacks } from "@/lib/form-library";
import { FormComplete } from "@/app/learn/forms/[assignmentId]/form-complete";

/**
 * Filling in a client or company form (FORMS.md). A client form is about the
 * client in `?client=`, and ends with the client or their family signing on
 * the device if they are there. A carer form is never filled in here — it is
 * asked of the member of staff.
 */
export default async function FillFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ client?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "forms.builder");
  const [{ code }, { client: clientId }] = await Promise.all([params, searchParams]);

  const supabase = await createClient();
  const [enabled, template] = await Promise.all([enabledMap(context), loadFormTemplate(supabase, decodeURIComponent(code))]);
  if (!template || template.audience === "carer") notFound();
  const { packs, collections } = visibleFormPacks(enabled);
  if (!packs.includes(template.pack) || (template.pack === "addon" && !collections.includes(template.collection ?? ""))) {
    notFound();
  }

  let clientName: string | null = null;
  if (template.audience === "client") {
    if (!clientId) notFound();
    const { data: client } = await supabase.from("clients").select("full_name").eq("id", clientId).maybeSingle();
    if (!client) notFound();
    clientName = client.full_name as string;
  }

  const back =
    template.audience === "client"
      ? { href: `/org/clients/${clientId}`, label: clientName! }
      : { href: `/org/forms/library/${encodeURIComponent(template.code)}`, label: template.title };

  return (
    <DashboardShell title={template.title} context={context} back={back}>
      <div className="space-y-6 *:max-w-2xl">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{template.title}</h2>
          {clientName && <p className="text-sm font-medium">About {clientName}</p>}
          {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
          <p className="text-sm text-muted-foreground">
            It is recorded against your name, with the date and time.{" "}
            <Link href={`/org/forms/library/${encodeURIComponent(template.code)}`} className="hover:underline">
              About this form
            </Link>
          </p>
        </div>
        <FormComplete
          record={{ templateId: template.id, clientId: clientId ?? undefined, deviceSigning: template.audience === "client" }}
          fields={template.fields}
          doneMessage={clientName ? `Saved on ${clientName}'s record.` : "Saved — this is now on record."}
          doneHref={back.href}
          doneLabel={clientName ? `Back to ${clientName}` : "Back to the form"}
        />
      </div>
    </DashboardShell>
  );
}
