import { describe, expect, it } from "vitest";
import { parseTrialSignup, trialSignupNotificationEmail, type TrialSignup } from "../lib/trial-signup";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

const good = {
  orgName: "Hargreaves Home Care",
  name: "Jane Hargreaves",
  email: "Jane@HargreavesCare.co.uk",
  phone: "0161 000 0000",
  serviceType: "homecare",
  sizeBand: "10_to_25",
  agree: "on",
};

describe("the free-trial sign-up form", () => {
  it("reads a complete form, lower-casing the email", () => {
    const { values, fieldErrors } = parseTrialSignup(form(good));
    expect(fieldErrors).toEqual({});
    expect(values).toEqual({ ...good, email: "jane@hargreavescare.co.uk", agree: true });
  });

  it("names every missing field, not just the first", () => {
    const { fieldErrors } = parseTrialSignup(form({ email: "not-an-address" }));
    expect(Object.keys(fieldErrors).sort()).toEqual(["agree", "email", "name", "orgName", "serviceType", "sizeBand"]);
    expect(fieldErrors.email).toMatch(/doesn't look like/);
  });

  it("refuses a service type or size band that isn't one of ours", () => {
    const { fieldErrors } = parseTrialSignup(form({ ...good, serviceType: "hospital", sizeBand: "huge" }));
    expect(Object.keys(fieldErrors).sort()).toEqual(["serviceType", "sizeBand"]);
  });

  it("needs the box ticked", () => {
    const { fieldErrors } = parseTrialSignup(form({ ...good, agree: "" }));
    expect(fieldErrors).toEqual({ agree: "Please tick the box to carry on." });
  });
});

const signup: TrialSignup = {
  orgId: "org-1",
  orgName: "Hargreaves Home Care",
  name: "Jane Hargreaves",
  email: "jane@hargreavescare.co.uk",
  phone: null,
  serviceType: "homecare",
  sizeBand: "10_to_25",
  endsOn: "Sunday 6 December",
  emailed: true,
};

describe("the sign-up email to us", () => {
  it("leads with the company, and links to its platform page", () => {
    const { subject, html } = trialSignupNotificationEmail(signup, "https://www.mycareacademy.co.uk");
    expect(subject).toBe("Free trial started — Hargreaves Home Care (Jane Hargreaves)");
    expect(html).toContain("https://www.mycareacademy.co.uk/platform/organisations/org-1");
    expect(html).toContain("Homecare");
    expect(html).toContain("10–25 staff");
    expect(html).toContain("end of Sunday 6 December");
    expect(html).not.toContain("Phone");
    expect(html).toContain("welcome email has gone");
  });

  it("shouts when the welcome email didn't go", () => {
    const { html } = trialSignupNotificationEmail({ ...signup, phone: "0161 000 0000", emailed: false }, "https://x");
    expect(html).toContain("could not be sent");
    expect(html).toContain("0161 000 0000");
  });

  it("escapes what they typed", () => {
    const { html } = trialSignupNotificationEmail({ ...signup, orgName: "<b>Care</b>" }, "https://x");
    expect(html).not.toContain("<b>Care</b>");
    expect(html).toContain("&lt;b&gt;Care&lt;/b&gt;");
  });
});
