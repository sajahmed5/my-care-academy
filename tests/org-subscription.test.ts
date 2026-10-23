import { describe, expect, it } from "vitest";
import { choiceFor, overrideChanges, parsePounds } from "../lib/org-subscription";

describe("parsePounds", () => {
  it("reads whole and decimal pounds as pence", () => {
    expect(parsePounds("79")).toEqual({ ok: true, pence: 7900 });
    expect(parsePounds("79.5")).toEqual({ ok: true, pence: 7950 });
    expect(parsePounds("£1,250.00")).toEqual({ ok: true, pence: 125000 });
  });

  it("keeps blank distinct from zero", () => {
    expect(parsePounds("")).toEqual({ ok: true, pence: null });
    expect(parsePounds("  ")).toEqual({ ok: true, pence: null });
    expect(parsePounds("0")).toEqual({ ok: true, pence: 0 });
  });

  it("refuses what is not an amount", () => {
    expect(parsePounds("-5").ok).toBe(false);
    expect(parsePounds("79.999").ok).toBe(false);
    expect(parsePounds("seventy").ok).toBe(false);
  });

  it("catches an obvious typo", () => {
    expect(parsePounds("79000").ok).toBe(false);
  });
});

describe("choiceFor", () => {
  it("reads a missing exception as following the package", () => {
    expect(choiceFor(undefined)).toBe("follow");
    expect(choiceFor({ feature: "forms.builder", enabled: true })).toBe("on");
    expect(choiceFor({ feature: "forms.builder", enabled: false })).toBe("off");
  });
});

describe("overrideChanges", () => {
  const current = [
    { feature: "forms.builder", enabled: false },
    { feature: "recruitment.tracker", enabled: true },
  ];

  it("writes nothing when nothing changed", () => {
    expect(
      overrideChanges(current, { "forms.builder": "off", "recruitment.tracker": "on" }),
    ).toEqual({ set: [], clear: [] });
  });

  it("clears an exception when set back to the package", () => {
    expect(overrideChanges(current, { "forms.builder": "follow" })).toEqual({
      set: [],
      clear: ["forms.builder"],
    });
  });

  it("flips an existing exception and adds a new one", () => {
    expect(
      overrideChanges(current, {
        "forms.builder": "on",
        "documents.library": "off",
      }),
    ).toEqual({
      set: [
        { feature: "forms.builder", enabled: true },
        { feature: "documents.library", enabled: false },
      ],
      clear: [],
    });
  });

  it("ignores following the package where there was no exception", () => {
    expect(overrideChanges([], { "forms.builder": "follow" })).toEqual({
      set: [],
      clear: [],
    });
  });
});
