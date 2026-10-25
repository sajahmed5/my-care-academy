import { describe, expect, it } from "vitest";
import { buildDueRows } from "../lib/due-view";

const now = new Date("2026-10-25T12:00:00Z");
const people = [
  { id: "a", name: "Amy" },
  { id: "b", name: "Ben" },
  { id: "c", name: "Cat" },
  { id: "d", name: "Dan" },
  { id: "e", name: "Eve" },
];

describe("who's due", () => {
  it("puts the overdue first, then the close, then those never seen, then the rest", () => {
    const rows = buildDueRows(
      people,
      [
        { userId: "a", heldOn: "2026-01-01", nextDue: "2027-06-01" },
        { userId: "b", heldOn: "2026-06-01", nextDue: "2026-09-01" },
        { userId: "c", heldOn: "2026-08-01", nextDue: "2026-11-10" },
        { userId: "e", heldOn: "2026-07-01", nextDue: null },
      ],
      now,
    );
    expect(rows.map((r) => [r.person.name, r.status])).toEqual([
      ["Ben", "overdue"],
      ["Cat", "due_soon"],
      ["Dan", "never"],
      ["Eve", "none"],
      ["Amy", "scheduled"],
    ]);
  });
  it("takes the latest supervision's date, since it supersedes", () => {
    const [row] = buildDueRows(
      [people[0]],
      [
        { userId: "a", heldOn: "2026-03-01", nextDue: "2026-06-01" },
        { userId: "a", heldOn: "2026-09-01", nextDue: "2026-12-01" },
      ],
      now,
    );
    expect(row).toMatchObject({ last: "2026-09-01", next: "2026-12-01", status: "scheduled" });
  });
  it("for spot checks, takes the soonest date across each area's latest check", () => {
    const [row] = buildDueRows(
      [people[0]],
      [
        { userId: "a", heldOn: "2026-09-01", nextDue: "2027-03-01", area: "moving_handling" },
        { userId: "a", heldOn: "2026-05-01", nextDue: "2026-08-01", area: "medication" },
        { userId: "a", heldOn: "2026-02-01", nextDue: "2026-05-01", area: "moving_handling" },
      ],
      now,
    );
    expect(row).toMatchObject({ next: "2026-08-01", status: "overdue" });
  });
});
