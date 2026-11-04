import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { Pill } from "@/components/pill";
import { formatDateTime } from "@/lib/dates";
import { loadOrgEmail } from "@/lib/org-emails";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmailActions } from "./email-actions";

/**
 * One email a company's person was sent, as it was sent (ACCOUNT-ACCESS.md).
 * The copy has its sign-in links taken out before it was stored, and it's
 * shown in a sandboxed frame: it's HTML we built, but it holds names people
 * typed, so it never runs in the page itself.
 */
export default async function OrgEmailPage({ params }: { params: Promise<{ id: string; emailId: string }> }) {
  const context = await requireRole("platform_admin");
  const { id, emailId } = await params;
  const [email, { data: org }] = await Promise.all([
    loadOrgEmail(id, emailId),
    createAdminClient().from("organisations").select("id, name").eq("id", id).maybeSingle(),
  ]);
  if (!email || !org) notFound();

  const base = `/platform/organisations/${id}`;
  return (
    <DashboardShell
      title={email.kind}
      context={context}
      header={
        <nav aria-label="Breadcrumb" className="mb-4 text-sm">
          <Link href="/platform/organisations" className="font-semibold text-primary hover:underline">Organisations</Link>
          <span className="mx-1.5 text-muted-foreground">/</span>
          <Link href={base} className="font-semibold text-primary hover:underline">{org.name as string}</Link>
          <span className="mx-1.5 text-muted-foreground">/</span>
          <Link href={`${base}?section=emails`} className="font-semibold text-primary hover:underline">Emails</Link>
        </nav>
      }
    >
      <div className="flex flex-wrap items-start gap-6">
        <section className="w-full max-w-[420px] flex-[1_1_320px] space-y-5 rounded-card border bg-card p-6">
          <h1 className="text-[22px] font-extrabold leading-tight">{email.kind}</h1>
          <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-2.5 text-[15px]">
            <dt className="text-muted-foreground">To</dt>
            <dd>
              {email.person?.name ?? email.to}
              {email.person && <div className="break-all text-sm text-muted-foreground">{email.to} · {email.person.role}</div>}
            </dd>
            <dt className="text-muted-foreground">Subject</dt>
            <dd>{email.subject}</dd>
            <dt className="text-muted-foreground">Sent</dt>
            <dd>{formatDateTime(email.at, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</dd>
            {email.sentByName && (
              <>
                <dt className="text-muted-foreground">Sent by</dt>
                <dd>{email.sentByName}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Status</dt>
            <dd>{email.sent ? <Pill tone="ok">Sent</Pill> : <Pill tone="danger">Not sent</Pill>}</dd>
          </dl>

          {email.html && (
            <p className="rounded-xl bg-warn px-3.5 py-3 text-sm text-warn-foreground">
              The sign-in button in this copy is switched off, so this record can&apos;t be used to sign in.
            </p>
          )}

          {email.person ? (
            <EmailActions orgId={id} emailId={email.id} userId={email.person.id} name={email.person.name} email={email.to} />
          ) : (
            <p className="text-sm text-muted-foreground">This address isn&apos;t anyone in the company now, so there&apos;s nothing to send again.</p>
          )}
        </section>

        <section aria-label="The email" className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-card border bg-[#f5faf9]">
          {email.html ? (
            <iframe
              title={`${email.kind} to ${email.person?.name ?? email.to}`}
              srcDoc={email.html}
              sandbox=""
              className="block h-[900px] w-full border-0"
            />
          ) : (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">
              No copy of this one: copies are kept for 12 months, from 4 November 2026.
            </p>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
