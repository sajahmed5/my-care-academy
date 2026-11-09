"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const KEY = "mca-growth-nudge";
const EVENT = "mca-growth-nudge-change";

// Where the manager put it away last, as the carer count at the time, read
// from this browser. Null while the server renders and until the browser has
// answered, so the banner never flashes up and vanishes.
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
};
const readDismissedAt = (): string => {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
const serverSnapshot = (): string | null => null;

/**
 * A Training only company that has grown past the point where Growth is
 * cheaper (lib/pricing.ts, GROWTH_FROM_CARERS) is asked whether it wants to
 * move up (Saj, 9 Nov 2026). On Today it can be put away; it comes back if
 * the carer count rises again, since the sum has changed. On the Billing
 * page it always shows: that is where the decision is made.
 */
export function GrowthNudge({
  carers,
  costNow,
  growthPrice,
  dismissable = false,
}: {
  carers: number;
  /** What Training only costs this month, e.g. "£307.50". */
  costNow: string;
  /** Growth's flat price, e.g. "£300". */
  growthPrice: string;
  dismissable?: boolean;
}) {
  const dismissedAt = useSyncExternalStore(subscribe, readDismissedAt, serverSnapshot);
  const shown = !dismissable || (dismissedAt !== null && Number(dismissedAt || "0") < carers);
  if (!shown) return null;

  return (
    <div role="status" className="relative flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-primary/30 bg-accent px-5 py-4 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          You have {carers} carers, so Training only costs {costNow} a month.
        </p>
        <p className="mt-0.5 text-accent-foreground">
          Growth is {growthPrice} a month for unlimited carers, and includes the HR pack, supervisions and spot checks.
          You can stay on Training only if you prefer.
        </p>
      </div>
      <Link href="/org/billing?package=core_forms#change" className={buttonVariants({ size: "sm" })}>
        Move to Growth <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
      {dismissable && (
        <button
          type="button"
          aria-label="Put this away"
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
          onClick={() => {
            try {
              window.localStorage.setItem(KEY, String(carers));
            } catch {}
            window.dispatchEvent(new Event(EVENT));
          }}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
