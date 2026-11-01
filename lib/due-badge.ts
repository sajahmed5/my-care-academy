import "server-only";
import { unstable_cache } from "next/cache";
import type { UserContext } from "@/lib/auth";
import type { FeatureKey } from "@/lib/features";
import { createAdminClient } from "@/lib/supabase/admin";
import { isActiveLearner, isNeverActive, loadOrgLearners } from "@/lib/org-learners";
import { loadOrgTodo } from "@/lib/org-todo";

/**
 * The number on the Due item in the top bar (redesign, 1 Nov 2026): how many
 * things are late or waiting on someone right now, and how many of them sit
 * behind each page, so a drop-down can say "2 due" beside Supervisions.
 *
 * It is the Today page's "things to fix", counted the same way — the alert
 * lines of the to-do list, plus training's two — but the bar is on every
 * page, and the to-do list is a dozen reads to Frankfurt. So the count is
 * cached per company for ten minutes, read with the service role (every
 * read under it filters by the organisation already). A manager who books
 * the supervision sees the bar catch up within ten minutes; the Today page
 * itself is always live.
 */
export interface DueBadge {
  total: number;
  /** Late things behind each page, by path (no query string). */
  byPath: Record<string, number>;
}

const EMPTY: DueBadge = { total: 0, byPath: {} };

async function countDue(orgId: string, enabled: Record<FeatureKey, boolean>): Promise<DueBadge> {
  const admin = createAdminClient();
  // The to-do list only asks the context who is reading, to hide HR cases
  // from an office worker not named for them; a count may include them.
  const asManager = { userId: "", email: null, role: "org_admin", organisationId: orgId } as UserContext;
  const [learners, lines] = await Promise.all([
    loadOrgLearners(admin, orgId).catch(() => []),
    loadOrgTodo(admin, asManager, enabled).catch(() => []),
  ]);
  const active = learners.filter(isActiveLearner);
  const byPath: Record<string, number> = {};
  const add = (href: string, n = 1) => {
    const path = href.split(/[?#]/)[0];
    byPath[path] = (byPath[path] ?? 0) + n;
  };
  if (active.some((r) => r.stats.overdue > 0)) add("/org/learners");
  if (active.some(isNeverActive)) add("/org/learners");
  for (const l of lines) if (l.tone === "alert") add(l.href);
  return { total: Object.values(byPath).reduce((a, b) => a + b, 0), byPath };
}

const cached = unstable_cache(countDue, ["due-badge"], { revalidate: 600 });

export async function loadDueBadge(orgId: string | null, enabled: Record<FeatureKey, boolean>): Promise<DueBadge> {
  if (!orgId) return EMPTY;
  try {
    return await cached(orgId, enabled);
  } catch {
    return EMPTY;
  }
}
