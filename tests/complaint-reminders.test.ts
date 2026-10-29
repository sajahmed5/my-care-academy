import { describe, expect, it } from "vitest";
import { readConfirmations, remindersFor } from "../lib/complaints/reminders";
import { buildSteps } from "../lib/complaints/steps";

describe("safeguarding reminders", () => {
  it("names the council, CQC and police, and nothing for other types", () => {
    expect(remindersFor("safeguarding", {}, {}).map((r) => r.key)).toEqual(["council", "cqc", "police"]);
    expect(remindersFor("complaint", {}, {})).toEqual([]);
    expect(remindersFor("near_miss", {}, {})).toEqual([]);
  });

  it("names the client's council when it is known", () => {
    expect(remindersFor("safeguarding", {}, {}, { council: "Stockport Council" })[0].title).toBe(
      "Refer to Stockport Council's safeguarding team",
    );
  });

  it("counts a dated referral, or a No with its reason, as dealt with", () => {
    const r = remindersFor(
      "safeguarding",
      {
        sg_referral: { sgr_needed: true, sgr_date: "2026-10-29", sgr_reference: "ASC-123" },
        sg_police: { sgp_needed: false, sgp_why_not: "No crime alleged" },
      },
      {},
    );
    expect(r[0].done?.how).toBe("Done 29 Oct 2026, reference ASC-123");
    expect(r[1].done).toBeNull();
    expect(r[2].done?.how).toMatch(/not needed/);
  });

  it("a Yes without a date is not done", () => {
    expect(remindersFor("safeguarding", { sg_cqc: { sgc_needed: true } }, {})[1].done).toBeNull();
  });

  it("shows a manager's confirmation, with who and when", () => {
    const c = readConfirmations({ cqc: { at: "2026-10-29T10:00:00Z", byName: "Saj" }, junk: 3 });
    expect(remindersFor("safeguarding", {}, c)[1].done?.how).toBe("Confirmed by Saj on 29 Oct 2026");
  });

  it("asks for a DBS referral only once someone was removed", () => {
    expect(remindersFor("safeguarding", { sg_lessons: { sgl_removed: false } }, {}).some((r) => r.key === "dbs")).toBe(false);
    const dbs = remindersFor("safeguarding", { sg_lessons: { sgl_removed: true } }, {}).find((r) => r.key === "dbs");
    expect(dbs?.done).toBeNull();
  });
});

describe("the RIDDOR reminder", () => {
  const riddor = (a: Record<string, unknown>) => remindersFor("accident", { accident_report: a }, {})[0];

  it("is always there on an accident, as a check", () => {
    expect(riddor({}).title).toBe("Check whether RIDDOR applies");
    expect(riddor({}).likely).toBe(false);
  });

  it("says it looks reportable for a specified injury, or staff off over seven days", () => {
    expect(riddor({ ar_specified: true }).likely).toBe(true);
    expect(riddor({ ar_who: "staff", ar_off_work: "over_7" }).likely).toBe(true);
    expect(riddor({ ar_who: "staff", ar_off_work: "up_to_7" }).likely).toBe(false);
  });

  it("for a client taken to hospital, only when it arose from the work", () => {
    expect(riddor({ ar_who: "client", ar_treatment: "hospital", ar_work_related: true }).likely).toBe(true);
    expect(riddor({ ar_who: "client", ar_treatment: "hospital", ar_work_related: false }).likely).toBe(false);
  });

  it("is done once reported with a date, or decided not reportable with a reason", () => {
    expect(riddor({ ar_riddor: true, ar_riddor_date: "2026-10-30" }).done?.how).toBe("Reported 30 Oct 2026");
    expect(riddor({ ar_riddor: false, ar_riddor_why: "Bruise only" }).done?.how).toMatch(/not reportable/);
  });
});

describe("the steps of a safeguarding concern", () => {
  it("follows its own six, around the statements", () => {
    const stages = [
      { id: "f", name: "Complaint Form", kind: "complaint_form" },
      { id: "a", name: "Keeping Them Safe", kind: "sg_immediate" },
      { id: "b", name: "Council Referral", kind: "sg_referral" },
      { id: "c", name: "CQC Notification", kind: "sg_cqc" },
      { id: "d", name: "Police", kind: "sg_police" },
      { id: "s", name: "Carer Statement", kind: "document" },
      { id: "e", name: "Council Enquiry Outcome", kind: "sg_enquiry" },
      { id: "g", name: "Lessons Learned", kind: "sg_lessons" },
    ];
    expect(buildSteps(stages, [], false).map((s) => s.title)).toEqual([
      "Concern raised", "Keep them safe", "Council referral", "CQC notification", "Police",
      "Investigate", "Council's enquiry", "Lessons learned", "Follow-up and close",
    ]);
  });
});
