import { describe, expect, it } from "vitest";
import { sanitiseAnswers, validateApplication, type Answers } from "../lib/recruitment-application";

const TODAY = "2026-10-29";

/** A complete application: employed for the whole ten years, two referees. */
const complete: Answers = {
  firstName: "Sam", surname: "Jones", dob: "1990-05-01", gender: "Female", mobile: "07700900000", email: "sam@example.test",
  nameChanged: "no",
  roleApplied: "Care assistant", heardFrom: "Indeed",
  rightToWork: "yes", drivingLicence: "yes", carAccess: "yes", travelType: "Driver",
  availability: ["Monday|Morning & Lunch"], preferredAreas: "North",
  address1: "1 High Street", city: "Stockport", postcode: "SK1 1AA", movedIn: "2010-01",
  whyCarer: "To help people stay at home.",
  kinName: "Pat Jones", kinRelationship: "Parent", kinMobile: "07700900001",
  languagesSpoken: ["English"],
  everEmployed: "yes", leftEducation: "2008-07",
  jobs: [{ employer: "Care Co", role: "Carer", from: "2008-08", to: "current", careRole: "yes", reasonForLeaving: "still employed" }],
  referees: [
    { type: "Previous employer", name: "Ms A Boss", email: "boss@example.test", phone: "0161 000 0000", relationship: "Manager" },
    { type: "Character reference", name: "Mr B Friend", email: "friend@example.test", phone: "0161 000 0001", relationship: "Neighbour" },
  ],
  hasConvictions: "no", underInvestigation: "no",
  declareTrue: true, consentReferees: true, consentData: true,
};

describe("the application form", () => {
  it("accepts a complete application", () => {
    expect(validateApplication(sanitiseAnswers(complete), TODAY)).toEqual({});
  });

  it("asks which job they're applying for, and keeps the answer", () => {
    const { roleApplied: _, ...missing } = complete;
    expect(validateApplication(missing, TODAY).work?.[0].field).toBe("roleApplied");
    expect(sanitiseAnswers(complete).heardFrom).toBe("Indeed");
    expect(sanitiseAnswers({ ...complete, roleApplied: "Astronaut" }).roleApplied).toBe("Astronaut");
    expect(validateApplication({ ...complete, roleApplied: "Astronaut" }, TODAY).work?.[0].message).toMatch(/Choose one/);
  });

  it("needs a reason for a break in work history", () => {
    const gap = { ...complete, jobs: [{ ...(complete.jobs as object[])[0], from: "2020-01" }] } as Answers;
    expect(validateApplication(gap, TODAY).employment?.map((e) => e.field)).toContain("gapExplanation");
  });
});
