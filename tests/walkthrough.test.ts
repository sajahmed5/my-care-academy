import { describe, expect, it } from "vitest";
import {
  COACH_MARKS,
  HOW_TOS,
  TASKS,
  gettingStarted,
  howTos,
  nextStep,
  parseWalkthrough,
  prevStep,
  shouldOfferTour,
  stepLabel,
  stepsPresent,
  todayChecklist,
  tourSteps,
  type TaskFacts,
} from "../lib/walkthrough";
import type { TrialState } from "../lib/trial";

const active: TrialState = { kind: "active", endsAt: new Date("2026-11-09T23:59:59.999Z"), daysLeft: 7 };
const ended: TrialState = { kind: "ended", endsAt: new Date("2026-11-09T23:59:59.999Z"), removeAt: new Date("2026-12-09T23:59:59.999Z") };
const none: TrialState = { kind: "none" };
const unseen = { tourSeenAt: null, listHiddenAt: null };
const ENTERPRISE = { "people.supervisions": true, "quality.audits": true, "clients.list": true, "complaints.register": true };

describe("who sees the walkthrough", () => {
  it("opens for a manager or office worker on a running trial who has not seen it", () => {
    expect(shouldOfferTour("org_admin", active, unseen)).toBe(true);
    expect(shouldOfferTour("org_office", active, unseen)).toBe(true);
  });

  it("never opens for a carer, a candidate or the platform", () => {
    expect(shouldOfferTour("learner", active, unseen)).toBe(false);
    expect(shouldOfferTour("candidate", active, unseen)).toBe(false);
    expect(shouldOfferTour("platform_admin", active, unseen)).toBe(false);
    expect(shouldOfferTour(null, active, unseen)).toBe(false);
  });

  it("stays shut once seen, and off a trial", () => {
    expect(shouldOfferTour("org_admin", active, { ...unseen, tourSeenAt: "2026-11-02T09:00:00Z" })).toBe(false);
    expect(shouldOfferTour("org_admin", none, unseen)).toBe(false);
    expect(shouldOfferTour("org_admin", ended, unseen)).toBe(false);
  });

  it("reads the stored flags defensively", () => {
    expect(parseWalkthrough(null)).toEqual(unseen);
    expect(parseWalkthrough("junk")).toEqual(unseen);
    expect(parseWalkthrough({ tour_seen_at: "2026-11-02T09:00:00Z", list_hidden_at: "" })).toEqual({ tourSeenAt: "2026-11-02T09:00:00Z", listHiddenAt: null });
  });
});

describe("the tour's steps", () => {
  it("is seven stops on a wide screen with everything, four on a phone", () => {
    expect(tourSteps("wide", ENTERPRISE).map((s) => s.key)).toEqual(["today", "due", "people", "training", "compliance", "new", "you"]);
    expect(tourSteps("phone", ENTERPRISE).map((s) => s.key)).toEqual(["today", "menu", "new", "you"]);
  });

  it("leaves Due out for a package without it, and the counter still adds up", () => {
    const steps = tourSteps("wide", {});
    expect(steps.map((s) => s.key)).toEqual(["today", "people", "training", "compliance", "new", "you"]);
    expect(stepLabel(1, steps.length, steps[1].label)).toBe("Step 2 of 6 · People");
  });

  it("drops a step none of whose targets is on the page", () => {
    const steps = tourSteps("wide", ENTERPRISE);
    const present = new Set(["nav-People", "nav-Training", "nav-Compliance", "nav-new", "nav-person", "nav-search"]);
    expect(stepsPresent(steps, (t) => present.has(t)).map((s) => s.key)).toEqual(["people", "training", "compliance", "new", "you"]);
  });

  it("moves forward to the end and back to the start, and no further", () => {
    expect(nextStep(0, 7)).toBe(1);
    expect(nextStep(6, 7)).toBeNull();
    expect(prevStep(0)).toBeNull();
    expect(prevStep(3)).toBe(2);
  });

  it("opens the drop-down each step talks about, and the avatar menu last", () => {
    const steps = tourSteps("wide", ENTERPRISE);
    expect(steps.find((s) => s.key === "people")?.menu).toBe("People");
    expect(steps.find((s) => s.key === "you")?.menu).toBe("__person");
    expect(steps.find((s) => s.key === "today")?.menu).toBeNull();
  });
});

const facts: TaskFacts = {
  staff: 1,
  staffSignedIn: 1,
  assigned: 0,
  ownAssigned: 0,
  ownCompleted: 0,
  supervisions: 0,
  audits: 0,
  clients: 0,
  evidencePacks: 0,
};

describe("the Getting started list", () => {
  it("is seven tasks with everything, nothing done on a fresh company", () => {
    const tasks = gettingStarted(facts, ENTERPRISE, "me");
    expect(tasks.map((t) => t.key)).toEqual(["invite", "assign", "course", "supervision", "audit", "client", "evidence"]);
    expect(tasks.every((t) => !t.done)).toBe(true);
  });

  it("leaves out clients, supervisions and audits a package has not got", () => {
    expect(gettingStarted(facts, {}, "me").map((t) => t.key)).toEqual(["invite", "assign", "course", "evidence"]);
  });

  it("ticks each task off from the data, never by hand", () => {
    const tasks = gettingStarted({ staff: 5, staffSignedIn: 3, assigned: 14, ownAssigned: 2, ownCompleted: 1, supervisions: 1, audits: 2, clients: 9, evidencePacks: 1 }, ENTERPRISE, "me");
    expect(tasks.map((t) => [t.key, t.done])).toEqual([
      ["invite", true],
      ["assign", true],
      ["course", true],
      ["supervision", true],
      ["audit", true],
      ["client", true],
      ["evidence", true],
    ]);
    expect(tasks[0].detail).toBe("4 people added · 3 signed in");
    expect(tasks[1].detail).toBe("14 courses assigned");
  });

  it("the manager alone does not count as staff invited", () => {
    expect(gettingStarted({ ...facts, staff: 1 }, ENTERPRISE, "me")[0].done).toBe(false);
  });

  it("points Show me at the right page with the coach mark in the address, and the evidence pack at the person's own file", () => {
    const tasks = gettingStarted(facts, ENTERPRISE, "abc-123");
    for (const t of tasks) expect(t.href).toContain(`show=${t.key}`);
    expect(tasks.find((t) => t.key === "evidence")?.href).toBe("/org/staff/abc-123?show=evidence");
    for (const t of TASKS) expect(COACH_MARKS[t.key]).toBeDefined();
  });

  it("tells the person to assign themselves a course when they have none", () => {
    const own = gettingStarted(facts, ENTERPRISE, "me").find((t) => t.key === "course")!;
    expect(own.detail).toContain("Assign yourself one first");
    const waiting = gettingStarted({ ...facts, ownAssigned: 3 }, ENTERPRISE, "me").find((t) => t.key === "course")!;
    expect(waiting.detail).toContain("You have 3 courses waiting");
  });
});

describe("which card Today carries", () => {
  const tasks = gettingStarted(facts, ENTERPRISE, "me");
  const allDone = tasks.map((t) => ({ ...t, done: true }));

  it("is the Getting started list on a trial", () => {
    expect(todayChecklist(active, unseen, tasks)).toBe("getting-started");
  });

  it("is the older Finish setting up card off a trial", () => {
    expect(todayChecklist(none, unseen, tasks)).toBe("setup");
    expect(todayChecklist(ended, unseen, tasks)).toBe("setup");
  });

  it("goes once hidden, and once everything is done", () => {
    expect(todayChecklist(active, { ...unseen, listHiddenAt: "2026-11-03T10:00:00Z" }, tasks)).toBe("none");
    expect(todayChecklist(active, unseen, allDone)).toBe("none");
  });
});

describe("Help: How do I…", () => {
  it("is the six routes on the board plus Do a course assigned to me, each with a coach mark", () => {
    expect(HOW_TOS.map((h) => h.key)).toEqual(["invite", "assign", "supervision", "audit", "concern", "course", "governance"]);
    for (const h of HOW_TOS) {
      expect(h.href).toContain(`show=${h.key}`);
      expect(COACH_MARKS[h.key]).toBeDefined();
    }
  });

  it("drops what the package leaves out", () => {
    expect(howTos({}).map((h) => h.key)).toEqual(["invite", "assign", "course"]);
    expect(howTos({ "quality.audits": true }).map((h) => h.key)).toEqual(["invite", "assign", "audit", "course", "governance"]);
  });
});
