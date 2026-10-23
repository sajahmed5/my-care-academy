import { describe, expect, it } from "vitest";
import {
  bandForHeadcount,
  hasOutgrownBand,
  serviceTypeLabel,
  sizeBandLabel,
} from "../lib/organisations";

describe("bandForHeadcount", () => {
  it("puts a new service in the smallest band", () => {
    expect(bandForHeadcount(0)).toBe("under_10");
    expect(bandForHeadcount(1)).toBe("under_10");
  });

  it("changes band at 10 and at 26", () => {
    expect(bandForHeadcount(9)).toBe("under_10");
    expect(bandForHeadcount(10)).toBe("10_to_25");
    expect(bandForHeadcount(25)).toBe("10_to_25");
    expect(bandForHeadcount(26)).toBe("over_25");
  });

  it("has no upper limit", () => {
    expect(bandForHeadcount(500)).toBe("over_25");
  });
});

describe("labels", () => {
  it("say so plainly when nothing is recorded", () => {
    expect(sizeBandLabel(null)).toBe("Not set");
    expect(serviceTypeLabel(null)).toBe("Not set");
  });

  it("render a known value", () => {
    expect(sizeBandLabel("10_to_25")).toBe("10–25 staff");
    expect(serviceTypeLabel("care_home")).toBe("Care home");
  });

  it("fall back to the raw value rather than hiding it", () => {
    expect(sizeBandLabel("enormous")).toBe("enormous");
    expect(serviceTypeLabel("hospice")).toBe("hospice");
  });
});

describe("hasOutgrownBand", () => {
  it("is false while staff fit the recorded band", () => {
    expect(hasOutgrownBand("under_10", 9)).toBe(false);
    expect(hasOutgrownBand("10_to_25", 25)).toBe(false);
  });

  it("is true once staff pass it", () => {
    expect(hasOutgrownBand("under_10", 10)).toBe(true);
    expect(hasOutgrownBand("10_to_25", 26)).toBe(true);
  });

  // Shrinking is shown on the organisation's own page, but it is not the
  // signal to re-price upwards, so the list does not flag it.
  it("is false for a smaller organisation than its band", () => {
    expect(hasOutgrownBand("over_25", 3)).toBe(false);
  });

  it("is false when no band has been recorded", () => {
    expect(hasOutgrownBand(null, 400)).toBe(false);
  });

  it("is false for a value it does not recognise", () => {
    expect(hasOutgrownBand("enormous", 400)).toBe(false);
  });
});
