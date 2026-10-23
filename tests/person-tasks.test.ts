import { describe, expect, it } from "vitest";
import { buildPersonTasks, type ActionRow, type FormAsk } from "../lib/person-tasks";
import type { Certificate, Enrolment } from "../lib/learner-data";

const NOW = new Date("2026-10-23T12:00:00Z");

function enrolment(over: Partial<Enrolment> = {}): Enrolment {
  return {
    id: "e1",
    course_id: "c1",
    status: "not_started",
    progress: 0,
    due_date: null,
    assigned_at: "2026-10-01",
    attempt_count: 0,
    completion_count: 0,
    title: "Moving & Handling",
    topic: null,
    ...over,
  };
}

function certificate(over: Partial<Certificate> = {}): Certificate {
  return {
    id: "cert1",
    course_id: "c9",
    number: "MCA-1",
    issued_at: "2023-10-01",
    expires_at: null,
    title: "Fire Safety",
    topic: null,
    ...over,
  };
}

function action(over: Partial<ActionRow> = {}): ActionRow {
  return {
    id: "a1",
    title: "Chase the second reference",
    detail: null,
    due_date: null,
    source_type: "manual",
    completed_at: null,
    ...over,
  };
}

const build = (args: {
  enrolments?: Enrolment[];
  certificates?: Certificate[];
  actions?: ActionRow[];
  forms?: FormAsk[];
}) =>
  buildPersonTasks({
    enrolments: args.enrolments ?? [],
    certificates: args.certificates ?? [],
    actions: args.actions ?? [],
    forms: args.forms ?? [],
    now: NOW,
  });

describe("what counts as outstanding", () => {
  it("leaves finished training alone", () => {
    const tasks = build({
      enrolments: [
        enrolment({ id: "done", status: "completed" }),
        enrolment({ id: "todo", status: "in_progress" }),
      ],
    });
    expect(tasks.map((t) => t.key)).toEqual(["enrolment:todo"]);
  });

  it("counts an assigned course with no due date, as open", () => {
    const [task] = build({ enrolments: [enrolment()] });
    expect(task.urgency).toBe("open");
    expect(task.dueDate).toBeNull();
  });

  it("drops a completed action but keeps an open one", () => {
    const tasks = build({
      actions: [
        action({ id: "open" }),
        action({ id: "done", completed_at: "2026-10-01T09:00:00Z" }),
      ],
    });
    expect(tasks.map((t) => t.actionId)).toEqual(["open"]);
  });

  it("ignores a certificate that is nowhere near expiry", () => {
    expect(build({ certificates: [certificate({ expires_at: "2027-10-01" })] })).toEqual([]);
  });

  it("asks for a renewal when one has expired or is close", () => {
    const tasks = build({
      certificates: [
        certificate({ id: "gone", course_id: "c9", expires_at: "2026-09-01" }),
        certificate({ id: "soon", course_id: "c8", expires_at: "2026-11-05" }),
      ],
    });
    expect(tasks.map((t) => [t.key, t.urgency])).toEqual([
      ["certificate:gone", "overdue"],
      ["certificate:soon", "due_soon"],
    ]);
  });

  it("does not ask twice for the same course", () => {
    // The course is assigned again AND its old certificate has expired. That
    // is one job, and a list that repeats itself stops being read.
    const tasks = build({
      enrolments: [enrolment({ course_id: "c9", title: "Fire Safety" })],
      certificates: [certificate({ course_id: "c9", expires_at: "2026-09-01" })],
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].kind).toBe("training");
  });
});

describe("urgency", () => {
  it("calls a past due date overdue", () => {
    const [task] = build({ enrolments: [enrolment({ due_date: "2026-10-01" })] });
    expect(task.urgency).toBe("overdue");
  });

  it("calls the next 30 days due soon, and beyond that open", () => {
    const [soon] = build({ enrolments: [enrolment({ due_date: "2026-11-10" })] });
    expect(soon.urgency).toBe("due_soon");
    const [later] = build({ enrolments: [enrolment({ due_date: "2026-12-25" })] });
    expect(later.urgency).toBe("open");
  });
});

describe("order", () => {
  it("puts late first, then close, then the rest, and undated last", () => {
    const tasks = build({
      enrolments: [
        enrolment({ id: "undated" }),
        enrolment({ id: "late", due_date: "2026-10-02" }),
        enrolment({ id: "distant", due_date: "2026-12-20" }),
        enrolment({ id: "soon", due_date: "2026-11-01" }),
      ],
    });
    expect(tasks.map((t) => t.key)).toEqual([
      "enrolment:late",
      "enrolment:soon",
      "enrolment:distant",
      "enrolment:undated",
    ]);
  });

  it("sorts two late things by which was due first", () => {
    const tasks = build({
      enrolments: [enrolment({ id: "b", due_date: "2026-10-20" })],
      actions: [action({ id: "a", due_date: "2026-10-05" })],
    });
    expect(tasks.map((t) => t.key)).toEqual(["action:a", "enrolment:b"]);
  });
});

describe("what can be ticked off", () => {
  it("only offers it on an action", () => {
    const tasks = build({
      enrolments: [enrolment()],
      certificates: [certificate({ expires_at: "2026-09-01" })],
      actions: [action()],
    });
    const tickable = tasks.filter((t) => t.actionId !== null);
    expect(tickable.map((t) => t.kind)).toEqual(["action"]);
  });

  it("says where an action came from", () => {
    const [task] = build({ actions: [action({ source_type: "supervision" })] });
    expect(task.source).toBe("From a supervision");
  });
});

describe("forms a manager has asked for", () => {
  it("become tasks until they are completed", () => {
    const tasks = build({
      forms: [
        { id: "open", title: "Supervision record", due_date: "2026-11-01", completed_at: null },
        { id: "done", title: "Job application", due_date: null, completed_at: "2026-10-20T10:00:00Z" },
      ],
    });
    expect(tasks.map((t) => t.key)).toEqual(["form:open"]);
    expect(tasks[0].title).toBe("Complete Supervision record");
    expect(tasks[0].urgency).toBe("due_soon");
  });

  it("cannot be ticked off from the list — only submitted", () => {
    const [task] = build({
      forms: [{ id: "f", title: "Spot check", due_date: null, completed_at: null }],
    });
    expect(task.actionId).toBeNull();
  });
});
