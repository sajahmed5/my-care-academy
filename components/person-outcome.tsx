import Link from "next/link";
import { TemporaryPasswordReveal } from "@/components/temporary-password-reveal";
import type { PersonOutcome } from "@/lib/company-people";

/**
 * What happened when someone was added to a company from the platform
 * (ACCOUNT-ACCESS.md): emailed, a link to pass on where email is off, a
 * temporary password shown once, or why it didn't work.
 */
export function PersonOutcomeView({ outcome, orgId }: { outcome: PersonOutcome; orgId?: string }) {
  const role = outcome.role === "org_admin" ? "Manager" : "Office worker";
  return (
    <div className="space-y-2 border-t py-3 first:border-t-0">
      <p className="font-bold">
        {outcome.name} <span className="font-semibold text-muted-foreground">· {role}</span>
      </p>
      {!outcome.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {outcome.email}: {outcome.error}
        </p>
      ) : outcome.password ? (
        <TemporaryPasswordReveal name={outcome.name} email={outcome.email} password={outcome.password} />
      ) : outcome.emailed ? (
        <p className="text-sm text-muted-foreground">
          Email sent to {outcome.email}.{" "}
          {orgId && outcome.emailId && (
            <Link href={`/platform/organisations/${orgId}/emails/${outcome.emailId}`} className="font-semibold text-primary hover:underline">
              View email
            </Link>
          )}
        </p>
      ) : (
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            Invite created for {outcome.email}. Email isn&apos;t configured yet, so share this link with them:
          </p>
          <code className="block overflow-x-auto break-all rounded bg-muted p-2 text-xs">{outcome.link}</code>
        </div>
      )}
    </div>
  );
}
