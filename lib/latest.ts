/**
 * Long lists show the most recent rows first and the rest on request
 * (Saj, 2 Nov 2026, QA review Q6): a register is read in full — paged past
 * Supabase's 1,000-row answer with fetchAll — and the page shows the latest
 * LATEST unless the reader asked for everything with ?all=1. Nothing is
 * cut silently any more: the page says how many there are and offers the
 * rest.
 */
export const LATEST = 200;

export interface Latest<T> {
  rows: T[];
  total: number;
  /** True when rows is the shorter list. */
  cut: boolean;
}

/** `rows` newest first; `all` is the ?all=1 flag. */
export function latest<T>(rows: T[], all: boolean | string | string[] | undefined, limit = LATEST): Latest<T> {
  const wantAll = all === true || all === "1" || all === "true";
  const cut = !wantAll && rows.length > limit;
  return { rows: cut ? rows.slice(0, limit) : rows, total: rows.length, cut };
}

/** The href that shows everything: the current path and query with all=1. */
export function allHref(path: string, query: Record<string, string | string[] | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (k === "all" || v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) q.append(k, x);
  }
  q.set("all", "1");
  return `${path}?${q.toString()}`;
}
