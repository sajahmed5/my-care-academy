import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  loadOrgCertificates,
  needsAttention,
  type OrgCertificateRow,
} from "@/lib/certificates";
import { CertificatesTable } from "./certificates-table";
import { StatusKey } from "../status-key";

type Tab = "attention" | "expired" | "due_30" | "due_60" | "all";

const TABS: { key: Tab; label: string; match: (r: OrgCertificateRow) => boolean }[] =
  [
    { key: "attention", label: "Needs attention", match: needsAttention },
    { key: "expired", label: "Expired", match: (r) => r.state === "expired" },
    { key: "due_30", label: "Expiring ≤30 days", match: (r) => r.state === "due_30" },
    { key: "due_60", label: "Expiring 31–60 days", match: (r) => r.state === "due_60" },
    { key: "all", label: "All", match: () => true },
  ];

/**
 * Certificates that need renewing. Until now nothing listed these: the
 * dashboard warned that certificates were expiring and linked to a page that
 * never showed expiry, so the only way to find them was one learner at a time.
 *
 * Defaults to "needs attention" — expired or expiring inside 60 days — because
 * that is the job. The remaining tabs separate already-lapsed from
 * still-in-time, which the underlying expiryFlag lumps together as one red.
 */
export default async function OrgCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const context = await requireConsole();
  const { filter } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === filter) ? (filter as Tab) : "attention";

  const supabase = await createClient();
  const [rows, { data: organisation }] = await Promise.all([
    loadOrgCertificates(supabase, context.organisationId),
    supabase.from("organisations").select("name").eq("id", context.organisationId!).single(),
  ]);

  const shown = rows.filter(TABS.find((t) => t.key === tab)!.match);
  const attention = rows.filter(needsAttention).length;

  return (
    <DashboardShell title="Certificates" context={context}>
      <div className="mx-auto max-w-6xl space-y-4">
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "No certificates have been issued yet."
            : attention === 0
              ? `${rows.length} live certificate${rows.length === 1 ? "" : "s"} — none expiring in the next 60 days.`
              : `${attention} of ${rows.length} certificate${rows.length === 1 ? "" : "s"} ${attention === 1 ? "needs" : "need"} renewing.`}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => {
            const count = rows.filter(t.match).length;
            const active = t.key === tab;
            return (
              <Link
                key={t.key}
                href={t.key === "attention" ? "/org/certificates" : `/org/certificates?filter=${t.key}`}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-accent"
                }`}
              >
                {t.label}{" "}
                <span className={active ? "opacity-80" : "text-muted-foreground"}>
                  {count}
                </span>
              </Link>
            );
          })}
        </div>

        <CertificatesTable
          rows={shown}
          filename={`${organisation?.name ?? "org"}-certificates.csv`}
        />
        <StatusKey kind="certificates" />
      </div>
    </DashboardShell>
  );
}
