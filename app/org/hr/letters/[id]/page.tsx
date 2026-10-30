import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { aiStatus } from "@/lib/ai";
import { formatDateTime } from "@/lib/dates";
import { firstName, hrPerson, letterSigner, personName } from "@/lib/hr/server";
import { canSeeLetter } from "@/lib/hr/letter-access";
import { templateFor } from "@/lib/hr/letters";
import { LetterEditor } from "./letter-editor";

/**
 * One HR letter: the draft to read, edit (or have AI redraft) and send; or,
 * once sent, the letter as it went, with its PDF.
 */
export default async function LetterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;
  const { back } = await searchParams;
  const admin = createAdminClient();
  const { data: letter } = await admin.from("hr_letters").select("*").eq("id", id).maybeSingle();
  if (!letter || letter.organisation_id !== context.organisationId || !(await canSeeLetter(admin, context, letter))) notFound();
  const person = await hrPerson(admin, context.organisationId, letter.user_id as string);
  if (!person) notFound();
  const [ai, signer, { data: org }] = await Promise.all([
    aiStatus(admin, context.organisationId!),
    letterSigner(admin, context.organisationId!, context.userId),
    admin.from("organisations").select("name").eq("id", context.organisationId!).maybeSingle(),
  ]);
  const backHref = back && back.startsWith("/org/") ? back : `/org/staff/${person.id}?section=employment&sub=letters`;
  const label = templateFor(letter.kind as string)?.label ?? "Letter";
  const fixed = Array.isArray(letter.fixed) ? (letter.fixed as string[]) : [];

  return (
    <DashboardShell title={`${label}: ${personName(person)}`} context={context} back={{ href: backHref, label: personName(person) }}>
      {letter.status === "sent" ? (
        <div className="max-w-3xl space-y-4">
          <p className="text-sm text-muted-foreground">
            Sent to {letter.sent_to as string} on {formatDateTime(letter.sent_at as string)}. They can read it when they sign in.{" "}
            <a href={`/org/hr/letters/${id}/pdf`} className="font-medium text-primary hover:underline">
              Download the PDF
            </a>
          </p>
          <Card>
            <CardContent className="space-y-3 pt-6 text-sm leading-relaxed">
              <p className="font-semibold">{letter.subject as string}</p>
              <p>Dear {firstName(person)},</p>
              {[...String(letter.body).split(/\n{2,}/), ...fixed].map((p, i) => (
                <p key={i} className="whitespace-pre-line">{p}</p>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <LetterEditor
          id={id}
          to={person.email}
          greeting={`Dear ${firstName(person)},`}
          subject={letter.subject as string}
          body={letter.body as string}
          fixed={fixed}
          signer={[signer.name, signer.title, (org?.name as string | undefined) ?? ""].filter(Boolean).join(", ")}
          ai={ai.allowed ? null : ai.reason ?? "AI isn't available."}
          backHref={backHref}
        />
      )}
      {letter.status !== "sent" && (
        <p className="mt-4 max-w-3xl text-xs text-muted-foreground">
          The wording starts from your company&apos;s template, under <Link href="/org/settings/hr/letters" className="underline">Settings → HR → Letters</Link> (managers).
        </p>
      )}
    </DashboardShell>
  );
}
