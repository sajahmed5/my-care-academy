import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardPathForRole, requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

/**
 * Neutral post-login landing. Routes users to their role dashboard, or shows a
 * holding state for an authenticated user who has no role or organisation yet.
 *
 * In practice almost nobody sees this: an invited user arrives with their role
 * already in the token. It is the landing for the rare account that exists in
 * auth but has no profile row — so it says what to do next rather than, as it
 * did, naming a build phase ("Invites arrive in Phase 1b") that shipped long
 * ago and meant nothing to the person reading it.
 */
export default async function DashboardPage() {
  const context = await requireUser();

  if (context.role) {
    redirect(dashboardPathForRole(context.role));
  }

  return (
    <DashboardShell title="Account not set up yet" context={context}>
      <div className="max-w-prose space-y-4">
        <p className="text-muted-foreground">
          You&apos;re signed in as{" "}
          <span className="font-medium text-foreground">{context.email}</span>,
          but this account isn&apos;t linked to an organisation yet, so there
          is nothing here for you to do.
        </p>
        <p className="text-muted-foreground">
          Ask your manager to invite you — they do it from the console, and
          you&apos;ll get an email with a link that finishes the setup. If you
          were expecting access and think something has gone wrong,{" "}
          <Link href="/contact" className="text-primary hover:underline">
            let us know
          </Link>
          .
        </p>
      </div>
    </DashboardShell>
  );
}
