import Link from "next/link";
import { Lock } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { AREAS } from "@/lib/office-access";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";

/**
 * Where an office worker lands when they open a page in an area a manager
 * has switched off for office workers (Settings → Your company → Who can
 * see what). Nothing of the area is read here.
 */
export default async function ManagersOnlyPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const context = await requireConsole();
  const { area } = await searchParams;
  const label = AREAS.find((a) => a.key === area)?.label ?? null;
  return (
    <DashboardShell title="This is for managers" context={context}>
      <div className="max-w-xl space-y-4 rounded-card border bg-card p-6">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden />
          {label ? `${label} is for managers at ${"your company"}.` : "This part of the console is for managers at your company."}
        </p>
        <p className="text-sm">
          A manager chooses what office workers can open under Settings → Your company → Who can see what. If you need this for your work, ask a manager to switch it on.
        </p>
        <Link href="/org" className={buttonVariants({ variant: "outline" })}>
          Back to Today
        </Link>
      </div>
    </DashboardShell>
  );
}
