import Link from "next/link";
import type { UserContext } from "@/lib/auth";
import { enabledMap } from "@/lib/entitlements";
import { SETTINGS_GROUPS, visibleSettingsGroups, type SettingsGroup } from "./settings-groups";
import { DashboardShell } from "@/components/dashboard-shell";

/** The groups this company's package has. */
export async function settingsGroupsFor(context: UserContext): Promise<SettingsGroup[]> {
  const enabled = await enabledMap(context);
  return visibleSettingsGroups(SETTINGS_GROUPS, enabled);
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
