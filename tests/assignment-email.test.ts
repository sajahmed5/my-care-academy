import { describe, expect, it } from "vitest";
import { assignmentEmail, shouldNotify, trainingNotices, type Recipient } from "../lib/assignment-email";

const person = (over: Partial<Recipient> = {}): Recipient => ({
  id: "u1",
  full_name: "Sam Ilyas",
  email: "sam@example.test",
  status: "active",
  last_seen_at: "2026-10-20T09:00:00Z",
  ...over,
});

describe("who is told about an assignment", () => {
  it("is an active person with an email who has signed in", () => {
    expect(shouldNotify(person(), "manager")).toBe(true);
  });
  it("is never the person who did the assigning", () => {
    expect(shouldNotify(person({ id: "manager" }), "manager")).toBe(false);
  });
  it("skips someone who has never signed in — their invitation is the email that helps", () => {
    expect(shouldNotify(person({ last_seen_at: null }), "manager")).toBe(false);
  });
  it("works with nobody assigning, as when MyRoster does it", () => {
    expect(shouldNotify(person(), null)).toBe(true);
    expect(shouldNotify(person({ last_seen_at: null }), null)).toBe(false);
  });
  it("tells someone who has never signed in about training, but not about a form or an action", () => {
    expect(shouldNotify(person({ last_seen_at: null }), "manager", "training_assigned")).toBe(true);
    expect(shouldNotify(person({ last_seen_at: null }), null, "training_assigned")).toBe(true);
    expect(shouldNotify(person({ last_seen_at: null }), "manager", "form_assigned")).toBe(false);
    expect(shouldNotify(person({ last_seen_at: null, status: "deactivated" }), null, "training_assigned")).toBe(false);
  });
  it("skips the deactivated and those with no address", () => {
    expect(shouldNotify(person({ status: "deactivated" }), "manager")).toBe(false);
    expect(shouldNotify(person({ email: null }), "manager")).toBe(false);
  });
});

describe("the email", () => {
  const ctx = { name: "Sam", assignedByName: "Ammara", orgName: "Norwood Drive", origin: "https://www.mycareacademy.co.uk" };

  it("names the form, the date and links to it", () => {
    const { subject, html } = assignmentEmail(
      "form_assigned",
      { userId: "u1", title: "Client QA", dueDate: "2026-11-03", href: "/learn/forms/a1" },
      ctx,
    );
    expect(subject).toBe("Form to complete: Client QA");
    expect(html).toContain("3 November 2026");
    expect(html).toContain('href="https://www.mycareacademy.co.uk/learn/forms/a1"');
  });
  it("says who to ask when there is no page to open", () => {
    const { subject, html } = assignmentEmail(
      "action_assigned",
      { userId: "u1", title: "Carry out a spot check", dueDate: null, href: null },
      ctx,
    );
    expect(subject).toBe("Action assigned to you: Carry out a spot check");
    expect(html).toContain("Speak to Ammara");
    expect(html).not.toContain("href=");
  });
  it("says training when it is training", () => {
    const { subject, html } = assignmentEmail(
      "training_assigned",
      { userId: "u1", title: "Fire Safety", dueDate: "2026-11-30", href: "/learn/modules" },
      ctx,
    );
    expect(subject).toBe("Training to complete: Fire Safety");
    expect(html).toContain("training to complete");
    expect(html).toContain("/learn/modules");
  });
  it("escapes what people typed", () => {
    const { html } = assignmentEmail(
      "action_assigned",
      { userId: "u1", title: "<b>x</b>", dueDate: null, href: null, note: "a & b" },
      ctx,
    );
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("a &amp; b");
  });
});

describe("training for someone who has never signed in", () => {
  it("gives them a button to set up their account instead of one to a page they can't open", () => {
    const { html } = assignmentEmail(
      "training_assigned",
      { userId: "u1", title: "Fire Safety", dueDate: "2026-11-30", href: "/learn/modules" },
      { name: "Sam", assignedByName: "Your manager", orgName: "HG Care", origin: "https://x", setupUrl: "https://x/auth/setup?t=abc" },
    );
    expect(html).toContain("Set up your account");
    expect(html).toContain('href="https://x/auth/setup?t=abc"');
    expect(html).not.toContain("/learn/modules");
    expect(html).toContain("Fire Safety");
  });
});

describe("training from MyRoster", () => {
  const titles = new Map([["c1", "Fire Safety"], ["c2", "Moving and Handling"], ["c3", "Safeguarding"]]);
  it("is one notice per carer, naming every new course", () => {
    const notices = trainingNotices(
      [
        { user_id: "u1", course_id: "c1", due_date: "2026-11-30" },
        { user_id: "u1", course_id: "c2", due_date: "2026-11-30" },
        { user_id: "u2", course_id: "c3", due_date: "2026-11-30" },
      ],
      titles,
    );
    expect(notices).toEqual([
      { userId: "u1", title: "2 courses (Fire Safety, Moving and Handling)", dueDate: "2026-11-30", href: "/learn/modules" },
      { userId: "u2", title: "Safeguarding", dueDate: "2026-11-30", href: "/learn/modules" },
    ]);
  });
  it("is empty when nothing new was given", () => {
    expect(trainingNotices([], titles)).toEqual([]);
  });
});
