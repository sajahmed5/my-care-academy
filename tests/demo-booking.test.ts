import { describe, expect, it } from "vitest";
import {
  DEMO_DAYS_OFFERED,
  demoBookedNotificationEmail,
  demoDays,
  demoRequestedEmail,
  demoSlotLabel,
  demoSlotMinutes,
  demoSlots,
  isOfferedDemoSlot,
  ukInstant,
  type DemoBooking,
} from "../lib/demo-booking";

// Friday 6 November 2026, 11:00 GMT.
const friday = new Date("2026-11-06T11:00:00Z");

const times = (day: string) => demoSlotMinutes(day).map((m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

describe("the demo slots on offer", () => {
  it("starts on the next working day, never today, and runs for ten working days", () => {
    const days = demoDays(friday);
    expect(days).toHaveLength(DEMO_DAYS_OFFERED);
    expect(days[0]).toBe("2026-11-09"); // Monday: the weekend is skipped
    expect(days).not.toContain("2026-11-06");
    expect(days.every((d) => !["2026-11-07", "2026-11-08", "2026-11-14", "2026-11-15"].includes(d))).toBe(true);
  });

  it("offers half-hour slots from 9 to 5 on an ordinary day", () => {
    const monday = times("2026-11-09");
    expect(monday[0]).toBe("09:00");
    expect(monday[monday.length - 1]).toBe("16:30");
    expect(monday).toHaveLength(16);
  });

  it("blocks every Tuesday from 2pm", () => {
    const tuesday = times("2026-11-10");
    expect(tuesday).toContain("13:30");
    expect(tuesday).not.toContain("14:00");
    expect(tuesday[tuesday.length - 1]).toBe("13:30");
    expect(tuesday).toHaveLength(10);
  });

  it("blocks every Thursday from 10:30 to 12:30, and nothing either side", () => {
    const thursday = times("2026-11-12");
    expect(thursday).toContain("10:00");
    expect(thursday).not.toContain("10:30");
    expect(thursday).not.toContain("11:00");
    expect(thursday).not.toContain("11:30");
    expect(thursday).not.toContain("12:00");
    expect(thursday).toContain("12:30");
    expect(thursday).toHaveLength(12);
  });

  it("offers nothing at a weekend or on a bank holiday", () => {
    expect(demoSlotMinutes("2026-11-07")).toEqual([]);
    expect(demoSlotMinutes("2026-12-25")).toEqual([]);
  });

  it("skips bank holidays when counting the days", () => {
    const days = demoDays(new Date("2026-12-23T09:00:00Z")); // Wednesday
    expect(days[0]).toBe("2026-12-24");
    expect(days).not.toContain("2026-12-25");
    expect(days).not.toContain("2026-12-28");
    expect(days[1]).toBe("2026-12-29");
  });

  it("puts the slots at UK wall-clock time, GMT or BST", () => {
    expect(ukInstant("2026-11-10", 10 * 60).toISOString()).toBe("2026-11-10T10:00:00.000Z");
    expect(ukInstant("2026-06-09", 10 * 60).toISOString()).toBe("2026-06-09T09:00:00.000Z");
  });

  it("leaves out a slot someone already holds, keeping the day", () => {
    const list = demoSlots(friday, ["2026-11-09T10:00:00.000Z"]);
    const monday = list.find((d) => d.day === "2026-11-09")!;
    expect(monday.label).toBe("Mon 9 Nov");
    expect(monday.slots.map((s) => s.time)).not.toContain("10:00");
    expect(monday.slots.map((s) => s.time)).toContain("09:30");
    expect(monday.slots.map((s) => s.time)).toContain("10:30");
  });

  it("knows which moments are on offer and which aren't", () => {
    expect(isOfferedDemoSlot("2026-11-09T10:00:00.000Z", friday)).toBe(true);
    expect(isOfferedDemoSlot("2026-11-10T14:00:00.000Z", friday)).toBe(false); // Tuesday afternoon
    expect(isOfferedDemoSlot("2026-11-06T14:00:00.000Z", friday)).toBe(false); // today
    expect(isOfferedDemoSlot("2026-11-09T10:15:00.000Z", friday)).toBe(false); // not on the half hour
    expect(isOfferedDemoSlot("nonsense", friday)).toBe(false);
  });

  it("says the time back in words", () => {
    expect(demoSlotLabel("2026-11-10T10:00:00.000Z")).toBe("Tuesday 10 November, 10:00 to 10:30");
  });
});

const booking: DemoBooking = {
  orgId: "11111111-2222-3333-4444-555555555555",
  orgName: "Hargreaves Home Care",
  name: "Jane Hargreaves",
  email: "jane@hargreavescare.co.uk",
  phone: "0161 000 0000",
  startsAt: "2026-11-10T10:00:00.000Z",
};

describe("the demo emails", () => {
  it("tells us when and who, with a button to the company's page", () => {
    const { subject, html } = demoBookedNotificationEmail(booking, "https://www.mycareacademy.co.uk");
    expect(subject).toBe("Demo booked — Hargreaves Home Care, Tuesday 10 November, 10:00 to 10:30");
    expect(html).toContain("Jane Hargreaves");
    expect(html).toContain("0161 000 0000");
    expect(html).toContain("/platform/organisations/11111111-2222-3333-4444-555555555555");
  });

  it("gives them the time back, with the number to change it", () => {
    const { subject, html } = demoRequestedEmail(booking);
    expect(subject).toBe("Your demo: Tuesday 10 November, 10:00 to 10:30 — My Care Academy");
    expect(html).toContain("Hi Jane,");
    expect(html).toContain("0161 470 8088");
    expect(html).toContain("Hargreaves Home Care");
  });
});
