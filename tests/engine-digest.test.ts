import { describe, it, expect } from "vitest";
import {
  chunk,
  esc,
  planReminders,
  reminderEmail,
  renewalLearnerEmail,
  renewalOrgEmail,
  type ReminderItem,
} from "../lib/engine-digest";

const NOW = new Date("2026-09-11T07:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const item = (over: Partial<ReminderItem>): ReminderItem => ({
  enrolmentId: "e",
  userId: "u1",
  courseTitle: "Course",
  dueDate: null,
  overdue: false,
  lastReminderAt: null,
  ...over,
});

describe("planReminders — one email per person, not per course", () => {
  it("collapses many courses for one learner into a single plan", () => {
    const items = Array.from({ length: 16 }, (_, i) =>
      item({ enrolmentId: `e${i}`, courseTitle: `Course ${i}` }),
    );
    const plans = planReminders(items, 7, NOW);
    // This person used to get 16 emails in one morning.
    expect(plans).toHaveLength(1);
    expect(plans[0].items).toHaveLength(16);
    expect(plans[0].enrolmentIds).toHaveLength(16);
  });

  it("keeps different learners separate", () => {
    const plans = planReminders(
      [item({ userId: "a", enrolmentId: "1" }), item({ userId: "b", enrolmentId: "2" })],
      7,
      NOW,
    );
    expect(plans.map((p) => p.userId).sort()).toEqual(["a", "b"]);
  });

  it("skips someone whose every course was reminded recently", () => {
    const plans = planReminders(
      [
        item({ enrolmentId: "1", lastReminderAt: daysAgo(2) }),
        item({ enrolmentId: "2", lastReminderAt: daysAgo(3) }),
      ],
      7,
      NOW,
    );
    expect(plans).toEqual([]);
  });

  it("once one course is due, lists ALL their outstanding courses and resets them together", () => {
    // A newly assigned course shouldn't produce a second email a day after the
    // last one, listing only itself — it joins the whole set on one cycle.
    const plans = planReminders(
      [
        item({ enrolmentId: "old", courseTitle: "Reminded yesterday", lastReminderAt: daysAgo(1) }),
        item({ enrolmentId: "new", courseTitle: "Never reminded", lastReminderAt: null }),
      ],
      7,
      NOW,
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].enrolmentIds.sort()).toEqual(["new", "old"]);
  });

  it("puts overdue courses first, then soonest due", () => {
    const plans = planReminders(
      [
        item({ enrolmentId: "later", courseTitle: "Later", dueDate: "2026-10-30" }),
        item({ enrolmentId: "late", courseTitle: "Late", dueDate: "2026-09-01", overdue: true }),
        item({ enrolmentId: "soon", courseTitle: "Soon", dueDate: "2026-09-20" }),
        item({ enrolmentId: "none", courseTitle: "No date" }),
      ],
      7,
      NOW,
    );
    expect(plans[0].items.map((i) => i.courseTitle)).toEqual(["Late", "Soon", "Later", "No date"]);
  });
});

describe("reminderEmail", () => {
  it("sets up the account of someone who has never signed in, instead of sending them to sign in", () => {
    const { html } = reminderEmail("Sam", [item({})], "https://x", "https://x/auth/setup?t=abc");
    expect(html).toContain('href="https://x/auth/setup?t=abc"');
    expect(html).toContain("Set up your account");
    expect(html).not.toContain('href="https://x/learn"');
  });
  it("leads with overdue in the subject when there is any", () => {
    const { subject } = reminderEmail(
      "Sam",
      [item({ overdue: true, dueDate: "2026-09-01" }), item({})],
      "https://x",
    );
    expect(subject).toBe("You have 1 overdue course");
  });

  it("counts courses when nothing is overdue", () => {
    const { subject, html } = reminderEmail("Sam", [item({}), item({}), item({})], "https://x");
    expect(subject).toBe("3 courses to complete");
    expect(html).toContain("https://x/learn");
  });

  it("escapes names and course titles — both are user-entered", () => {
    const { html } = reminderEmail(
      "<script>x</script>",
      [item({ courseTitle: 'A & "B"' })],
      "https://x",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; &quot;B&quot;");
  });
});

describe("renewal emails", () => {
  const notices = [
    { learnerName: "Sam", courseTitle: "Fire Safety", kind: "expired" as const, expiresAt: "2026-09-01" },
    { learnerName: "Jo", courseTitle: "COSHH", kind: "due" as const, expiresAt: "2026-10-01", withinDays: 30 },
  ];

  it("gives a manager one summary naming each carer", () => {
    const { subject, html } = renewalOrgEmail("HG Care", notices, "https://x");
    expect(subject).toBe("Certificates: 1 expired, 1 due for renewal — HG Care");
    expect(html).toContain("Sam");
    expect(html).toContain("Jo");
    expect(html).toContain("https://x/org/certificates");
  });

  it("tells a learner about their own certificates without naming them in every line", () => {
    const { subject, html } = renewalLearnerEmail("Sam", [notices[0]], "https://x");
    expect(subject).toBe("Your Fire Safety certificate has expired");
    expect(html).toContain("Fire Safety");
  });

  it("counts when several certificates are involved", () => {
    const two = [notices[0], { ...notices[0], courseTitle: "COSHH" }];
    expect(renewalLearnerEmail("Sam", two, "https://x").subject).toBe("2 of your certificates have expired");
    expect(renewalLearnerEmail("Sam", [notices[1]], "https://x").subject).toBe(
      "Your COSHH certificate is due for renewal",
    );
  });
});

describe("chunk and esc", () => {
  it("splits into runs of at most the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });

  it("escapes the characters that matter in HTML", () => {
    expect(esc(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});
