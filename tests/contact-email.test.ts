import { describe, it, expect } from "vitest";
import {
  enquiryNotificationEmail,
  enquiryReceivedEmail,
  type Enquiry,
} from "../lib/contact-email";
import { TOPICS, isTeamSize, toTopic } from "../app/(marketing)/contact/topics";

const base: Enquiry = {
  name: "Jane Hargreaves",
  email: "jane@hargreavescare.co.uk",
  phone: null,
  organisation: null,
  teamSize: null,
  topicLabel: "Book a demo",
  message: null,
};

describe("enquiry notification (to us)", () => {
  it("leads the subject with the topic, then who it's from", () => {
    const { subject } = enquiryNotificationEmail({
      ...base,
      topicLabel: "Mock CQC inspection",
      organisation: "Hargreaves Home Care",
    });
    expect(subject).toBe(
      "Mock CQC inspection — Jane Hargreaves, Hargreaves Home Care",
    );
  });

  it("leaves the service off the subject when they didn't give one", () => {
    expect(enquiryNotificationEmail(base).subject).toBe(
      "Book a demo — Jane Hargreaves",
    );
  });

  it("includes every detail they did give, and omits the rows they didn't", () => {
    const { html } = enquiryNotificationEmail({
      ...base,
      phone: "0161 000 0000",
      teamSize: "26–50 staff",
      pagePath: "/training/pricing",
    });
    expect(html).toContain("0161 000 0000");
    expect(html).toContain("26–50 staff");
    expect(html).toContain("/training/pricing");
    expect(html).not.toContain("Service");
  });

  it("says so plainly when there's no message, rather than showing an empty quote", () => {
    expect(enquiryNotificationEmail(base).html).toContain(
      "They didn't leave a message.",
    );
    expect(enquiryNotificationEmail({ ...base, message: "   " }).html).toContain(
      "didn't leave a message",
    );
  });

  it("replies to the enquirer, not to us", () => {
    const { html } = enquiryNotificationEmail(base);
    expect(html).toContain("mailto:jane@hargreavescare.co.uk");
  });

  // The form is open to the whole internet, so anything typed into it has to
  // survive landing in our own inbox as text.
  it("escapes HTML in everything the visitor typed", () => {
    const { subject, html } = enquiryNotificationEmail({
      ...base,
      name: '<script>alert(1)</script>',
      organisation: 'Care & Co "Ltd"',
      message: "<img src=x onerror=alert(2)>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Care &amp; Co &quot;Ltd&quot;");
    // The subject is a header, not HTML — it is never rendered as markup.
    expect(subject).toContain("<script>");
  });
});

describe("enquiry receipt (to them)", () => {
  it("greets them by first name only", () => {
    expect(enquiryReceivedEmail(base, "https://x").html).toContain("Hi Jane,");
  });

  it("falls back to 'there' when the name is unusable", () => {
    expect(
      enquiryReceivedEmail({ ...base, name: "   " }, "https://x").html,
    ).toContain("Hi there,");
  });

  it("gives them the phone number and a link built from the real origin", () => {
    const { html } = enquiryReceivedEmail(base, "https://www.mycareacademy.co.uk");
    expect(html).toContain("tel:+441616944701");
    expect(html).toContain("https://www.mycareacademy.co.uk/training");
  });

  it("quotes their message back as text, escaped", () => {
    const { html } = enquiryReceivedEmail(
      { ...base, message: "<b>20 carers</b>" },
      "https://x",
    );
    expect(html).toContain("&lt;b&gt;20 carers&lt;/b&gt;");
  });
});

describe("topics from the URL", () => {
  it("accepts the keys the CTAs link to", () => {
    expect(toTopic("mock-inspection")).toBe("mock-inspection");
    expect(TOPICS[toTopic("pricing")]).toBe("Pricing and plans");
  });

  it("falls back to a demo for anything else", () => {
    expect(toTopic("../../etc/passwd")).toBe("demo");
    expect(toTopic(undefined)).toBe("demo");
    expect(toTopic("")).toBe("demo");
  });

  it("only accepts a team size from the list offered", () => {
    expect(isTeamSize("26–50 staff")).toBe(true);
    expect(isTeamSize("26-50 staff")).toBe(false);
    expect(isTeamSize("loads")).toBe(false);
  });
});
