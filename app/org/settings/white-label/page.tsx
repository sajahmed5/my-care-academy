import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { orgBranding } from "@/lib/branding";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoCard } from "./logo-card";
import { ColourCard } from "./colour-card";
import { EmailCard } from "./email-card";

/**
 * White label (INTEGRATION-WHITE-LABEL.md, 29 Oct 2026): the company's logo
 * and colour, which replace ours across its carers' and office's pages, its
 * PDFs and its emails; and who those emails come from.
 * Managers only. The logo was on the Account page until 31 Oct 2026.
 */
export default async function WhiteLabelPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "platform.white_label");
  const [branding, { data: org }] = await Promise.all([
    orgBranding(context.organisationId),
    createAdminClient().from("organisations").select("brand_colour, email_sender_name, email_reply_to").eq("id", context.organisationId!).maybeSingle(),
  ]);
  const from = process.env.EMAIL_FROM ?? "";
  const sendingAddress = from.match(/<([^>]+)>/)?.[1] ?? (from || "our own address");
  return (
    <SettingsShell context={context} active="/org/settings/white-label">
      <Card>
        <CardHeader>
          <CardTitle>Your logo</CardTitle>
          <CardDescription>
            In place of ours: across the top of every page your staff see, on certificates, on your copy of the
            policies, and on your surveys and raise-a-concern page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogoCard logoUrl={branding?.logoUrl ?? null} orgName={branding?.name ?? "Your organisation"} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your colour</CardTitle>
          <CardDescription>For the menu and buttons on every page your staff see.</CardDescription>
        </CardHeader>
        <CardContent>
          <ColourCard saved={(org?.brand_colour as string | null) ?? null} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your emails</CardTitle>
          <CardDescription>
            Every email we send your staff and candidates — invitations, password resets, reminders, letters — comes
            in your name, with your logo and colour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailCard
            orgName={branding?.name ?? "Your company"}
            senderName={(org?.email_sender_name as string | null) ?? null}
            replyTo={(org?.email_reply_to as string | null) ?? null}
            sendingAddress={sendingAddress}
          />
        </CardContent>
      </Card>
      <p className="px-1 text-xs text-muted-foreground">
        A small &ldquo;Powered by My Care Academy&rdquo; line stays at the foot, and certificates are still checked on
        our verification page: a certificate is trusted because a neutral site confirms it.
      </p>
    </SettingsShell>
  );
}
