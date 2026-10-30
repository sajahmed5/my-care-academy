import { describe, expect, it } from "vitest";
import { acceptBy, buildReading, inAudience, planPolicyReminders, tallyByCopy, type ReadingCopy } from "../lib/policy-reading";

const copy = (over: Partial<ReadingCopy> = {}): ReadingCopy => ({
  copyId: "c1",
  policyId: "p1",
  title: "Safeguarding",
  code: "S",
  version: 1,
  publishedAt: "2026-10-01T09:00:00Z",
  audience: "everyone",
  acceptWithinDays: null,
  ...over,
});
const people = [
  { id: "carer", name: "Cara", role: "learner", startedAt: "2025-01-01T00:00:00Z" },
  { id: "office", name: "Olly", role: "org_office", startedAt: "2025-01-01T00:00:00Z" },
  { id: "manager", name: "Pat", role: "org_admin", startedAt: "2025-01-01T00:00:00Z" },
  // Started after the policy was published: their clock starts on their first day.
  { id: "newbie", name: "Nina", role: "learner", startedAt: "2026-10-25T10:00:00Z" },
];

describe("who a policy is for", () => {
  it("matches each audience to its roles", () => {
    expect(inAudience("carers", "learner")).toBe(true);
    expect(inAudience("carers", "org_office")).toBe(false);
    expect(inAudience("console", "org_office")).toBe(true);
    expect(inAudience("console", "org_admin")).toBe(true);
    expect(inAudience("console", "learner")).toBe(false);
    expect(inAudience("everyone", "org_admin")).toBe(true);
  });
});

describe("acceptBy", () => {
  it("counts from publishing, or from the day they started if later", () => {
    expect(acceptBy("2026-10-01T09:00:00Z", "2025-01-01T00:00:00Z", 14)).toBe("2026-10-15");
    expect(acceptBy("2026-10-01T09:00:00Z", "2026-10-25T10:00:00Z", 14)).toBe("2026-11-08");
    expect(acceptBy("2026-10-01T09:00:00Z", null, 7)).toBe("2026-10-08");
  });
});

describe("buildReading", () => {
  it("asks only the audience, and says who is late", () => {
    const entries = buildReading({
      copies: [copy({ audience: "carers" })],
      people,
      acks: [],
      companyDays: 14,
      today: "2026-10-31",
    });
    expect(entries.map((e) => [e.userId, e.status, e.dueOn])).toEqual([
      ["carer", "late", "2026-10-15"],
      ["newbie", "outstanding", "2026-11-08"],
    ]);
  });

  it("is not late on the due day itself", () => {
    const [e] = buildReading({ copies: [copy({ audience: "managers" })], people, acks: [], companyDays: 14, today: "2026-10-15" });
    expect(e.status).toBe("outstanding");
  });

  it("counts an older version's acceptance as still to accept, and a policy's own days over the company's", () => {
    const entries = buildReading({
      copies: [copy({ version: 2, audience: "managers", acceptWithinDays: 28 })],
      people,
      acks: [{ userId: "manager", copyId: "c1", version: 1, at: "2026-09-01T00:00:00Z" }],
      companyDays: 14,
      today: "2026-10-20",
    });
    expect(entries).toEqual([
      { copyId: "c1", userId: "manager", dueOn: "2026-10-29", status: "outstanding", acceptedVersion: 1, acceptedAt: "2026-09-01T00:00:00Z" },
    ]);
  });

  it("tallies per policy", () => {
    const entries = buildReading({
      copies: [copy()],
      people,
      acks: [{ userId: "office", copyId: "c1", version: 1, at: "2026-10-02T00:00:00Z" }],
      companyDays: 14,
      today: "2026-10-31",
    });
    expect(tallyByCopy(entries).get("c1")).toEqual({ total: 4, accepted: 1, late: 2 });
  });
});

describe("planPolicyReminders", () => {
  const copies = [copy({ audience: "carers" })];
  const entries = buildReading({ copies, people, acks: [], companyDays: 14, today: "2026-10-31" });

  it("tells everyone about a policy new to them", () => {
    const plans = planPolicyReminders({ entries, copies, lastSent: new Map(), repeatDays: 7, today: "2026-10-31" });
    expect(plans.map((p) => p.userId).sort()).toEqual(["carer", "newbie"]);
  });

  it("repeats only for what is late or nearly due, and not before the repeat gap", () => {
    const lastSent = new Map([
      ["carer", "2026-10-28T08:00:00Z"],
      ["newbie", "2026-10-28T08:00:00Z"],
    ]);
    expect(planPolicyReminders({ entries, copies, lastSent, repeatDays: 7, today: "2026-10-31" })).toEqual([]);
    // A week on: the carer is late and is reminded; the new starter is due 8 Nov, within three days on 5 Nov.
    expect(planPolicyReminders({ entries, copies, lastSent, repeatDays: 7, today: "2026-11-04" }).map((p) => p.userId)).toEqual(["carer"]);
    expect(
      planPolicyReminders({ entries, copies, lastSent, repeatDays: 7, today: "2026-11-05" })
        .map((p) => p.userId)
        .sort(),
    ).toEqual(["carer", "newbie"]);
  });
});
