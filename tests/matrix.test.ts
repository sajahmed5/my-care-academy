import { describe, it, expect } from "vitest";
import { cellText, statusText } from "../lib/matrix";

const cert = { issued_at: "2026-03-04T09:00:00Z", expires_at: "2027-03-04T09:00:00Z" };

describe("training matrix cells say which kind of blank they are", () => {
  it("shows the completion and expiry dates when there is a certificate", () => {
    expect(cellText(cert, "completed")).toBe("04/03/2026 → 04/03/2027");
  });

  it("says so when a course never expires", () => {
    expect(cellText({ ...cert, expires_at: null }, "completed")).toBe(
      "04/03/2026 → no expiry",
    );
  });

  it("tells a never-assigned course apart from an unfinished one", () => {
    // Both of these used to be an empty cell, so "not trained" and "nothing
    // to do here" looked identical to an inspector.
    expect(cellText(undefined, undefined)).toBe("Not assigned");
    expect(cellText(undefined, "not_started")).toBe("Assigned, not started");
    expect(cellText(undefined, "in_progress")).toBe("In progress");
  });

  it("flags training that lapsed", () => {
    expect(cellText(undefined, "expired")).toBe("Expired — needs retaking");
  });

  it("never returns an empty cell", () => {
    for (const status of [undefined, "not_started", "in_progress", "expired", "completed"]) {
      expect(cellText(undefined, status).length).toBeGreaterThan(0);
    }
  });
});

describe("the Status column says whether the person has ever signed in", () => {
  const now = new Date("2026-11-07T12:00:00Z").getTime();

  it("calls a leaver Left whatever their activity", () => {
    expect(statusText({ status: "deactivated", last_seen_at: "2026-11-06T09:00:00Z" }, now)).toBe("Left");
    expect(statusText({ status: "deactivated", last_seen_at: null }, now)).toBe("Left");
  });

  it("says Never signed in when there is no last_seen_at (issue report 102)", () => {
    // Ammara Te: invited 29 Oct 2026, never onboarded, exported as "Active".
    expect(statusText({ status: "active", last_seen_at: null }, now)).toBe("Never signed in");
  });

  it("flags a month without a sign-in, with the last date", () => {
    expect(statusText({ status: "active", last_seen_at: "2026-10-01T09:00:00Z" }, now)).toBe(
      "Not signed in for a month (last 01/10/2026)",
    );
  });

  it("is Active when seen inside the last month", () => {
    expect(statusText({ status: "active", last_seen_at: "2026-10-20T09:00:00Z" }, now)).toBe("Active");
    expect(statusText({ status: "active", last_seen_at: "2026-11-07T11:00:00Z" }, now)).toBe("Active");
  });
});
