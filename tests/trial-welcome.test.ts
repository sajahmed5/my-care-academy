import { describe, expect, it } from "vitest";
import { trialWelcomeEmail, type TrialWelcome } from "@/lib/trial-welcome";
import { trialEndFrom } from "@/lib/trial";

const base: TrialWelcome = {
  name: "Priya Shah",
  email: "priya@sunrise.example",
  orgName: "Sunrise Home Care",
  roleLabel: "manager",
  startsKey: "2026-11-02",
  todayKey: "2026-11-02",
  endsAt: trialEndFrom("2026-11-02"),
  others: [{ name: "Tom Reid", roleLabel: "office worker" }],
  setupLink: "https://www.mycareacademy.co.uk/auth/setup?t=abc",
};

describe("the trial welcome email", () => {
  it("starting today: the dates, the role, who else, the 14-day button, three things to try", () => {
    const { subject, html } = trialWelcomeEmail(base);
    expect(subject).toBe("Your 7-day My Care Academy trial starts today");
    expect(html).toContain("Welcome, Priya: your free trial starts today");
    expect(html).toContain("until the end of <strong>Monday 9 November</strong>");
    expect(html).toContain("You're set up as a manager. Tom Reid (office worker) has been invited too.");
    expect(html).toContain('href="https://www.mycareacademy.co.uk/auth/setup?t=abc"');
    expect(html).toContain("Set your password and start");
    expect(html).toContain("keeps working for 14 days");
    expect(html).toContain("Three things to try first");
    expect(html).not.toMatch(/password:/i);
  });

  it("starting on a later day says which day", () => {
    const { subject, html } = trialWelcomeEmail({ ...base, startsKey: "2026-11-09", endsAt: trialEndFrom("2026-11-09"), others: [] });
    expect(subject).toBe("Your 7-day My Care Academy trial starts on Monday 9 November");
    expect(html).toContain("your free trial starts on Monday 9 November");
    expect(html).toContain("You're set up as a manager.</p>");
  });

  it("joining a trial already running names who's already in", () => {
    const { subject, html } = trialWelcomeEmail({
      ...base,
      name: "Aisha Khan",
      roleLabel: "office worker",
      startsKey: null,
      others: [
        { name: "Priya Shah", roleLabel: "manager" },
        { name: "Tom Reid", roleLabel: "office worker" },
      ],
    });
    expect(subject).toBe("You've joined Sunrise Home Care's free trial of My Care Academy");
    expect(html).toContain("Welcome, Aisha: you've joined Sunrise Home Care's free trial");
    expect(html).toContain("You're set up as an office worker. Also here: Priya Shah (manager) and Tom Reid (office worker).");
  });

  it("escapes what people typed", () => {
    const { html } = trialWelcomeEmail({ ...base, name: "<b>Eve</b>", orgName: "A & B <Care>" });
    expect(html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(html).toContain("A &amp; B &lt;Care&gt;");
  });
});
