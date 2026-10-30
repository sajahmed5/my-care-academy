import { CheckCircle2, CircleAlert, Clock } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/dates";
import { dnsRecord } from "@/lib/custom-domain";
import { companyOrigin } from "@/lib/company-host";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CancelDomain, CheckDomain, RequestDomain } from "./controls";

/**
 * The company's own web address (INTEGRATION-WHITE-LABEL.md: white label's
 * main feature). The manager asks for it, adds the one DNS record we give,
 * and we switch it on; then its staff sign in there and every emailed link
 * points there. Managers only.
 */
export default async function DomainPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "platform.white_label");
  const orgId = context.organisationId!;
  const [{ data: org }, origin] = await Promise.all([
    createAdminClient()
      .from("organisations")
      .select("custom_domain, custom_domain_status, custom_domain_dns_ok, custom_domain_checked_at, custom_domain_live_at")
      .eq("id", orgId)
      .maybeSingle(),
    companyOrigin(orgId),
  ]);
  const domain = (org?.custom_domain as string | null) ?? null;
  const live = org?.custom_domain_status === "live";
  const record = domain ? dnsRecord(domain) : null;

  return (
    <SettingsShell context={context} active="/org/settings/white-label/domain">
      {!domain && (
        <Card>
          <CardHeader>
            <CardTitle>Your own web address</CardTitle>
            <CardDescription>
              Your carers and office staff sign in at your company&apos;s own address instead of ours, and every link we
              email them — invitations, password resets, reminders — points there.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RequestDomain />
          </CardContent>
        </Card>
      )}

      {domain && live && (
        <Card>
          <CardContent className="space-y-3 pt-6 text-sm">
            <p className="flex items-start gap-2 text-green-700">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Live since {formatDateTime(org!.custom_domain_live_at as string)}. Your staff sign in at{" "}
                <a href={`${origin}/login`} className="font-medium underline-offset-2 hover:underline">
                  {domain}
                </a>
                , and every email we send them links there.
              </span>
            </p>
            <p className="text-muted-foreground">
              Certificates are still checked on our verification page: a certificate is trusted because a neutral site
              confirms it. Keep the DNS record in place for as long as you use the address.
            </p>
            <CancelDomain live />
          </CardContent>
        </Card>
      )}

      {domain && !live && record && (
        <Card>
          <CardHeader>
            <CardTitle>{domain}</CardTitle>
            <CardDescription>
              {org?.custom_domain_dns_ok
                ? "Your record is in place. We're switching the address on, usually within one working day, and we'll email you when it's done."
                : "One step for you: add this record at whoever runs your company's domain (your IT, or the company you bought the domain from)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Name (or Host)</th>
                    <th className="px-3 py-2 font-medium">Value (or Points to)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-mono">
                    <td className="px-3 py-2">{record.type}</td>
                    <td className="px-3 py-2">{record.name}</td>
                    <td className="px-3 py-2">{record.value}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              {record.type === "CNAME"
                ? `If they ask for the full name, it's ${domain}. Leave the time to live (TTL) as it is.`
                : "This is your bare domain, so the record is an A record. If your website is on it, use an address under it instead, like training."}
            </p>
            <p className="flex items-start gap-2 text-muted-foreground">
              {org?.custom_domain_dns_ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-700" aria-hidden />
              ) : org?.custom_domain_checked_at ? (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
              ) : (
                <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              {org?.custom_domain_checked_at
                ? `Last checked ${formatDateTime(org.custom_domain_checked_at as string)}: ${org.custom_domain_dns_ok ? "the record is in place." : "we couldn't see it yet."}`
                : "Not checked yet."}
            </p>
            <CheckDomain />
            <div className="border-t pt-4">
              <RequestDomain current={domain} />
              <div className="mt-2">
                <CancelDomain live={false} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </SettingsShell>
  );
}
