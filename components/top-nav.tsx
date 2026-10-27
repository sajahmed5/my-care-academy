"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { IntentLink } from "@/components/intent-link";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/auth";
import { withoutGated, type FeatureKey } from "@/lib/features";

interface MenuLink {
  href: string;
  label: string;
  /** Only show when the organisation has this feature. */
  feature?: FeatureKey;
  /** Highlight only on this exact path — an "Overview" that shares its root. */
  exact?: boolean;
}

interface MenuItem {
  label: string;
  /** A plain link. Leave out for a drop-down. */
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
 * Anything an organisation's package leaves out is dropped by withoutGated,
 * and a drop-down left with nothing in it goes with it.
 */
const ORG_MENU: MenuItem[] = [
  { label: "Overview", href: "/org" },
  {
    label: "Learners",
    also: ["/org/staff"],
    children: [
      { href: "/org/learners", label: "Overview", exact: true },
      { href: "/org/learners/statistics", label: "Every assignment" },
      { href: "/org/learners/admin", label: "Add & invite staff" },
    ],
  },
  {
    label: "Training",
    children: [
      { href: "/org/courses", label: "Courses overview", exact: true },
      { href: "/org/courses/admin", label: "Assign training" },
      { href: "/org/courses/statistics", label: "Time taken" },
      { href: "/org/classroom", label: "Classroom sessions" },
      { href: "/org/observations", label: "Care Certificate", feature: "training.observations" },
    ],
  },
  { label: "Certificates", href: "/org/certificates" },
  {
    label: "Who's due",
    children: [
      { href: "/org/due/supervisions", label: "Supervisions", feature: "people.supervisions" },
      { href: "/org/due/spot-checks", label: "Spot checks", feature: "people.competency" },
      { href: "/org/due/audits", label: "Audits", feature: "quality.audits" },
    ],
  },
  {
    label: "Quality",
    children: [
      { href: "/org/audits", label: "Audits", feature: "quality.audits" },
      { href: "/org/feedback", label: "Feedback", feature: "quality.feedback" },
      { href: "/org/complaints", label: "Complaints", feature: "complaints.register" },
      { href: "/org/incidents", label: "Incidents & accidents", feature: "complaints.register" },
      { href: "/org/pips", label: "Performance plans", feature: "complaints.register" },
    ],
  },
  { label: "Recruitment", href: "/org/recruitment", feature: "recruitment.tracker" },
  {
    label: "Documents",
    children: [
      { href: "/org/policies", label: "Policies", feature: "documents.library" },
      { href: "/org/forms", label: "Forms", feature: "forms.builder" },
      { href: "/org/reports", label: "Evidence & exports" },
    ],
  },
];

const MENUS: Record<string, MenuItem[]> = {
  platform_admin: [
    { label: "Overview", href: "/platform" },
    { label: "Organisations", href: "/platform/organisations" },
    { label: "Packages", href: "/platform/tiers" },
    { label: "Analytics", href: "/platform/analytics" },
    {
      label: "Content",
      children: [
        { href: "/platform/courses", label: "Courses" },
        { href: "/platform/documents", label: "Documents" },
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
    { label: "My actions", href: "/learn/actions" },
    { label: "Policies", href: "/learn/policies", feature: "documents.library" },
    { label: "Forms", href: "/learn/forms", feature: "forms.builder" },
    { label: "Notifications", href: "/learn/notifications" },
  ],
};

/**
 * The person menu, on the right. Account (billing, and who has console
 * access) is the one page an office worker does not get.
 */
function personLinks(role: UserRole | null): MenuLink[] {
  if (role === "learner") return [{ href: "/learn/profile", label: "Profile" }];
  if (role === "org_admin") {
    return [
      { href: "/account", label: "My account" },
      { href: "/org/billing", label: "Account" },
    ];
  }
  return [{ href: "/account", label: "My account" }];
}

/** Section roots that only highlight on an exact match. */
const SECTION_ROOTS = ["/platform", "/org", "/learn"];

function isActive(pathname: string, href: string, exact = false): boolean {
  if (pathname === href) return true;
  if (exact || SECTION_ROOTS.includes(href)) return false;
  return pathname.startsWith(href + "/");
}

function itemActive(pathname: string, item: MenuItem): boolean {
  if (item.href && isActive(pathname, item.href)) return true;
  if (item.children?.some((c) => isActive(pathname, c.href, c.exact))) return true;
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
  const active = isActive(pathname, link.href, link.exact);
  return (
    <IntentLink
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-md px-3 py-2 text-sm transition-colors",
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
  const items = withoutGated(role ? (MENUS[role] ?? []) : [], enabled);
  const person = personLinks(role);
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
      <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
        <IntentLink
          href={role ? (items[0]?.href ?? "/") : "/"}
          className="inline-flex shrink-0 rounded-lg bg-white px-2.5 py-1.5 shadow-sm"
        >
          <BrandMark logoUrl={brandLogo} orgName={brandName} width={112} />
        </IntentLink>

        {/* Wide screens: the menu itself */}
        <nav aria-label="Main" className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
          {items.map((item) => {
            const active = itemActive(pathname, item);
            const itemClass = cn(
              "inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
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
          {search && <div className="hidden xl:block">{search}</div>}
          {stars}

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
          <div ref={subRef} className="flex min-w-0 gap-1 overflow-x-auto px-3 sm:px-4">
            {current.children.map((c) => {
              const active = isActive(pathname, c.href, c.exact);
              return (
                <IntentLink
                  key={c.href}
                  href={c.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm transition-colors",
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
          {search && <div className="py-2">{search}</div>}
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
                  <MobileLink key={c.href} href={c.href} label={c.label} active={isActive(pathname, c.href, c.exact)} />
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
