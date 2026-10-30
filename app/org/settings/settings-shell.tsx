import Link from "next/link";
import type { UserContext } from "@/lib/auth";
import { enabledMap } from "@/lib/entitlements";
import type { FeatureKey } from "@/lib/features";
import { DashboardShell } from "@/components/dashboard-shell";

interface SettingsPage {
  href: string;
  label: string;
  hint: string;
}

interface SettingsGroup {
  title: string;
  /** Shown when the package has any one of these. Leave out for always. */
  features?: FeatureKey[];
  pages: SettingsPage[];
}

/**
 * Settings, one add-on to a tab (Saj, 30 Oct 2026): each add-on's own forms,
 * questions and wording sit under its own heading, never beside another's —
 * Forms and Policies get theirs when their settings are built. Add a group
 * here and it appears on every settings page.
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "Your company",
    pages: [
      {
        href: "/org/billing",
        label: "Account and package",
        hint: "Your package and billing, your logo, AI drafting, and who has the console.",
      },
    ],
  },
  {
    // The HR pack (HR-PACK.md), all under one heading: recruitment, then
    // employing someone.
    title: "HR",
    features: ["recruitment.tracker"],
    pages: [
      {
        href: "/org/settings/recruitment",
        label: "How you recruit",
        hint: "The steps you use, references, offer letter wording and the welcome pack.",
      },
      {
        href: "/org/settings/recruitment/forms",
        label: "Forms and literacy test",
        hint: "Your own questions on the application, interview and reference forms; the test; rejection reasons and offer conditions.",
      },
      {
        href: "/org/settings/recruitment/documents",
        label: "Documents to sign",
        hint: "Role acceptance, the contract and the refund of training agreement, in your wording.",
      },
      {
        href: "/org/settings/hr",
        label: "Probation",
        hint: "How long probation lasts, when it's reviewed, and who signs HR letters.",
      },
      {
        href: "/org/settings/hr/absence",
        label: "Absence",
        hint: "Whether staff can report sick from their own login, and your Bradford Factor trigger points.",
      },
      {
        href: "/org/settings/hr/holidays",
        label: "Holidays",
        hint: "When your leave year starts, bank holidays, how many can be off at once, and your own kinds of leave.",
      },
      {
        href: "/org/settings/hr/cases",
        label: "Disciplinary and grievance",
        hint: "Notice before a hearing, the appeal window, how long warnings stay active, and which office workers can see cases.",
      },
      {
        href: "/org/settings/hr/letters",
        label: "Letters",
        hint: "The wording of every HR letter. The right to be accompanied and to appeal are always added.",
      },
    ],
  },
  {
    title: "Staff audits",
    features: ["people.supervisions", "people.competency"],
    pages: [
      {
        href: "/org/settings/staff-audits",
        label: "Forms and due periods",
        hint: "The questions on supervisions, appraisals, spot checks and competency, how often each is due, and your own skills.",
      },
    ],
  },
  {
    title: "Forms",
    features: ["forms.builder"],
    pages: [
      {
        href: "/org/settings/forms",
        label: "Your forms",
        hint: "Which of our forms you use and how often each is reviewed, your own copies of ours, and forms you build yourself.",
      },
    ],
  },
  {
    title: "Complaints & safeguarding",
    features: ["complaints.register"],
    pages: [
      {
        href: "/org/settings/complaints/process",
        label: "The process",
        hint: "The stages a complaint goes through, and which kinds of concern each applies to.",
      },
      {
        href: "/org/settings/complaints/link",
        label: "Raise-a-concern link",
        hint: "Open, close or replace the link families use. The office can still copy it from the complaints page.",
      },
    ],
  },
  {
    title: "Service audits",
    features: ["quality.audits"],
    pages: [
      {
        href: "/org/settings/service-audits",
        label: "Audits and due periods",
        hint: "The questions on each audit, how often it falls due, your own audits, and the score that needs a manager's review.",
      },
    ],
  },
  {
    title: "Policies & procedures",
    features: ["documents.library"],
    pages: [
      {
        href: "/org/settings/policies",
        label: "Reading, reviews and your details",
        hint: "Who must read each policy and by when, how often they are reviewed, and the details put into every policy you adopt.",
      },
    ],
  },
];

/** The groups this company's package has. */
export async function settingsGroupsFor(context: UserContext): Promise<SettingsGroup[]> {
  const enabled = await enabledMap(context);
  return SETTINGS_GROUPS.filter((g) => !g.features || g.features.some((f) => enabled[f]));
}

/**
 * Every settings page sits in this: the add-ons down the left (above, on a
 * phone), each with its own pages under it, and the open one beside them.
 * `active` is the page's href in SETTINGS_GROUPS — an editor under a page
 * passes its parent's.
 */
export async function SettingsShell({
  context,
  active,
  children,
}: {
  context: UserContext;
  active: string;
  children: React.ReactNode;
}) {
  const groups = await settingsGroupsFor(context);
  const page = groups.flatMap((g) => g.pages).find((p) => p.href === active);
  return (
    <DashboardShell title="Settings" context={context}>
      <div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)] md:items-start">
        <nav aria-label="Settings" className="space-y-3 rounded-xl border bg-card p-2 md:sticky md:top-20">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
              {g.pages.map((p) => {
                const isActive = p.href === active;
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-h-9 items-center rounded-lg px-3 text-sm transition-colors ${
                      isActive ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-muted"
                    }`}
                  >
                    {p.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          {page && (
            <div>
              <h2 className="text-base font-semibold">{page.label}</h2>
              <p className="text-sm text-muted-foreground">{page.hint}</p>
            </div>
          )}
          {children}
        </div>
      </div>
    </DashboardShell>
  );
}
