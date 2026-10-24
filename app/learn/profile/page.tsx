import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadLearner } from "@/lib/learner-data";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NameForm, PasswordChangeForm } from "@/components/account-fields";
import { updateProfileNameAction } from "@/app/learn/actions";
import { PrivacyData } from "../privacy-data";

export default async function ProfilePage() {
  const context = await requireRole("learner");
  const supabase = await createClient();
  const { fullName } = await loadLearner(supabase);

  const { data: org } = context.organisationId
    ? await supabase
        .from("organisations")
        .select("name")
        .eq("id", context.organisationId)
        .maybeSingle()
    : { data: null };

  return (
    <DashboardShell title="Profile" context={context}>
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>{context.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Organisation</span>
              <span>{org?.name ?? "—"}</span>
              <span className="text-muted-foreground">Role</span>
              <span>Learner</span>
            </div>
            <NameForm
              initial={fullName ?? ""}
              action={updateProfileNameAction}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Change your password.</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordChangeForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy &amp; your data</CardTitle>
            <CardDescription>
              Download a copy of your data or delete your account (UK GDPR). See
              our{" "}
              <a href="/privacy" className="underline">
                privacy policy
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PrivacyData />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
