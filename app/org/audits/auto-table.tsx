import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { autoTally, trainingCompliance, type AutoResult, type AutoSnapshot } from "@/lib/auto-audits";

const CHIP: Record<AutoResult, string> = {
  pass: "bg-green-50 text-green-800",
  fail: "bg-rose-100 text-rose-800",
  na: "bg-muted text-muted-foreground",
};
const MARK: Record<AutoResult, string> = { pass: "✓", fail: "✗", na: "–" };

/**
 * What a staff file or training audit found, person by person: each check
 * with what it rests on. The people with something wrong come first. On the
 * form, each of them can be given an action.
 */
export function AutoTable({ snapshot, action }: { snapshot: AutoSnapshot; action?: (personId: string) => ReactNode }) {
  const { pass, fail } = autoTally(snapshot);
  const failing = (p: AutoSnapshot["people"][number]) => Object.values(p.checks).some((c) => c.result === "fail");
  const people = [...snapshot.people].sort((a, b) => Number(failing(b)) - Number(failing(a)));
  const compliance = trainingCompliance(snapshot.summary);
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-base font-semibold">What the site found</h2>
        <p className="text-xs text-muted-foreground">
          {snapshot.kind === "staff_file" ? "From the HR pack" : "From the training records"}, for {snapshot.people.length} member
          {snapshot.people.length === 1 ? "" : "s"} of staff: {pass} {pass === 1 ? "check" : "checks"} met, {fail} not
          {compliance !== null ? ` · ${compliance}% of assigned courses completed and in date` : ""}.
        </p>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {people.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No current staff.</p>}
          {people.map((p) => (
            <div key={p.id} className={`space-y-2 px-4 py-3 ${failing(p) ? "bg-rose-50/40" : ""}`}>
              <p className="text-sm font-medium">{p.name}</p>
              <ul className="flex flex-wrap gap-1.5">
                {snapshot.checks.map((c) => {
                  const r = p.checks[c.key];
                  if (!r) return null;
                  return (
                    <li key={c.key} className={`rounded-md px-2 py-0.5 text-xs ${CHIP[r.result]}`}>
                      <span aria-hidden>{MARK[r.result]} </span>
                      <span className="font-medium">{c.label}</span>
                      <span className="sr-only">: {r.result === "pass" ? "met" : r.result === "fail" ? "not met" : "not applicable"}</span> — {r.detail}
                    </li>
                  );
                })}
              </ul>
              {action && failing(p) && action(p.id)}
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
