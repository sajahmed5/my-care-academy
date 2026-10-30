import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { enabledMap } from "@/lib/entitlements";
import type { FeatureKey } from "@/lib/features";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card } from "@/components/ui/card";

interface Setting {
  href: string;
  label: string;
  hint: string;
}

interface Group {
  title: string;
  /** Shown when the package has any one of these. Leave out for always. */
  features?: FeatureKey[];
  settings: Setting[];
}

const GROUPS: Group[] = [
  {
    title: "Your company",
    settings: [
      {
        href: "/org/billing",
        label: "Account and package",
        hint: "Your package and billing, your logo, AI drafting, and who has the console.",
      },
    ],
  },
  {
    title: "Recruitment",
    features: ["recruitment.tracker"],
    settings: [
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
    ],
  },
  {
    title: "Staff audits",
    features: ["people.supervisions", "people.competency"],
    settings: [
      {
        href: "/org/settings/staff-audits",
        label: "Forms and due periods",
        hint: "The questions on supervisions, appraisals, spot checks and competency, how often each is due, and your own skills.",
      },
    ],
  },
  {
    title: "Complaints & safeguarding",
    features: ["complaints.register"],
    settings: [
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
];

/**
 * Everything a company sets up for itself, in one place, for managers only
 * (Saj, 30 Oct 2026). The main menu is for the day's work; questions, forms,
 * wording and the process live here, grouped by add-on, and an add-on not in
 * the package doesn't show.
 */
export default async function SettingsPage() {
  const context = await requireRole("org_admin");
  const enabled = await enabledMap(context);
  const groups = GROUPS.filter((g) => !g.features || g.features.some((f) => enabled[f]));

  return (
    <DashboardShell title="Settings" context={context}>
      <div className="max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Only managers see these. Changes apply to new records; anything already filled in keeps what it was asked with.
        </p>
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{g.title}</h2>
            <Card className="divide-y overflow-hidden p-0">
              {g.settings.map((s) => (
                <Link key={s.href} href={s.href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.hint}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              ))}
            </Card>
          </section>
        ))}
      </div>
    </DashboardShell>
  );
}
