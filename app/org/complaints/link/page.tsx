import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/site-url";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { CopyLink } from "@/app/org/feedback/controls";
import { LinkOpenToggle, MakeLink } from "./controls";

/**
 * The raise-a-concern link: one address the company gives families and
 * clients — in the service user guide, on a letter, on the website — where
 * they can raise a concern without an account. What comes in waits for triage.
 */
export default async function ConcernLinkPage() {
  const context = await requireConsole();
  await requireFeature(context, "complaints.register");
  const supabase = await createClient();
  const [{ data: link }, origin] = await Promise.all([
    supabase.from("concern_links").select("token, is_open, created_at").eq("organisation_id", context.organisationId!).maybeSingle(),
    siteOrigin(),
  ]);
  return (
    <DashboardShell title="Raise-a-concern link" context={context} back={{ href: "/org/complaints", label: "Complaints & safeguarding" }}>
      <Card>
        <CardContent className="space-y-4 pt-6 text-sm">
          <p className="text-muted-foreground">
            Give this address to families and the people you care for — in your service user guide, on letters, or on your website. Anyone with it can raise a concern without signing in. It arrives on your list as a concern waiting for triage, with their contact details, and they are given its reference.
          </p>
          {link ? (
            <>
              <CopyLink url={`${origin}/concern/${link.token}`} />
              <p className={link.is_open ? "text-green-700" : "text-amber-700"}>
                {link.is_open ? "Taking concerns." : "Closed: anyone opening it is asked to phone the office."}
              </p>
              <div className="flex flex-wrap gap-2">
                <LinkOpenToggle open={link.is_open as boolean} />
                <MakeLink again />
              </div>
            </>
          ) : (
            <MakeLink again={false} />
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
