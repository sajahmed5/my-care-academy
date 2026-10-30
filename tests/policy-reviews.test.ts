import { describe, expect, it } from "vitest";
import { mergeDetails, stillToWrite } from "../lib/policy-library";
import { policyDigest, policyDigestHtml, policyReminderEmail, reviewsDue } from "../lib/policy-digest";

describe("mergeDetails", () => {
  const blocks = [
    { type: "paragraph" as const, text: "{{organisation}}'s registered manager is {{registered_manager}}." },
    { type: "paragraph" as const, text: "Write to {{office_address}}." },
  ];

  it("puts the company's details in, and leaves a fill-in for what it has not given", () => {
    const out = mergeDetails(blocks, "Acme Care", { registered_manager: "Jo Bloggs" });
    expect(out[0].text).toBe("Acme Care's registered manager is Jo Bloggs.");
    expect(out[1].text).toBe("Write to [Office address].");
    // The fill-in stops it being published until someone writes it.
    expect(stillToWrite(out).fillIns).toBe(1);
  });

  it("fills a fill-in left by an earlier merge once the detail is given", () => {
    const first = mergeDetails(blocks, "Acme Care", {});
    const again = mergeDetails(first, "Acme Care", { office_address: "1 High St, Stockport", registered_manager: "Jo Bloggs" });
    expect(again.map((b) => b.text)).toEqual(["Acme Care's registered manager is Jo Bloggs.", "Write to 1 High St, Stockport."]);
  });
});

describe("policy reviews due", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const rows = [
    { copyId: "a", title: "Safeguarding", code: "S", reviewDueOn: "2026-10-01" },
    { copyId: "b", title: "Complaints", code: "C", reviewDueOn: "2026-11-20" },
    { copyId: "c", title: "Consent", code: "K", reviewDueOn: "2027-10-31" },
    { copyId: "d", title: "Recruitment", code: "R", reviewDueOn: null },
  ];

  it("sorts soonest first and says where each stands", () => {
    expect(reviewsDue(rows, now).map((r) => [r.title, r.status])).toEqual([
      ["Safeguarding", "overdue"],
      ["Complaints", "due_soon"],
      ["Consent", "scheduled"],
      ["Recruitment", "none"],
    ]);
  });

  it("counts them for the weekly email, and says nothing when nothing is due", () => {
    const d = policyDigest(rows, now);
    expect(d).toEqual({ reviewsOverdue: 1, reviewsDueSoon: 1, lateAcceptances: 0, latePeople: 0 });
    expect(policyDigestHtml(d, "https://x.test")).toContain("1 overdue, 1 due in the next 30 days");
    expect(policyDigestHtml({ reviewsOverdue: 0, reviewsDueSoon: 0, lateAcceptances: 0, latePeople: 0 }, "https://x.test")).toBe("");
  });
});

describe("policyReminderEmail", () => {
  it("lists what is owed, soonest first, and says when one is overdue", () => {
    const { subject, html } = policyReminderEmail(
      "Cara",
      "Acme Care",
      [
        { title: "Whistleblowing", dueOn: "2026-11-08", late: false },
        { title: "Safeguarding", dueOn: "2026-10-17", late: true },
      ],
      "https://x.test",
    );
    expect(subject).toBe("Overdue: policies to read for Acme Care");
    expect(html.indexOf("Safeguarding")).toBeLessThan(html.indexOf("Whistleblowing"));
    expect(html).toContain("https://x.test/learn/policies");
  });
});
