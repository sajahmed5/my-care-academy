import { describe, expect, it } from "vitest";
import { lastActiveLabel, matches, needsAttention, roleLine, type StaffRow } from "../lib/staff-list";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 1, 12);

function row(over: Partial<StaffRow> & { stats?: Partial<StaffRow["stats"]> } = {}): StaffRow {
  const { stats, ...rest } = over;
  return {
    id: "u1",
    name: "Amina Khan",
    email: "amina@example.test",
    status: "active",
    stats: { assigned: 10, notStarted: 0, inProgress: 2, completed: 8, expired: 0, certificates: 8, overdue: 0, dueSoon: 0, expiring: 0, completionPct: 80, overallPct: 90, ...stats },
    latestCompleted: null,
    lastAssignedAt: null,
    lastSeenAt: new Date(now - DAY).toISOString(),
    lastRemindedAt: null,
    timeSpentSeconds: 0,
    lateCompletions: 0,
    ...rest,
  };
}

const late = { label: "Never had one", tone: "danger" as const, late: true, order: 1 };
const fine = { label: "Due Mar 2027", tone: "ok" as const, late: false, order: 4 };

describe("needsAttention", () => {
  it("is overdue training, a late check, or never having signed in", () => {
    expect(needsAttention(row())).toBe(false);
    expect(needsAttention(row({ stats: { overdue: 1 } }))).toBe(true);
    expect(needsAttention(row({ supervision: late, appraisal: fine }))).toBe(true);
    expect(needsAttention(row({ supervision: fine, appraisal: late }))).toBe(true);
    expect(needsAttention(row({ lastSeenAt: null }))).toBe(true);
  });

  it("never flags a leaver", () => {
    expect(needsAttention(row({ status: "deactivated", stats: { overdue: 3 }, lastSeenAt: null }))).toBe(false);
  });
});

describe("matches", () => {
  it("keeps leavers under All and Leavers only", () => {
    const gone = row({ status: "deactivated", stats: { overdue: 3 } });
    expect(matches(gone, "all", now)).toBe(true);
    expect(matches(gone, "deactivated", now)).toBe(true);
    expect(matches(gone, "overdue", now)).toBe(false);
    expect(matches(gone, "attention", now)).toBe(false);
  });

  it("answers the segments and the filters behind the button", () => {
    const quiet = row({ lastSeenAt: new Date(now - 40 * DAY).toISOString() });
    expect(matches(quiet, "inactive", now)).toBe(true);
    expect(matches(quiet, "signed_in", now)).toBe(true);
    expect(matches(row({ lastSeenAt: null }), "never", now)).toBe(true);
    expect(matches(row({ stats: { overdue: 2 } }), "overdue", now)).toBe(true);
    expect(matches(row({ stats: { dueSoon: 1 } }), "due_soon", now)).toBe(true);
  });
});

describe("lastActiveLabel", () => {
  const fmt = (iso: string) => iso.slice(0, 10);
  it("says it in words up to a month, then the date", () => {
    expect(lastActiveLabel(new Date(now).toISOString(), now, fmt)).toEqual({ label: "Today", stale: false });
    expect(lastActiveLabel(new Date(now - DAY).toISOString(), now, fmt)).toEqual({ label: "Yesterday", stale: false });
    expect(lastActiveLabel(new Date(now - 3 * DAY).toISOString(), now, fmt)).toEqual({ label: "3 days ago", stale: false });
    expect(lastActiveLabel(new Date(now - 20 * DAY).toISOString(), now, fmt)).toEqual({ label: "2 weeks ago", stale: false });
    expect(lastActiveLabel(new Date(now - 45 * DAY).toISOString(), now, fmt).stale).toBe(true);
    expect(lastActiveLabel(null, now, fmt)).toEqual({ label: "Never signed in", stale: true });
  });
});

describe("roleLine", () => {
  it("prefers the job title the HR pack holds", () => {
    expect(roleLine(row({ role: "learner", jobTitle: "Senior carer" }))).toBe("Senior carer");
    expect(roleLine(row({ role: "org_admin" }))).toBe("Manager");
    expect(roleLine(row({ role: "learner" }))).toBe("Care worker");
  });
});
