import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PACKAGE_TIERS,
  TIER_DETAILS,
  tierLabel,
  type PackageTier,
} from "@/lib/organisations";
import { LIST_PRICE_GBP } from "@/lib/pricing";
import { ChangePackage } from "./change-package";
import { formatMoney, getBillingSummary } from "@/lib/account-billing";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConsoleUsers, type ConsoleUser } from "./console-users";
import { hasFeature } from "@/lib/entitlements";
import { formatDate } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiStatus, monthCharge } from "@/lib/ai";
import { AI_MARKUP, formatGbp } from "@/lib/ai-cost";
import { AiSettingsForm } from "./ai-card";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return formatDate(iso, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Account (formerly Billing): the current package in full, a read-only
 * payment summary, and account admin. Plan changes are still made by us, but
 * since 29 Oct 2026 a manager can ask for one here ("Change your package")
 * rather than being sent to the contact form.
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

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string }>;
}) {
  const context = await requireRole("org_admin");
  const { package: preselect } = await searchParams;

  const supabase = await createClient();
  const [{ data: org }, { data: me }, { data: consoleRows }, { data: openAsk }] = await Promise.all([
    supabase
      .from("organisations")
      .select(
        "package_tier, subscription_status, stripe_customer_id, stripe_subscription_id",
      )
      .eq("id", context.organisationId!)
      .maybeSingle(),
    supabase
      .from("users")
      .select("email")
      .eq("id", context.userId)
      .single(),
    supabase
      .from("users")
      .select("id, full_name, email, role, status, last_seen_at")
      .eq("organisation_id", context.organisationId!)
      .in("role", ["org_admin", "org_office"])
      .order("role")
      .order("full_name"),
    supabase
      .from("package_change_requests")
      .select("to_tier, created_at")
      .eq("organisation_id", context.organisationId!)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const consoleUsers: ConsoleUser[] = (consoleRows ?? []).map((u) => ({
    id: u.id as string,
    name: (u.full_name as string | null) || (u.email as string) || "Unnamed",
    email: u.email as string | null,
    role: u.role as ConsoleUser["role"],
    status: (u.status as string | null) ?? "active",
    lastSeen: (u.last_seen_at as string | null) ?? null,
  }));

  const admin = createAdminClient();
  const [whiteLabel, ai, aiMonth] = await Promise.all([
    hasFeature(context, "platform.white_label"),
    aiStatus(admin, context.organisationId!),
    monthCharge(admin, context.organisationId!),
  ]);

  const tier = (org?.package_tier ?? "core") as PackageTier;
  const details = TIER_DETAILS[tier];
  const billing = await getBillingSummary({
    stripe_customer_id: org?.stripe_customer_id ?? null,
    stripe_subscription_id: org?.stripe_subscription_id ?? null,
  });

  return (
    <SettingsShell context={context} active="/org/billing">
      <div className="space-y-6">
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
          </CardContent>
        </Card>

        {/* Change your package: the packages side by side, and a request to us. */}
        <Card id="change" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Change your package</CardTitle>
            <CardDescription>
              Choose a package and we&apos;ll set it up with you. Nothing changes until we&apos;ve been in touch.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePackage
              current={tier}
              preselect={preselect ?? null}
              asked={
                openAsk
                  ? { label: tierLabel(openAsk.to_tier as string), on: fmtDate(openAsk.created_at as string) }
                  : null
              }
              options={PACKAGE_TIERS.map((t) => ({
                value: t.value,
                label: t.label,
                price: LIST_PRICE_GBP[t.value],
                points: TIER_DETAILS[t.value].features.slice(0, 4),
              }))}
            />
          </CardContent>
        </Card>

        {/* Your logo and colour (white label) moved to Settings on 31 Oct
            2026; without it, this is where a manager learns it exists. */}
        {!whiteLabel && (
          <Card>
            <CardHeader>
              <CardTitle>Your logo and colour</CardTitle>
              <CardDescription>
                Your own logo and colour in place of ours are included in Enterprise.{" "}
                <Link href="/org/billing?package=full#change" className="font-medium text-primary hover:underline">
                  Ask to move to Enterprise
                </Link>
                .
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* AI */}
        <Card>
          <CardHeader>
            <CardTitle>AI</CardTitle>
            <CardDescription>
              This month: {formatGbp(ai.chargedGbp)} from {aiMonth.requests} request{aiMonth.requests === 1 ? "" : "s"}. It&apos;s added to your
              monthly bill as &ldquo;AI usage&rdquo;, at {AI_MARKUP} times what it costs us.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AiSettingsForm enabled={ai.enabled} limitGbp={ai.limitGbp} />
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
              To change your payment details,{" "}
              <Link
                href="/contact?topic=billing"
                className="font-medium text-primary hover:underline"
              >
                contact My Care Academy
              </Link>
              .
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

        {/* The fields themselves moved to /account, which every role can
            reach — an office worker could never open this page, so their own
            name and password had nowhere to live. The pointer stays for
            anyone who learned to look here. */}
        <Card>
          <CardHeader>
            <CardTitle>My account</CardTitle>
            <CardDescription>Your own sign-in details.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your name and password are on{" "}
              <Link
                href="/account"
                className="font-medium text-primary hover:underline"
              >
                your account page
              </Link>
              , signed in as {me?.email ?? context.email ?? "this account"}.
            </p>
          </CardContent>
        </Card>
      </div>
    </SettingsShell>
  );
}
