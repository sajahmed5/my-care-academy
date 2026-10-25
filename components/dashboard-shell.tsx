import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { orgBranding } from "@/lib/branding";
import { SidebarNav } from "@/components/sidebar-nav";
import { AppSidebar } from "@/components/app-sidebar";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBadgeData, loadStarTotal } from "@/lib/learner-data";
import { deriveNotifications, unreadCount } from "@/lib/notifications";
import { VERSION_LABEL } from "@/lib/version";
import { StarBank } from "@/components/star-bank";
import { ReportWidget } from "@/components/report-widget";
import { isConsoleRole, memberStatus, roleLabel, type UserContext } from "@/lib/auth";
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

/** Which features this org has — gates the org sidebar's pack items. */
async function orgAddOns(
  context: UserContext,
): Promise<Record<string, boolean>> {
  if (!isConsoleRole(context.role) || !context.organisationId) return {};
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
  children,
}: {
  title: string;
  context: UserContext;
  children?: React.ReactNode;
}) {
  const [badges, starTotal, addOns, , branding] = await Promise.all([
    learnerBadges(context),
    learnerStarTotal(context),
    orgAddOns(context),
    touchLastSeen(context),
    // The organisation's own logo in place of ours, with white-label.
    context.role === "platform_admin" ? null : orgBranding(context.organisationId),
  ]);
  return (
    <div className="flex min-h-svh w-full">
      {/* Sidebar — desktop (collapsible) */}
      <AppSidebar
        role={context.role}
        email={context.email}
        roleLabel={roleLabel(context.role)}
        badges={badges}
        enabled={addOns}
        version={VERSION_LABEL}
        brandLogo={branding?.logoUrl}
        brandName={branding?.name}
      />

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header data-print="hide" className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card/85 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="inline-flex rounded bg-white px-2 py-1 shadow-sm md:hidden">
              <BrandMark logoUrl={branding?.logoUrl} orgName={branding?.name} width={104} />
            </div>
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {title}
            </h1>
          </div>
          {context.role === "learner" && (
            <form
              action="/learn/modules/all"
              method="get"
              className="relative hidden max-w-sm flex-1 md:block"
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                placeholder="Search courses…"
                className="w-full rounded-full border bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </form>
          )}
          <div className="flex items-center gap-3">
            {context.role === "learner" && <StarBank initialTotal={starTotal} />}
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {context.email}
            </span>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="destructive" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </header>

        {/* Mobile nav strip */}
        <div data-print="hide" className="min-w-0 bg-sidebar px-3 py-2 md:hidden">
          <SidebarNav role={context.role} orientation="horizontal" badges={badges} enabled={addOns} />
        </div>

        {/* Bottom padding keeps the floating Report button clear of the last
            thing on the page — e.g. a course's Next button. */}
        <main className="flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pt-8">{children}</main>
      </div>

      {/* Always-visible "Report an issue" widget — every role, every page. */}
      <ReportWidget />
    </div>
  );
}
