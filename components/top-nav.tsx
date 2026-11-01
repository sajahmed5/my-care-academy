"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, Bell, ChevronDown, Menu, Plus, X } from "lucide-react";
import { IntentLink } from "@/components/intent-link";
import { BrandMark } from "@/components/brand-mark";
import { Logo } from "@/components/logo";
import { CommandSearch, type SearchPage } from "@/components/command-search";
import { CodeTile } from "@/components/code-tile";
import { initials } from "@/lib/initials";
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
  /** Other paths that light this link up, e.g. a carer's file under Staff. */
  also?: string[];
  /** Two letters on the tile beside it in the drop-down. */
  code?: string;
  /** One line under it in the drop-down. */
  description?: string;
  /** The heading it sits under in the drop-down. */
  group?: string;
  /**
   * The pages it stands for in the row under the bar, when one drop-down
   * entry is two pages (Absence & holidays).
   */
  row?: MenuLink[];
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
  /** Other paths that belong here, e.g. a carer's file under People. */
  also?: string[];
  /** Carries the count of everything late (the Due item). */
  due?: boolean;
  /** A line across the foot of the drop-down, with a link. */
  footer?: { text: string; href: string; label: string };
}

/** What's due, as the row of tabs under Due (ease-of-use review, 30 Oct 2026). */
const DUE_PAGES: MenuLink[] = [
  { href: "/org/due/supervisions", label: "Supervisions", feature: "people.supervisions" },
  { href: "/org/due/appraisals", label: "Appraisals", feature: "people.supervisions" },
  { href: "/org/due/spot-checks", label: "Spot checks", feature: "people.competency" },
  { href: "/org/due/competency", label: "Competency", feature: "people.competency" },
  { href: "/org/hr/documents", label: "Staff documents", feature: "recruitment.tracker" },
  { href: "/org/due/audits", label: "Service audits", feature: "quality.audits" },
  { href: "/org/due/policies", label: "Policies", feature: "documents.library" },
  { href: "/org/due/forms", label: "Form reviews", feature: "forms.builder" },
];

/**
 * The console menu (redesign, 1 Nov 2026, docs/redesign): six items where
 * there were nine. People is everyone the company employs or supports;
 * Compliance is what used to be Staff audits and Quality; HR's pages sit
 * under People. Anything the company's package leaves out is dropped by
 * withoutGated, and a drop-down left with nothing in it goes with it. A
 * direct visit still lands on the locked page.
 */
const ORG_MENU: MenuItem[] = [
  { label: "Today", href: "/org" },
  // Everything falling due, from every add-on, as tabs on one page. Every
  // tab starts at Growth, so Starter doesn't get it.
  { label: "Due", href: "/org/due", feature: "people.supervisions", due: true, children: DUE_PAGES },
  {
    label: "People",
    also: ["/org/staff"],
    children: [
      // A carer's file is reached from this list, so it lights up here too.
      { href: "/org/learners", label: "Staff", code: "ST", description: "Everyone, their training and checks", also: ["/org/staff", "/org/learners/admin", "/org/learners/statistics"] },
      { href: "/org/clients", label: "Clients", code: "CL", description: "The people you support", feature: "clients.list" },
      { href: "/org/recruitment", label: "Recruitment", code: "RC", description: "Candidates, from application to first day", feature: "recruitment.tracker" },
      {
        href: "/org/hr/absence",
        label: "Absence & holidays",
        code: "AH",
        description: "Sickness, leave and who's off",
        feature: "recruitment.tracker",
        also: ["/org/hr/holidays"],
        row: [
          { href: "/org/hr/absence", label: "Absence" },
          { href: "/org/hr/holidays", label: "Holidays" },
        ],
      },
      { href: "/org/hr/probation", label: "Probation reviews", code: "PB", description: "New starters' reviews and sign-off", feature: "recruitment.tracker" },
      { href: "/org/hr/cases", label: "Disciplinary & grievance", code: "DG", description: "Cases, hearings and outcomes", feature: "recruitment.tracker" },
      { href: "/org/hr/leavers", label: "Leavers", code: "LV", description: "Notice, exit and final records", feature: "recruitment.tracker" },
    ],
  },
  {
    label: "Training",
    children: [
      { href: "/org/courses", label: "Courses", code: "CO", description: "The library and how long each takes", exact: true, also: ["/org/courses/statistics"] },
      { href: "/org/courses/admin", label: "Assign training", code: "AT", description: "Give courses to people, with a due date" },
      { href: "/org/certificates", label: "Certificates", code: "CE", description: "Every certificate, with expiry dates" },
      { href: "/org/observations", label: "Care Certificate", code: "CC", description: "The 15 standards, observed and signed off", feature: "training.observations" },
      {
        href: "/org/face-to-face",
        label: "Face-to-face & classroom",
        code: "FC",
        description: "Sessions at our office, and your own",
        feature: "training.face_to_face",
        also: ["/org/classroom"],
        row: [
          { href: "/org/face-to-face", label: "Face-to-face" },
          { href: "/org/classroom", label: "Classroom", feature: "training.classroom" },
        ],
      },
    ],
  },
  // Staff Audits and Quality, together (STAFF-AUDITS.md, SERVICE-AUDITS.md).
  // The company's own forms, questions and wording are under Settings.
  {
    label: "Compliance",
    also: ["/org/pips"],
    footer: { text: "Getting ready for CQC? Build an evidence pack in one click.", href: "/org/audits/governance", label: "Governance report" },
    children: [
      {
        href: "/org/due/supervisions",
        label: "Supervisions & appraisals",
        code: "SV",
        description: "Book, hold and sign off 1:1s",
        group: "Staff checks",
        feature: "people.supervisions",
        also: ["/org/due/appraisals"],
        row: [
          { href: "/org/due/supervisions", label: "Supervisions" },
          { href: "/org/due/appraisals", label: "Appraisals" },
        ],
      },
      {
        href: "/org/due/spot-checks",
        label: "Spot checks & competency",
        code: "SC",
        description: "Observe care and record sign-off",
        group: "Staff checks",
        feature: "people.competency",
        also: ["/org/due/competency"],
        row: [
          { href: "/org/due/spot-checks", label: "Spot checks" },
          { href: "/org/due/competency", label: "Competency" },
        ],
      },
      { href: "/org/pips", label: "Performance plans", code: "PP", description: "Track improvement goals", group: "Staff checks", feature: "people.performance_plans" },
      { href: "/org/audits", label: "Service audits", code: "SA", description: "Infection control, files, meds", group: "Service quality", feature: "quality.audits", exact: true, also: ["/org/audits/new", "/org/audits/qa"] },
      { href: "/org/audits/governance", label: "Governance report", code: "GR", description: "Monthly overview for CQC", group: "Service quality", feature: "quality.audits" },
      { href: "/org/feedback", label: "Feedback", code: "FB", description: "Surveys from clients and families", group: "Service quality", feature: "quality.feedback" },
      { href: "/org/complaints", label: "Complaints & safeguarding", code: "SG", description: "Log, investigate and close", group: "Safety", feature: "complaints.register" },
    ],
  },
  {
    label: "Documents",
    children: [
      { href: "/org/policies", label: "Policies", code: "PO", description: "Your policies, and who has read them", feature: "documents.library" },
      { href: "/org/forms", label: "Forms", code: "FO", description: "Forms to fill in, and the answers", feature: "forms.builder" },
      { href: "/org/reports", label: "Reports & exports", code: "RE", description: "The training matrix, evidence and spreadsheets" },
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
    // review, 30 Oct 2026). A link, not a drop-down; its pages are in the
    // row under the bar.
    {
      label: "My HR",
      href: "/learn/hr",
      children: [
        { href: "/learn/hr", label: "Leave & letters", feature: "recruitment.tracker" },
        { href: "/learn/reviews", label: "Supervisions", feature: "people.supervisions" },
        { href: "/learn/actions", label: "My actions", feature: "people.supervisions" },
      ],
    },
    { label: "Policies", href: "/learn/policies", feature: "documents.library" },
    { label: "Forms", href: "/learn/forms", feature: "forms.builder" },
    { label: "Notifications", href: "/learn/notifications" },
  ],
};

/** The "+ New" menu: the four things a manager starts most. */
const QUICK_NEW: MenuLink[] = [
  { href: "/org/learners/admin?section=invite", label: "Add staff", description: "Invite someone, or import a list" },
  { href: "/org/courses/admin", label: "Assign training", description: "Courses to people, with a due date" },
  { href: "/org/due/supervisions", label: "Book a supervision", description: "Pick who, then a date", feature: "people.supervisions" },
  { href: "/org/audits/new", label: "Start an audit", description: "Infection control, files, meds and more", feature: "quality.audits" },
];

/**
 * The person menu, on the right. Settings (the Account page, and every
 * add-on's forms, questions and wording) is what an office worker does not
 * get. A manager or office worker is a member of staff too (29 Oct 2026), so
 * they can step across to their own training, and back.
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
  const path = href.split("?")[0];
  if (pathname === path) return true;
  if (exact || SECTION_ROOTS.includes(path)) return false;
  return pathname.startsWith(path + "/");
}

function linkActive(pathname: string, link: MenuLink): boolean {
  if (isActive(pathname, link.href, link.exact)) return true;
  if (link.row?.some((r) => isActive(pathname, r.href, r.exact))) return true;
  return (link.also ?? []).some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function itemActive(pathname: string, item: MenuItem): boolean {
  if (item.href && isActive(pathname, item.href)) return true;
  if (item.children?.some((c) => linkActive(pathname, c))) return true;
  return (item.also ?? []).some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** The late count behind a drop-down entry: its own page and the pages it stands for. */
function lateBehind(link: MenuLink, byPath: Record<string, number>): number {
  const paths = [link.href, ...(link.also ?? []), ...(link.row ?? []).map((r) => r.href)].map((p) => p.split("?")[0]);
  return Object.entries(byPath).reduce((n, [path, count]) => (paths.some((p) => path === p || path.startsWith(p + "/")) ? n + count : n), 0);
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

const panelClass = "absolute top-full z-40 mt-2 min-w-56 rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-xl";

function PanelLink({ link, pathname }: { link: MenuLink; pathname: string }) {
  const active = linkActive(pathname, link);
  return (
    <IntentLink
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors",
        active ? "bg-accent font-semibold text-accent-foreground" : "text-foreground hover:bg-muted",
      )}
    >
      {link.label}
    </IntentLink>
  );
}

/**
 * A drop-down with sections (image 2 of the redesign): an icon tile, the
 * page, a count of what's late behind it, and one line on what it is for.
 */
function MegaPanel({ item, pathname, byPath }: { item: MenuItem; pathname: string; byPath: Record<string, number> }) {
  const links = item.children ?? [];
  const groups: { heading: string | null; links: MenuLink[] }[] = [];
  for (const link of links) {
    const heading = link.group ?? null;
    const g = groups.find((x) => x.heading === heading);
    if (g) g.links.push(link);
    else groups.push({ heading, links: [link] });
  }
  const footer = item.footer && links.some((l) => l.href === item.footer!.href) ? item.footer : null;
  const columns = groups.length > 1 ? groups.length : Math.min(2, Math.ceil(links.length / 4));
  return (
    <div
      className={cn(
        "absolute left-1/2 top-full z-40 mt-2 -translate-x-1/2 overflow-hidden rounded-card border bg-popover text-popover-foreground shadow-2xl",
        columns >= 3 ? "w-[min(1180px,calc(100vw-2rem))]" : columns === 2 ? "w-[min(780px,calc(100vw-2rem))]" : "w-[min(400px,calc(100vw-2rem))]",
      )}
    >
      <div className={cn("grid gap-x-8 gap-y-6 p-6 sm:p-8", columns >= 3 ? "grid-cols-3" : columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
        {groups.map((g, gi) => (
          <div key={g.heading ?? gi} className="min-w-0">
            {g.heading && (
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{g.heading}</p>
            )}
            <ul className="space-y-1">
              {g.links.map((link) => {
                const active = linkActive(pathname, link);
                const late = lateBehind(link, byPath);
                return (
                  <li key={link.href}>
                    <IntentLink
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl p-2.5 transition-colors hover:bg-muted",
                        active && "bg-accent/60",
                      )}
                    >
                      {link.code && <CodeTile code={link.code} />}
                      <span className="min-w-0 flex-1 pt-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-bold leading-tight">{link.label}</span>
                          {late > 0 && (
                            <span className="rounded-full bg-warn px-2 py-0.5 text-xs font-semibold text-warn-foreground">
                              {late} due
                            </span>
                          )}
                        </span>
                        {link.description && (
                          <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{link.description}</span>
                        )}
                      </span>
                    </IntentLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/50 px-6 py-3.5 text-sm sm:px-8">
          <span className="text-muted-foreground">{footer.text}</span>
          <IntentLink href={footer.href} className="inline-flex items-center gap-1 font-bold text-primary hover:underline">
            {footer.label}
            <ArrowRight className="size-4" />
          </IntentLink>
        </div>
      )}
    </div>
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
  due,
  trial,
  notifications = 0,
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
  /** What's late across the company, for the Due item and the drop-downs. */
  due?: { total: number; byPath: Record<string, number> };
  /** The free trial, while it runs: "Trial · 7 days left", linking to the packages for a manager. */
  trial?: { label: string; href: string | null } | null;
  /** Unread notifications about their own training. */
  notifications?: number;
}) {
  const { open, setOpen, ref, pathname } = useOpenMenu();
  // A manager or office worker on their own training gets the carer's menu,
  // with the console one click away at the end of it.
  const learnView = hasConsole(role) && (pathname === "/learn" || pathname.startsWith("/learn/"));
  const console_ = hasConsole(role) && !learnView;
  const menu = learnView
    ? [...withoutGated(MENUS.learner, enabled), { label: "Console", href: "/org" }]
    : role
      ? (MENUS[role] ?? [])
      : [];
  const items = withoutGated(menu, enabled).map((item) =>
    item.href && item.children?.length ? { ...item, href: item.children[0].href } : item,
  );
  const quick = console_ ? withoutGated(QUICK_NEW, enabled) : [];
  const person = personLinks(role, learnView);
  const showLearnerBits = role === "learner" || learnView;
  const current = items.find((item) => itemActive(pathname, item));
  const byPath = due?.byPath ?? {};

  // The pages the search can jump to: everything in the menu.
  const pages: SearchPage[] = items.flatMap((item) =>
    item.children?.length
      ? item.children.flatMap((c) => [
          { href: c.href, label: c.label, section: item.label, description: c.description },
          ...(c.row ?? []).filter((r) => r.href !== c.href).map((r) => ({ href: r.href, label: r.label, section: item.label })),
        ])
      : item.href
        ? [{ href: item.href, label: item.label }]
        : [],
  );

  // The row under the bar: the pages of the section you are in.
  const rowLinks: MenuLink[] = (current?.children ?? []).flatMap((c) => (c.row ? withoutGated(c.row, enabled) : [c]));
  const showRow = rowLinks.length > 1 && open !== "__all";

  // On a phone the row scrolls sideways; bring the open page into it.
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
        className="block min-h-10 w-full rounded-xl px-3 py-2 text-left text-sm text-danger-foreground transition-colors hover:bg-danger"
      >
        Sign out
      </button>
    </form>
  );

  const itemClass = (active: boolean) =>
    cn(
      "inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[15px] font-semibold transition-colors",
      active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted",
    );

  return (
    <div ref={ref} data-print="hide" className="sticky top-0 z-30 border-b bg-card text-card-foreground">
      <div className="relative mx-auto flex h-[68px] w-full max-w-[1384px] items-center gap-2 px-4 sm:px-8">
        <IntentLink
          href={role ? (items[0]?.href ?? "/") : "/"}
          className="mr-2 inline-flex shrink-0 items-center rounded-lg py-1 focus-visible:outline-2"
          aria-label={brandName ?? "My Care Academy"}
        >
          {brandLogo ? <BrandMark logoUrl={brandLogo} orgName={brandName} width={120} /> : <Logo width={150} />}
        </IntentLink>

        {/* Wide screens: the menu itself */}
        <nav aria-label="Main" className="hidden min-w-0 flex-1 items-center gap-1 nav:flex">
          {items.map((item) => {
            // Only the one whose pages are showing: Audits sits under both Due and Compliance.
            const active = item === current;
            const count = item.due ? (due?.total ?? 0) : (badges[item.href ?? ""] ?? 0);
            const badge = count > 0 && (
              <span
                className={cn(
                  "inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold",
                  item.due ? "bg-amber-400 text-[#1f1300]" : "bg-danger-foreground text-white",
                )}
              >
                {count}
              </span>
            );
            if (item.href && !item.children?.length) {
              return (
                <IntentLink key={item.label} href={item.href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
                  {item.label}
                  {badge}
                </IntentLink>
              );
            }
            if (item.href) {
              // A link whose pages show in the row (Due, My HR).
              return (
                <IntentLink key={item.label} href={item.href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
                  {item.label}
                  {badge}
                </IntentLink>
              );
            }
            const isOpen = open === item.label;
            const mega = (item.children ?? []).some((c) => c.code);
            return (
              <div key={item.label} className={mega ? "static" : "relative"}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  onClick={() => toggle(item.label)}
                  className={itemClass(active || isOpen)}
                >
                  {item.label}
                  <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen &&
                  (mega ? (
                    <MegaPanel item={item} pathname={pathname} byPath={byPath} />
                  ) : (
                    <div className={cn(panelClass, "left-0")}>
                      {(item.children ?? []).map((c) => (
                        <PanelLink key={c.href} link={c} pathname={pathname} />
                      ))}
                    </div>
                  ))}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {showLearnerBits && search && <div className="hidden xl:block">{search}</div>}
          {showLearnerBits && stars}

          {console_ && <CommandSearch pages={pages} />}

          {trial &&
            (trial.href ? (
              <IntentLink
                href={trial.href}
                className="hidden h-11 items-center rounded-xl bg-warn px-3.5 text-sm font-bold text-warn-foreground transition-colors hover:brightness-95 nav:inline-flex"
              >
                {trial.label}
              </IntentLink>
            ) : (
              <span role="status" className="hidden h-11 items-center rounded-xl bg-warn px-3.5 text-sm font-bold text-warn-foreground nav:inline-flex">
                {trial.label}
              </span>
            ))}

          {quick.length > 0 && (
            <div className="relative hidden nav:block">
              <button
                type="button"
                aria-expanded={open === "__new"}
                aria-haspopup="true"
                onClick={() => toggle("__new")}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                <Plus className="size-4" aria-hidden />
                New
              </button>
              {open === "__new" && (
                <div className={cn(panelClass, "right-0 w-72")}>
                  {quick.map((q) => (
                    <IntentLink key={q.href} href={q.href} className="block rounded-xl px-3 py-2 transition-colors hover:bg-muted">
                      <span className="block text-sm font-semibold">{q.label}</span>
                      {q.description && <span className="block text-xs text-muted-foreground">{q.description}</span>}
                    </IntentLink>
                  ))}
                </div>
              )}
            </div>
          )}

          {console_ && (
            <IntentLink
              href="/learn/notifications"
              aria-label={notifications > 0 ? `Notifications, ${notifications} unread` : "Notifications"}
              className="relative hidden size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted nav:inline-flex"
            >
              <Bell className="size-5" />
              {notifications > 0 && (
                <span className="absolute right-2 top-2 inline-flex min-w-4 items-center justify-center rounded-full bg-danger-foreground px-1 text-[10px] font-bold leading-4 text-white">
                  {notifications}
                </span>
              )}
            </IntentLink>
          )}

          {/* Person menu, wide screens */}
          <div className="relative hidden nav:block">
            <button
              type="button"
              aria-expanded={open === "__person"}
              aria-haspopup="true"
              aria-label="Your account"
              onClick={() => toggle("__person")}
              className="inline-flex size-11 items-center justify-center rounded-full bg-sidebar text-sm font-bold text-sidebar-foreground ring-offset-2 transition-shadow hover:ring-2 hover:ring-border"
            >
              {initials(name, email)}
            </button>
            {open === "__person" && (
              <div className={cn(panelClass, "right-0 w-64")}>
                <div className="border-b px-3 pb-2.5 pt-2">
                  {name && <p className="truncate text-sm font-semibold">{name}</p>}
                  <p className="truncate text-xs text-muted-foreground">{email}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{roleLabel}</p>
                </div>
                <div className="py-1">
                  {person.map((l) => (
                    <PanelLink key={l.href} link={l} pathname={pathname} />
                  ))}
                  {signOut}
                </div>
                <p className="border-t px-3 pt-2 text-center text-[11px] text-muted-foreground">{version}</p>
              </div>
            )}
          </div>

          {/* Narrow screens: one button for everything */}
          <button
            type="button"
            aria-expanded={open === "__all"}
            aria-label={open === "__all" ? "Close menu" : "Open menu"}
            onClick={() => toggle("__all")}
            className="inline-flex size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted nav:hidden"
          >
            {open === "__all" ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {/* On a phone the trial pill is a strip under the bar (image 5). */}
      {trial && open !== "__all" && (
        <div role="status" className="flex items-center justify-between gap-3 bg-warn px-4 py-2.5 text-sm text-warn-foreground nav:hidden">
          <span className="font-semibold">{trial.label}</span>
          {trial.href && (
            <IntentLink href={trial.href} className="font-bold underline-offset-2 hover:underline">
              Choose a plan
            </IntentLink>
          )}
        </div>
      )}

      {/* The pages of the section you are in, one click away, so changing
          between them doesn't mean opening the drop-down again. */}
      {showRow && (
        <nav aria-label={`${current!.label} pages`} className="border-t bg-card">
          <div ref={subRef} className="mx-auto flex w-full max-w-[1384px] min-w-0 gap-1 overflow-x-auto px-2 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
            {rowLinks.map((c) => {
              const active = linkActive(pathname, c);
              return (
                <IntentLink
                  key={c.href}
                  href={c.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[15px] transition-colors",
                    active ? "border-primary font-bold text-primary" : "border-transparent font-medium text-muted-foreground hover:text-foreground",
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
        <nav aria-label="Main" className="max-h-[calc(100svh-68px)] overflow-y-auto border-t px-3 pb-6 pt-2 nav:hidden">
          {showLearnerBits && search && <div className="py-2">{search}</div>}
          {quick.length > 0 && (
            <div className="grid grid-cols-2 gap-2 py-2">
              {quick.map((q) => (
                <IntentLink key={q.href} href={q.href} className="flex min-h-11 items-center justify-center rounded-xl border bg-background px-3 text-center text-sm font-semibold">
                  {q.label}
                </IntentLink>
              ))}
            </div>
          )}
          {items.map((item, i) =>
            item.href && !item.children?.length ? (
              // A plain link after a drop-down's list would read as part of it.
              <div key={item.label} className={items[i - 1]?.children ? "mt-3" : undefined}>
                <MobileLink href={item.href} label={item.label} badge={item.due ? (due?.total ?? 0) : (badges[item.href] ?? 0)} due={item.due} active={itemActive(pathname, item)} />
              </div>
            ) : item.href ? (
              <div key={item.label} className="pt-3">
                <MobileLink href={item.href} label={item.label} badge={item.due ? (due?.total ?? 0) : 0} due={item.due} active={itemActive(pathname, item)} />
                <div className="ml-3 border-l pl-1">
                  {(item.children ?? []).map((c) => (
                    <MobileLink key={c.href} href={c.href} label={c.label} active={linkActive(pathname, c)} />
                  ))}
                </div>
              </div>
            ) : (
              <div key={item.label} className="pt-3">
                <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                {(item.children ?? []).flatMap((c) => (c.row ? withoutGated(c.row, enabled) : [c])).map((c) => (
                  <MobileLink key={c.href} href={c.href} label={c.label} active={linkActive(pathname, c)} badge={lateBehind(c, byPath)} due />
                ))}
              </div>
            ),
          )}
          <div className="mt-3 border-t pt-3">
            <p className="truncate px-3 text-sm font-semibold">{name ?? email}</p>
            <p className="px-3 pb-1 text-xs text-muted-foreground">
              {email && name ? `${email} · ` : ""}
              {roleLabel} · {version}
            </p>
            {person.map((l) => (
              <MobileLink key={l.href} href={l.href} label={l.label} active={isActive(pathname, l.href)} />
            ))}
            {console_ && <MobileLink href="/learn/notifications" label="Notifications" active={false} badge={notifications} />}
            <button
              type="button"
              onClick={() => {
                setOpen(null);
                window.dispatchEvent(new Event(OPEN_REPORT_EVENT));
              }}
              className="flex min-h-11 w-full items-center rounded-xl px-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              Report a problem
            </button>
            <form action="/auth/signout" method="post">
              <button type="submit" className="flex min-h-11 w-full items-center rounded-xl px-3 text-sm font-semibold text-danger-foreground">
                Sign out
              </button>
            </form>
          </div>
        </nav>
      )}
    </div>
  );
}

function MobileLink({ href, label, active, badge = 0, due = false }: { href: string; label: string; active: boolean; badge?: number; due?: boolean }) {
  return (
    <IntentLink
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-medium transition-colors",
        active ? "bg-accent font-semibold text-accent-foreground" : "text-foreground hover:bg-muted",
      )}
    >
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span
          className={cn(
            "inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold",
            due ? "bg-warn text-warn-foreground" : "bg-danger-foreground text-white",
          )}
        >
          {badge}
        </span>
      )}
    </IntentLink>
  );
}
