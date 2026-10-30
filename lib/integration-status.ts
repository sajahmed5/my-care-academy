/**
 * How a company's MyRoster connection is doing, in a manager's words
 * (INTEGRATION-WHITE-LABEL.md: "2 carers have no email address in
 * MyRoster"). Pure, so the wording is tested.
 */

/** What MyRoster sent on one sync, in a manager's words. */
export interface SyncProblem {
  kind: "no_email" | "no_ref" | "invite_failed" | "other";
  name: string | null;
  externalRef: string | null;
}

/**
 * The problems of one sync as sentences ("2 carers have no email address in
 * MyRoster"), each with the names it's about.
 */
export function describeProblems(problems: SyncProblem[]): { text: string; names: string[] }[] {
  const groups = new Map<SyncProblem["kind"], SyncProblem[]>();
  for (const p of problems) groups.set(p.kind, [...(groups.get(p.kind) ?? []), p]);
  const carers = (n: number) => (n === 1 ? "1 carer" : `${n} carers`);
  const has = (n: number) => (n === 1 ? "has" : "have");
  const out: { text: string; names: string[] }[] = [];
  const order: SyncProblem["kind"][] = ["no_email", "invite_failed", "no_ref", "other"];
  for (const kind of order) {
    const list = groups.get(kind);
    if (!list?.length) continue;
    const n = list.length;
    const text =
      kind === "no_email"
        ? `${carers(n)} ${has(n)} no email address in MyRoster, so we couldn't invite them. Add one there and they'll come across on the next sync.`
        : kind === "invite_failed"
          ? `${carers(n)} couldn't be sent an invitation. Check their email address in MyRoster.`
          : kind === "no_ref"
            ? `${carers(n)} came across without MyRoster's id for them, so we couldn't match them.`
            : `${carers(n)} couldn't be updated here. If it happens again, tell us.`;
    out.push({ text, names: list.map((p) => p.name || p.externalRef || "Unnamed").slice(0, 50) });
  }
  return out;
}
