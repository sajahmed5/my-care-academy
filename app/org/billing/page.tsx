import { CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  TIER_DETAILS,
  tierLabel,
  type PackageTier,
} from "@/lib/organisations";
import { formatMoney, getBillingSummary } from "@/lib/account-billing";
import { DashboardShell } from "@/components/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConsoleUsers, type ConsoleUser } from "./console-users";
import { AccountDetails } from "./account-details";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Account (formerly Billing): the current package in full, a read-only
 * payment summary, and account admin. Plan changes are owner-only, so there
 * is deliberately no upgrade/downgrade UI here (design doc v2).
 */
/** Stripe's words, in the manager's words. */
const SUB_STATUS: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed",
  canceled: "Cancelled",
  unpaid: "Unpaid",
  incomplete: "Setup not finished",
  incomplete_expired: "Setup expired",
  paused: "Paused",
};

export default async function AccountPage() {
  const context = await requireRole("org_admin");

  const supabase = await createClient();
  const [{ data: org }, { data: me }, { data: consoleRows }] = await Promise.all([
    supabase
      .from("organisations")
      .select(
        "package_tier, subscription_status, stripe_customer_id, stripe_subscription_id",
      )
      .eq("id", context.organisationId!)
      .maybeSingle(),
    supabase
      .from("users")
      .select("full_name, email")
      .eq("id", context.userId)
      .single(),
    supabase
      .from("users")
      .select("id, full_name, email, role, status, last_seen_at")
      .eq("organisation_id", context.organisationId!)
      .in("role", ["org_admin", "org_office"])
      .order("role")
      .order("full_name"),
  ]);
  const consoleUsers: ConsoleUser[] = (consoleRows ?? []).map((u) => ({
    id: u.id as string,
    name: (u.full_name as string | null) || (u.email as string) || "Unnamed",
    email: u.email as string | null,
    role: u.role as ConsoleUser["role"],
    status: (u.status as string | null) ?? "active",
    lastSeen: (u.last_seen_at as string | null) ?? null,
  }));

  const tier = (org?.package_tier ?? "core") as PackageTier;
  const details = TIER_DETAILS[tier];
  const billing = await getBillingSummary({
    stripe_customer_id: org?.stripe_customer_id ?? null,
    stripe_subscription_id: org?.stripe_subscription_id ?? null,
  });

  return (
    <DashboardShell title="Account" context={context}>
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Package */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-teal-600 to-sky-600 px-6 py-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-widest opacity-80">
              Your package
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <h2 className="text-2xl font-bold">{tierLabel(tier)}</h2>
              {billing.price && (
                <p className="text-lg font-semibold">
                  {formatMoney(billing.price.amount, billing.price.currency)}
                  <span className="text-sm font-normal opacity-80">
                    /{billing.price.interval}
                  </span>
                </p>
              )}
            </div>
            <p className="mt-1 text-sm opacity-90">{details.tagline}</p>
          </div>
          <CardContent className="pt-4">
            <ul className="grid gap-2 sm:grid-cols-2">
              {details.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-600" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Want to change your package? Plan changes are handled by My Care
              Academy — get in touch and we&apos;ll sort it.
            </p>
          </CardContent>
        </Card>

        {/* Billing */}
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>
              Your payment summary
              {org?.subscription_status ? (
                <>
                  {" · "}
                  <Badge variant="secondary">{SUB_STATUS[org.subscription_status] ?? org.subscription_status}</Badge>
                </>
              ) : (
                " · no active subscription"
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Monthly price</dt>
                <dd className="font-medium">
                  {billing.price
                    ? `${formatMoney(billing.price.amount, billing.price.currency)} per ${billing.price.interval}`
                    : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Next payment</dt>
                <dd className="font-medium">
                  {billing.nextPayment
                    ? `${formatMoney(billing.nextPayment.amount, billing.nextPayment.currency)} on ${fmtDate(billing.nextPayment.date)}`
                    : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Payment method</dt>
                <dd className="font-medium">
                  {!billing.paymentMethod && "—"}
                  {billing.paymentMethod?.kind === "card" &&
                    `${billing.paymentMethod.brand.toUpperCase()} card •••• ${billing.paymentMethod.last4}`}
                  {billing.paymentMethod?.kind === "bacs_debit" &&
                    `Direct debit ${billing.paymentMethod.sortCode} / •••• ${billing.paymentMethod.last4}`}
                  {billing.paymentMethod?.kind === "other" &&
                    billing.paymentMethod.label}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              To change your payment details, contact My Care Academy.
            </p>
          </CardContent>
        </Card>

        {/* Who can open the console */}
        <Card>
          <CardHeader>
            <CardTitle>Console users</CardTitle>
            <CardDescription>
              Managers see everything, this page included. Office workers see
              everything except this page. Carers are added under Learners.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConsoleUsers users={consoleUsers} meId={context.userId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My account</CardTitle>
            <CardDescription>Your own sign-in details.</CardDescription>
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
