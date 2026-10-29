import { Search } from "lucide-react";
import Link from "next/link";
import { orgBranding } from "@/lib/branding";
import { TopNav } from "@/components/top-nav";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBadgeData, loadStarTotal } from "@/lib/learner-data";
import { deriveNotifications, unreadCount } from "@/lib/notifications";
import { VERSION_LABEL } from "@/lib/version";
import { StarBank } from "@/components/star-bank";
import { ReportWidget } from "@/components/report-widget";
import { memberStatus, roleLabel, type UserContext } from "@/lib/auth";
import { enabledMap } from "@/lib/entitlements";

async function learnerBadges(
  context: UserContext,
): Promise<Record<string, number>> {
  if (context.role !== "learner") return {};
  try {
    const data = await loadBadgeData(context.userId);
    const notifs = deriveNotifications(data.enrolments, data.certificates, new Date());
    return { "/learn/notifications": unreadCount(notifs, data.readAt) };
  } catch {
    return {};
  }
}

async function learnerStarTotal(context: UserContext): Promise<number> {
  if (context.role !== "learner") return 0;
  return loadStarTotal(context.userId);
}

/**
 * Which features this org has — gates the menu's pack items. Carers too: this
 * once asked only for console users, so a carer's Policies and Forms links
 * were always dropped and the pages could only be reached from elsewhere.
 */
async function orgAddOns(
  context: UserContext,
): Promise<Record<string, boolean>> {
  if (!context.organisationId) return {};
  return enabledMap(context);
}

/**
 * Record that this user is active on the site, at most once every 30 minutes.
 * Gives org admins a real "last active" signal (auth.last_sign_in_at barely
 * changes because sessions persist). Service-role, throttled, best-effort —
 * never blocks or breaks the render. Org members' last_seen_at was already
 * read by the active-member gate this request, so a fresh one skips the
 * write entirely instead of sending an UPDATE that matches nothing.
 */
async function touchLastSeen(context: UserContext): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
    if (context.role !== "platform_admin") {
      const { lastSeenAt } = await memberStatus(context.userId, context.organisationId);
      if (lastSeenAt && Date.parse(lastSeenAt) >= Date.parse(cutoff)) return;
    }
    await createAdminClient()
      .from("users")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", context.userId)
      .or(`last_seen_at.is.null,last_seen_at.lt.${cutoff}`);
  } catch {
    // Column missing (pre-migration) or transient error — ignore.
  }
}

export async function DashboardShell({
  title,
  context,
  back,
  children,
}: {
  title: string;
  context: UserContext;
  /** A way back above the title, e.g. a carer's file to All learners. */
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  const [badges, starTotal, addOns, , branding, member] = await Promise.all([
    learnerBadges(context),
    learnerStarTotal(context),
    orgAddOns(context),
    touchLastSeen(context),
    // The organisation's own logo in place of ours, with white-label.
    context.role === "platform_admin" ? null : orgBranding(context.organisationId),
    // Already read by the active-member gate this request (cached).
    context.role === "platform_admin" ? null : memberStatus(context.userId, context.organisationId),
  ]);
  const learner = context.role === "learner";
  return (
    <div className="flex min-h-svh w-full flex-col">
      {/* The menu across the top — every role, every signed-in page. It was a
          left-hand panel until 27 Oct 2026. */}
      <TopNav
        role={context.role}
        name={member?.fullName ?? null}
        email={context.email}
        roleLabel={roleLabel(context.role)}
        badges={badges}
        enabled={addOns}
        version={VERSION_LABEL}
        brandLogo={branding?.logoUrl}
        brandName={branding?.name}
        search={
          learner ? (
            <form action="/learn/modules/all" method="get" className="relative w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                placeholder="Search courses…"
                className="w-full rounded-full border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </form>
          ) : undefined
        }
        stars={learner ? <StarBank initialTotal={starTotal} /> : undefined}
      />

      {/* The title and the page run the full width, on the same left edge as
          the logo and the tabs above. Until 29 Oct 2026 every page was held
          to max-w-6xl in the middle, which on a wide screen left a band of
          empty space either side and the page out of line with the menu. */}
      <div className="border-b bg-card/85 px-4 py-3 sm:px-6">
        <div>
          {back && (
            <Link href={back.href} className="text-xs text-muted-foreground hover:underline">
              ← {back.label}
            </Link>
          )}
          <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
        </div>
      </div>

      {/* From a tablet up, bottom padding keeps the floating Report button
          clear of the last thing on the page — e.g. a course's Next button.
          On a phone the button follows the page instead of floating. */}
      <main className="min-w-0 flex-1 px-4 pt-6 pb-8 sm:px-6 sm:pt-8 sm:pb-24">{children}</main>

      {/* Always-visible "Report an issue" widget — every role, every page. */}
      <ReportWidget />
    </div>
  );
}
