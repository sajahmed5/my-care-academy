import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { daysLeftLabel, trialState } from "@/lib/trial";
import type { UserRole } from "@/lib/auth";

/**
 * The thin strip under the menu while a company is on its free trial
 * (TRIAL.md). Managers get the way to choose a package; office workers can't
 * change it, so they're told who can. Carers never see it.
 */
export function TrialBanner({ role, trialEndsAt }: { role: UserRole | null; trialEndsAt: string | null }) {
  if (role !== "org_admin" && role !== "org_office") return null;
  const trial = trialState(trialEndsAt);
  if (trial.kind !== "active") return null;
  const ends = formatDate(trial.endsAt, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div data-print="hide" role="status" className="border-b border-amber-300 bg-amber-100 text-amber-950">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm sm:px-6">
        <span className="font-semibold">Free trial: {daysLeftLabel(trial.daysLeft).toLowerCase()}</span>
        <span>You have everything in Enterprise until the end of {ends}.</span>
        {role === "org_admin" ? (
          <Link
            href="/org/billing"
            className="ml-auto inline-flex min-h-9 items-center rounded-lg bg-amber-950 px-3.5 font-medium text-white hover:bg-amber-900"
          >
            Choose a package
          </Link>
        ) : (
          <span className="ml-auto text-amber-900">Your manager can choose a package.</span>
        )}
      </div>
    </div>
  );
}
