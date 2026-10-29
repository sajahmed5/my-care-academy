/**
 * Concerns counted by type, category, carer, client and month — for CQC's
 * well-led questions (COMPLAINTS-SAFEGUARDING.md, Trends page): are the same
 * things coming up, about the same people, and is it getting better.
 *
 * Pure: the page reads the rows, this counts them.
 */

import { kindLabel } from "./stages";
import { categoryLabel } from "./categories";

export interface TrendRow {
  kind: string;
  category: string | null;
  reportedOn: string;
  clientId: string | null;
  clientName: string | null;
  people: { userId: string; name: string | null }[];
}

export interface Count {
  key: string;
  label: string;
  count: number;
  href?: string;
}

const tally = (items: { key: string; label: string; href?: string }[]): Count[] => {
  const m = new Map<string, Count>();
  for (const i of items) {
    const c = m.get(i.key) ?? { ...i, count: 0 };
    c.count += 1;
    m.set(i.key, c);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

/** The last n months, oldest first, as YYYY-MM, ending with the month of `today`. */
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export function concernTrends(rows: TrendRow[], months: string[]) {
  const byMonth = new Map(months.map((m) => [m, 0]));
  for (const r of rows) {
    const k = r.reportedOn.slice(0, 7);
    if (byMonth.has(k)) byMonth.set(k, byMonth.get(k)! + 1);
  }
  return {
    total: rows.length,
    byType: tally(rows.map((r) => ({ key: r.kind, label: r.kind === "concern" ? "Waiting for triage" : kindLabel(r.kind), href: `/org/complaints?kind=${r.kind}` }))),
    byCategory: tally(rows.map((r) => ({ key: r.category ?? "", label: categoryLabel(r.category) }))),
    byCarer: tally(
      rows.flatMap((r) => r.people.map((p) => ({ key: p.userId, label: p.name ?? "Someone no longer on the system", href: `/org/staff/${p.userId}?section=complaints` }))),
    ),
    byClient: tally(
      rows.filter((r) => r.clientId).map((r) => ({ key: r.clientId!, label: r.clientName ?? "A client", href: `/org/clients/${r.clientId}#concerns` })),
    ),
    byMonth: months.map((m) => ({
      key: m,
      label: new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
      count: byMonth.get(m) ?? 0,
    })),
  };
}
