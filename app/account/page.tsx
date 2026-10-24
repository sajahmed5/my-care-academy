import { requireActiveUser, roleLabel } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AccountDetails } from "./account-details";

/**
 * My account — your own name and password, whatever role you hold.
 *
 * The one page open to every signed-in role, because the fields on it belong
 * to the person rather than the job. They used to live only where each role
 * happened to have a page of their own: a carer at /learn/profile, a manager
 * on /org/billing. /org/billing is manager-only (AGENTS.md), so an office
 * worker had nowhere at all to fix the spelling of their name or change their
 * password, and nor did a platform admin.
 *
 * A carer keeps /learn/profile, which has their privacy and data tools too,
 * so only the other roles carry this in their sidebar — but the route itself
 * answers for anyone signed in, including an account with no role yet.
 */
export default async function AccountPage() {
  const context = await requireActiveUser();
  const supabase = await createClient();

  const [{ data: me }, { data: org }] = await Promise.all([
    supabase
      .from("users")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle(),
    context.organisationId
      ? supabase
          .from("organisations")
          .select("name")
          .eq("id", context.organisationId)
          .maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
  ]);

  return (
    <DashboardShell title="My account" context={context}>
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Your sign-in details</CardTitle>
            <CardDescription>
              {roleLabel(context.role)}
              {org?.name ? ` · ${org.name}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccountDetails
              fullName={me?.full_name ?? null}
              email={me?.email ?? context.email ?? null}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
