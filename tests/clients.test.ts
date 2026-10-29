import { describe, expect, it } from "vitest";
import { parseClientsCsv, parseFunder, parseUkDate } from "../lib/clients";

describe("parseUkDate", () => {
  it("reads a UK date, a short year and an ISO date", () => {
    expect(parseUkDate("01/02/1940")).toBe("1940-02-01");
    expect(parseUkDate("1/2/40")).toBe("1940-02-01");
    expect(parseUkDate("2025-09-01")).toBe("2025-09-01");
    expect(parseUkDate("")).toBeNull();
  });
  it("refuses a date that doesn't exist", () => {
    expect(parseUkDate("31/02/1950")).toBe("invalid");
    expect(parseUkDate("next week")).toBe("invalid");
  });
});

describe("parseFunder", () => {
  it("tells councils, self-funders and the NHS apart", () => {
    expect(parseFunder("Stockport Council")).toEqual({ type: "council", name: "Stockport Council" });
    expect(parseFunder("Self-funded")).toEqual({ type: "self", name: null });
    expect(parseFunder("NHS CHC")).toEqual({ type: "nhs", name: null });
    expect(parseFunder("Family trust")).toEqual({ type: "other", name: "Family trust" });
  });
});

describe("parseClientsCsv", () => {
  it("reads the template's columns, in any order, with quotes", () => {
    const csv =
      "﻿Region,Name,Date of birth,Funder,Medication support\r\n" +
      'North,"Smith, Jean",03/04/1938,Self,Yes\r\n' +
      "South,Ali Khan,,Manchester City Council,no\r\n";
    const { rows, problem } = parseClientsCsv(csv);
    expect(problem).toBeUndefined();
    expect(rows).toHaveLength(2);
    expect(rows[0].client).toMatchObject({ fullName: "Smith, Jean", dateOfBirth: "1938-04-03", region: "North", funderType: "self", medicationSupport: true });
    expect(rows[1].client).toMatchObject({ fullName: "Ali Khan", dateOfBirth: null, funderType: "council", funderName: "Manchester City Council", medicationSupport: false });
    expect(rows.every((r) => r.problems.length === 0)).toBe(true);
  });

  it("flags a row with no name or a bad date, and needs a Name column", () => {
    const { rows } = parseClientsCsv("Name,Date of birth\n,01/01/1950\nBob,99/99/1950\n");
    expect(rows[0].problems).toContain("No name");
    expect(rows[1].problems[0]).toMatch(/isn't a date/);
    expect(parseClientsCsv("Client ref,DOB\nA1,01/01/1950\n").problem).toMatch(/Name column/);
  });
});
