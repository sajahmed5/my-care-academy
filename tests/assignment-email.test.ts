import { describe, expect, it } from "vitest";
import { assignmentEmail, shouldNotify, type Recipient } from "../lib/assignment-email";

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
