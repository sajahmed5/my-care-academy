"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { IntentLink } from "@/components/intent-link";
import { BrandMark } from "@/components/brand-mark";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/auth";
import { withoutGated, type FeatureKey } from "@/lib/features";
import { OPEN_REPORT_EVENT } from "@/components/report-widget";

interface MenuLink {
  href: string;
  label: string;
  /** Only show when the organisation has this feature. */
  feature?: FeatureKey;
  /** Highlight only on this exact path — an "Overview" that shares its root. */
  exact?: boolean;
  /** Other paths that light this link up, e.g. a carer's file under Overview. */
  also?: string[];
}

interface MenuItem {
  label: string;
  /**
   * A plain link. Leave out for a drop-down. With children as well, it is a
   * link to the first of them the company has, and they show in the row
   * under the bar.
   */
  href?: string;
  feature?: FeatureKey;
  children?: MenuLink[];
  /** Other paths that belong here, e.g. a carer's file under Learners. */
  also?: string[];
}

/**
 * The menu across the top of every signed-in page (Saj, 27 Oct 2026). It
 * replaced the left-hand panel, whose fifteen-odd links became eight items:
 * a few plain links, the rest drop-downs grouped as the panel grouped them.
 * Anything the company's package leaves out is dropped by withoutGated, and a
 * drop-down left with nothing in it goes with it — for the console as for a
 * carer (Saj, 30 Oct 2026: padlocked items "don't look good"; they were
 * shown from 29 Oct). A direct visit still lands on the locked page.
 */
const ORG_MENU: MenuItem[] = [
  { label: "Overview", href: "/org" },
  // Everything falling due, from every add-on, as tabs on one page (ease-of-
  // use review, 30 Oct 2026) — it was eight "…due" pages under four menus.
  // Staff documents is one of its tabs, though it lives under /org/hr.
  // Every tab starts at Growth, so Starter doesn't get it.
  { label: "Who's due", href: "/org/due", also: ["/org/hr/documents"], feature: "people.supervisions" },
  {
    label: "Staff",
    also: ["/org/staff"],
    children: [
      // A carer's file is reached from this list, so it lights up here too —
      // on the file, nothing in the row under the bar said where you were.
      { href: "/org/learners", label: "All staff", exact: true, also: ["/org/staff"] },
      { href: "/org/learners/admin", label: "Add staff" },
      { href: "/org/learners/statistics", label: "All training assigned" },
    ],
  },
  {
    label: "Training",
    children: [
      // How long each course takes is a click from the courses list.
      { href: "/org/courses", label: "Courses", exact: true, also: ["/org/courses/statistics"] },
      { href: "/org/courses/admin", label: "Assign training" },
      { href: "/org/certificates", label: "Certificates" },
      { href: "/org/face-to-face", label: "Face-to-face training", feature: "training.face_to_face" },
      { href: "/org/classroom", label: "Classroom sessions", feature: "training.classroom" },
      { href: "/org/observations", label: "Care Certificate", feature: "training.observations" },
    ],
  },
  { label: "Clients", href: "/org/clients", feature: "clients.list" },
  // Staff Audits (STAFF-AUDITS.md): who's due each one, and performance
  // plans. Audits of the service sit under Quality. The company's own forms,
  // questions and wording are under Settings, for managers (30 Oct 2026).
  {
    label: "Staff audits",
    also: ["/org/pips"],
    children: [
      { href: "/org/due/supervisions", label: "Supervisions & appraisals", feature: "people.supervisions", also: ["/org/due/appraisals"] },
      { href: "/org/due/spot-checks", label: "Spot checks & competency", feature: "people.competency", also: ["/org/due/competency"] },
      { href: "/org/pips", label: "Performance plans", feature: "people.performance_plans" },
    ],
  },
  {
    label: "Quality",
    children: [
      { href: "/org/audits", label: "Service audits", feature: "quality.audits" },
      { href: "/org/audits/governance", label: "Governance report", feature: "quality.audits" },
      { href: "/org/complaints", label: "Complaints & safeguarding", feature: "complaints.register" },
      { href: "/org/feedback", label: "Feedback", feature: "quality.feedback" },
    ],
  },
  // The HR pack (HR-PACK.md): employing someone, from application to leaving.
  {
    label: "HR",
    also: ["/org/recruitment", "/org/hr"],
    children: [
      { href: "/org/recruitment", label: "Recruitment", feature: "recruitment.tracker" },
      { href: "/org/hr/absence", label: "Absence", feature: "recruitment.tracker" },
      { href: "/org/hr/holidays", label: "Holidays", feature: "recruitment.tracker" },
      { href: "/org/hr/probation", label: "Probation reviews", feature: "recruitment.tracker" },
      { href: "/org/hr/cases", label: "Disciplinary & grievance", feature: "recruitment.tracker" },
      { href: "/org/hr/leavers", label: "Leavers", feature: "recruitment.tracker" },
    ],
  },
  {
    label: "Documents",
    children: [
      { href: "/org/policies", label: "Policies", feature: "documents.library" },
      { href: "/org/forms", label: "Forms", feature: "forms.builder" },
      { href: "/org/reports", label: "Reports & exports" },
    ],
  },
];

const MENUS: Record<string, MenuItem[]> = {
  platform_admin: [
    { label: "Overview", href: "/platform" },
    { label: "Organisations", href: "/platform/organisations" },
    { label: "Packages", href: "/platform/tiers" },
    { label: "Analytics", href: "/platform/analytics" },
    { label: "Face to face", href: "/platform/face-to-face" },
    { label: "Bespoke reports", href: "/platform/bespoke-reports" },
    {
      label: "Content",
      children: [
        { href: "/platform/courses", label: "Courses" },
        { href: "/platform/documents", label: "Policies" },
        { href: "/platform/forms", label: "Forms" },
      ],
    },
    { label: "Issues", href: "/platform/reports" },
    { label: "Billing", href: "/platform/billing" },
    { label: "Automation", href: "/platform/settings" },
  ],
  org_admin: ORG_MENU,
  org_office: ORG_MENU,
  learner: [
    { label: "Dashboard", href: "/learn" },
    { label: "Training", href: "/learn/modules", also: ["/learn/courses", "/learn/programmes"] },
    { label: "Certificates", href: "/learn/certificates" },
    // One item for everything between them and their employer (ease-of-use
    // review, 30 Oct 2026): it was three — My actions, Supervisions, My HR.
    // A link, not a drop-down; its pages are in the row under the bar.
    {
      label: "My HR",
      href: "/learn/hr",
      children: [
        { href: "/learn/hr", label: "Leave & letters", feature: "recruitment.tracker" },
        // Their booked supervisions and appraisal self-assessment (STAFF-AUDITS.md).
        { href: "/learn/reviews", label: "Supervisions", feature: "people.supervisions" },
        // Actions come from supervisions, spot checks, complaints and audits: Growth and up.
        { href: "/learn/actions", label: "My actions", feature: "people.supervisions" },
      ],
    },
    { label: "Policies", href: "/learn/policies", feature: "documents.library" },
    { label: "Forms", href: "/learn/forms", feature: "forms.builder" },
    { label: "Notifications", href: "/learn/notifications" },
  ],
};

/**
 * The person menu, on the right. Settings (the Account page, and every
 * add-on's forms, questions and wording) is what an office worker does not get. A manager or office
 * worker is a member of staff too (29 Oct 2026), so they can step across to
 * their own training, and back.
 */
function personLinks(role: UserRole | null, learnView: boolean): MenuLink[] {
  if (role === "learner") return [{ href: "/learn/profile", label: "Profile" }];
  const across = learnView
    ? { href: "/org", label: "Back to the console", exact: true }
    : { href: "/learn", label: "My training", exact: true };
  if (role === "org_admin") {
    return [
      across,
      { href: "/account", label: "My account" },
      { href: "/org/settings", label: "Settings", also: ["/org/billing"] },
    ];
  }
  if (role === "org_office") return [across, { href: "/account", label: "My account" }];
  return [{ href: "/account", label: "My account" }];
}

/** The console roles, who see their own training under /learn. */
function hasConsole(role: UserRole | null): boolean {
  return role === "org_admin" || role === "org_office";
}

/** Section roots that only highlight on an exact match. */
const SECTION_ROOTS = ["/platform", "/org", "/learn"];

function isActive(pathname: string, href: string, exact = false): boolean {
  if (pathname === href) return true;
  if (exact || SECTION_ROOTS.includes(href)) return false;
  return pathname.startsWith(href + "/");
}

function linkActive(pathname: string, link: MenuLink): boolean {
  if (isActive(pathname, link.href, link.exact)) return true;
  return (link.also ?? []).some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function itemActive(pathname: string, item: MenuItem): boolean {
  if (item.href && isActive(pathname, item.href)) return true;
  if (item.children?.some((c) => linkActive(pathname, c))) return true;
  return (item.also ?? []).some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Initials for the person button: "QA Office Worker" → "QO", an email → "QA". */
function initials(name: string | null, email: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return (words[0] ?? email ?? "?").slice(0, 2).toUpperCase();
}

/**
 * One drop-down open at a time; it closes on a click elsewhere, on Escape,
 * and when the page changes.
 */
function useOpenMenu() {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(null), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, ref, pathname };
}

const panelClass =
  "absolute top-full z-40 mt-1 min-w-52 rounded-lg border bg-card p-1 text-card-foreground shadow-lg";

function PanelLink({ link, pathname }: { link: MenuLink; pathname: string }) {
  const active = linkActive(pathname, link);
  return (
    <IntentLink
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors",
        active ? "bg-muted font-medium text-foreground" : "text-foreground/80 hover:bg-muted",
      )}
    >
      {link.label}
    </IntentLink>
  );
}

export function TopNav({
  role,
  name,
  email,
  roleLabel,
  badges = {},
  enabled = {},
  version,
  brandLogo,
  brandName,
  search,
  stars,
}: {
  role: UserRole | null;
  name: string | null;
  email: string | null;
  roleLabel: string;
  badges?: Record<string, number>;
  /** Feature keys the organisation has — gated items only show when enabled here. */
  enabled?: Record<string, boolean>;
  version: string;
  brandLogo?: string | null;
  brandName?: string | null;
  /** A carer's course search: in the bar on wide screens, in the menu on narrow ones. */
  search?: React.ReactNode;
  /** A carer's stars, always in view — awards fly to it. */
  stars?: React.ReactNode;
}) {
  const { open, setOpen, ref, pathname } = useOpenMenu();
  // A manager or office worker on their own training gets the carer's menu,
  // with the console one click away at the end of it.
  const learnView = hasConsole(role) && (pathname === "/learn" || pathname.startsWith("/learn/"));
  const menu = learnView
    ? [...withoutGated(MENUS.learner, enabled), { label: "Console", href: "/org" }]
    : role
      ? (MENUS[role] ?? [])
      : [];
  const items = withoutGated(menu, enabled).map((item) =>
    item.href && item.children?.length ? { ...item, href: item.children[0].href } : item,
  );
  const person = personLinks(role, learnView);
  const showLearnerBits = role === "learner" || learnView;
  const current = items.find((item) => itemActive(pathname, item));

  // On a phone the sub-page row scrolls sideways; bring the open page into it.
  const subRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = subRef.current;
    const link = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && link) row.scrollLeft = link.offsetLeft - (row.clientWidth - link.offsetWidth) / 2;
  }, [pathname]);
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));

  const signOut = (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="block w-full rounded-md px-3 py-2 text-left text-sm text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/40"
      >
        Sign out
      </button>
    </form>
  );

  return (
    <div ref={ref} data-print="hide" className="sticky top-0 z-30 bg-sidebar text-sidebar-foreground">
      {/* Padding so the logo's own edge (it has px-1) and the tab labels
          (px-3) fall on the page's edge below: 16px, 24px from sm up. */}
      <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
        {/* Our logo in white straight on the bar; in a white box it looked
            pasted on. An organisation's uploaded logo keeps the box — its
            colours are unknown and may not show on the dark bar. */}
        <IntentLink
          href={role ? (items[0]?.href ?? "/") : "/"}
          className={cn(
            "inline-flex shrink-0 rounded-lg",
            brandLogo ? "bg-white px-2.5 py-1.5 shadow-sm" : "px-1 py-1",
          )}
        >
          {brandLogo ? (
            <BrandMark logoUrl={brandLogo} orgName={brandName} width={112} />
          ) : (
            <Logo width={128} className="[filter:var(--menu-logo-filter,brightness(0)_invert(1))]" />
          )}
        </IntentLink>

        {/* Wide screens: the menu itself */}
        <nav aria-label="Main" className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
          {items.map((item) => {
            // Only the one whose sub-pages are showing: Audits sits under both
            // Who's due and Quality.
            const active = item === current;
            const itemClass = cn(
              "inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_-2px_0_var(--highlight)]"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            );
            if (item.href) {
              const badge = badges[item.href] ?? 0;
              return (
                <IntentLink
                  key={item.label}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={itemClass}
                >
                  {item.label}
                  {badge > 0 && (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">
                      {badge}
                    </span>
                  )}
                </IntentLink>
              );
            }
            const isOpen = open === item.label;
            return (
              <div key={item.label} className="relative">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  onClick={() => toggle(item.label)}
                  className={itemClass}
                >
                  {item.label}
                  <ChevronDown className={cn("size-3.5 transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className={cn(panelClass, "left-0")}>
                    {(item.children ?? []).map((c) => (
                      <PanelLink key={c.href} link={c} pathname={pathname} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {showLearnerBits && search && <div className="hidden xl:block">{search}</div>}
          {showLearnerBits && stars}

          {/* Person menu, wide screens */}
          <div className="relative hidden lg:block">
            <button
              type="button"
              aria-expanded={open === "__person"}
              aria-haspopup="true"
              aria-label="Your account"
              onClick={() => toggle("__person")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-1.5 transition-colors hover:bg-sidebar-accent/60"
            >
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">
                {initials(name, email)}
              </span>
              <ChevronDown className="size-3.5 text-sidebar-foreground/70" />
            </button>
            {open === "__person" && (
              <div className={cn(panelClass, "right-0 w-64")}>
                <div className="border-b px-3 pb-2 pt-1.5">
                  {name && <p className="truncate text-sm font-medium">{name}</p>}
                  <p className="truncate text-xs text-muted-foreground">{email}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{roleLabel}</p>
                </div>
                <div className="py-1">
                  {person.map((l) => (
                    <PanelLink key={l.href} link={l} pathname={pathname} />
                  ))}
                  {signOut}
                </div>
                <p className="border-t px-3 pt-1.5 text-center text-[11px] text-muted-foreground">{version}</p>
              </div>
            )}
          </div>

          {/* Narrow screens: one button for everything */}
          <button
            type="button"
            aria-expanded={open === "__all"}
            aria-label={open === "__all" ? "Close menu" : "Open menu"}
            onClick={() => toggle("__all")}
            className="inline-flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent/60 lg:hidden"
          >
            {open === "__all" ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* The sub-pages of the menu you are in, one click away, so changing
          between them doesn't mean opening the drop-down again (Saj, 27 Oct
          2026). Plain links have none. */}
      {current?.children && open !== "__all" && (
        <nav
          aria-label={`${current.label} pages`}
          className="border-b bg-card text-foreground"
        >
          <div ref={subRef} className="flex min-w-0 gap-1 overflow-x-auto px-1 sm:px-3">
            {current.children.map((c) => {
              const active = linkActive(pathname, c);
              return (
                <IntentLink
                  key={c.href}
                  href={c.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm transition-colors",
                    active
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.label}
                </IntentLink>
              );
            })}
          </div>
        </nav>
      )}

      {open === "__all" && (
        <nav
          aria-label="Main"
          className="max-h-[calc(100svh-3.5rem)] overflow-y-auto border-t border-sidebar-border px-3 pb-4 pt-2 lg:hidden"
        >
          {showLearnerBits && search && <div className="py-2">{search}</div>}
          {items.map((item, i) =>
            item.href ? (
              // A plain link after a drop-down's list would read as part of it.
              <div key={item.label} className={items[i - 1]?.children ? "mt-3" : undefined}>
                <MobileLink href={item.href} label={item.label} badge={badges[item.href] ?? 0} active={itemActive(pathname, item)} />
              </div>
            ) : (
              <div key={item.label} className="pt-3">
                <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/50">
                  {item.label}
                </p>
                {(item.children ?? []).map((c) => (
                  <MobileLink key={c.href} href={c.href} label={c.label} active={linkActive(pathname, c)} />
                ))}
              </div>
            ),
          )}
          <div className="mt-3 border-t border-sidebar-border pt-3">
            <p className="truncate px-3 text-sm">{email}</p>
            <p className="px-3 pb-1 text-xs text-sidebar-foreground/60">{roleLabel} · {version}</p>
            {person.map((l) => (
              <MobileLink key={l.href} href={l.href} label={l.label} active={isActive(pathname, l.href)} />
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(null);
                window.dispatchEvent(new Event(OPEN_REPORT_EVENT));
              }}
              className="flex min-h-11 w-full items-center rounded-lg px-3 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
            >
              Report a problem
            </button>
            <form action="/auth/signout" method="post">
              <button type="submit" className="flex min-h-11 w-full items-center rounded-lg px-3 text-sm font-medium text-rose-300">
                Sign out
              </button>
            </form>
          </div>
        </nav>
      )}
    </div>
  );
}

function MobileLink({ href, label, active, badge = 0 }: { href: string; label: string; active: boolean; badge?: number }) {
  return (
    <IntentLink
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
      )}
    >
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">
          {badge}
        </span>
      )}
    </IntentLink>
  );
}
