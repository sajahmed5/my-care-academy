import { Suspense } from "react";
import { Search } from "lucide-react";
import Link from "next/link";
import { orgBranding } from "@/lib/branding";
import { TopNav } from "@/components/top-nav";
import { BrandStyle } from "@/components/brand-style";
import { redirect } from "next/navigation";
import { hostCompany, ourSite } from "@/lib/company-host";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBadgeData, loadStarTotal } from "@/lib/learner-data";
import { deriveNotifications, unreadCount } from "@/lib/notifications";
import { VERSION_LABEL } from "@/lib/version";
import { StarBank } from "@/components/star-bank";
import { ReportWidget } from "@/components/report-widget";
import { consoleFont } from "@/components/console-font";
import { isConsoleRole, isStaffRole, memberStatus, roleLabel, type UserContext } from "@/lib/auth";
import { enabledMap } from "@/lib/entitlements";
import type { FeatureKey } from "@/lib/features";
import { loadDueBadge } from "@/lib/due-badge";
import { daysLeftLabel, trialState } from "@/lib/trial";
import { CoachMark } from "@/components/walkthrough/coach-mark";

/**
 * Unread notifications about their own training: the badge on a carer's
 * Notifications item, and on the bell a manager or office worker has.
 */
async function learnerBadges(
  context: UserContext,
  wanted: boolean,
): Promise<Record<string, number>> {
  if (!wanted) return {};
  try {
    const data = await loadBadgeData(context.userId);
    const notifs = deriveNotifications(data.enrolments, data.certificates, new Date(), data.bookings);
    return { "/learn/notifications": unreadCount(notifs, data.readAt) };
  } catch {
    return {};
  }
}

async function learnerStarTotal(context: UserContext, learn: boolean): Promise<number> {
  if (!learn) return 0;
  return loadStarTotal(context.userId);
}

/**
 * Which features this org has — gates the menu's pack items. Carers too: this
 * once asked only for console users, so a carer's Policies and Forms links
 * were always dropped and the pages could only be reached from elsewhere.
 */
async function orgAddOns(
  context: UserContext,
): Promise<Record<FeatureKey, boolean>> {
  if (!context.organisationId) return {} as Record<FeatureKey, boolean>;
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

/**
 * Every signed-in page: the menu across the top, the page's title, and the
 * page, held to 1,320px in the middle (redesign, 1 Nov 2026, docs/redesign).
 */
export async function DashboardShell({
  title,
  context,
  back,
  header,
  learn = false,
  children,
}: {
  title: string;
  context: UserContext;
  /** A page of someone's own training (/learn). Every member of staff has
   *  one since 29 Oct 2026, managers and office workers included. */
  learn?: boolean;
  /** A way back above the title, as a breadcrumb: Staff / Saj Ahmed. */
  back?: { href: string; label: string };
  /**
   * The page's own heading block, in place of the plain title — the Today
   * page's greeting, the staff list's count and buttons. `false` for none.
   */
  header?: React.ReactNode | false;
  children?: React.ReactNode;
}) {
  // A company's own web address is for its own staff: anyone else signed in
  // there goes back to ours (white label).
  const host = await hostCompany();
  if (host && context.role !== "platform_admin" && context.organisationId !== host.id) redirect(`${ourSite()}/login`);

  const learnerView = learn || context.role === "learner";
  const console_ = isConsoleRole(context.role);
  const addOns = await orgAddOns(context);
  const [badges, starTotal, , branding, member, due] = await Promise.all([
    learnerBadges(context, learnerView || console_),
    learnerStarTotal(context, learnerView),
    touchLastSeen(context),
    // The organisation's own logo in place of ours, with white-label.
    context.role === "platform_admin" ? null : orgBranding(context.organisationId),
    // Already read by the active-member gate this request (cached).
    context.role === "platform_admin" ? null : memberStatus(context.userId, context.organisationId),
    // The number on Due: cached per company, see lib/due-badge.ts.
    console_ && !learn ? loadDueBadge(context.organisationId, addOns) : null,
  ]);
  // A manager or office worker has training too; the search and stars show
  // while they're on it.
  const learner = (learn && isStaffRole(context.role)) || context.role === "learner";

  // The trial pill (TRIAL.md): managers get the way to choose a package;
  // office workers can't change it. Carers never see it.
  const trial = console_ ? trialState(member?.trialEndsAt ?? null) : { kind: "none" as const };
  const trialPill =
    trial.kind === "active"
      ? { label: `Trial · ${daysLeftLabel(trial.daysLeft)}`, href: context.role === "org_admin" ? "/org/billing" : null }
      : null;

  return (
    <div className={`${consoleFont.variable} flex min-h-svh w-full flex-col text-[15px] [--font-body:var(--font-jakarta)]`}>
      {/* The company's colour on its buttons and menu, with white label. */}
      <BrandStyle colour={branding?.colour} />
      {/* The menu across the top — every role, every signed-in page. It was a
          left-hand panel until 27 Oct 2026, and a dark bar until 1 Nov. */}
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
        due={due ?? undefined}
        trial={trialPill}
        notifications={badges["/learn/notifications"] ?? 0}
        search={
          learner ? (
            <form action="/learn/modules/all" method="get" className="relative w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                placeholder="Search courses…"
                aria-label="Search courses"
                className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </form>
          ) : undefined
        }
        stars={learner ? <StarBank initialTotal={starTotal} /> : undefined}
      />

      {/* From a tablet up, bottom padding keeps the floating Report button
          clear of the last thing on the page — e.g. a course's Next button.
          On a phone the button follows the page instead of floating. */}
      <main className="mx-auto w-full min-w-0 max-w-[1384px] flex-1 px-4 pt-6 pb-8 sm:px-8 sm:pt-8 sm:pb-24">
        {header === false
          ? null
          : (header ?? (
              <div className="mb-6">
                {back && (
                  <nav aria-label="Breadcrumb" className="mb-1.5 text-sm">
                    <Link href={back.href} className="font-semibold text-primary hover:underline">
                      {back.label}
                    </Link>
                    <span className="mx-1.5 text-muted-foreground">/</span>
                    <span className="text-muted-foreground">{title}</span>
                  </nav>
                )}
                <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">{title}</h1>
              </div>
            ))}
        {children}
      </main>

      {/* With white label our name stays, small, at the foot (INTEGRATION-
          WHITE-LABEL.md). */}
      {(branding?.logoUrl || branding?.colour) && (
        <p data-print="hide" className="px-4 pb-6 text-center text-xs text-muted-foreground sm:-mt-16 sm:px-6">
          Powered by My Care Academy
        </p>
      )}

      {/* Always-visible "Report an issue" widget — every role, every page. */}
      <ReportWidget />

      {/* "Show me" and "How do I…" land on a page with ?show=<key>, and this
          points at the button (lib/walkthrough.ts). Console roles only, on
          their own training too; a carer never has it. */}
      {console_ && (
        <Suspense>
          <CoachMark />
        </Suspense>
      )}
    </div>
  );
}
