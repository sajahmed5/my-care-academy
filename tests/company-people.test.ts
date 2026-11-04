import { describe, expect, it } from "vitest";
import { parsePeople } from "@/lib/company-people";

function form(rows: [string, string, string?, string?][]): FormData {
  const f = new FormData();
  for (const [name, email, role = "org_admin", access = "email"] of rows) {
    f.append("personName", name);
    f.append("personEmail", email);
    f.append("personRole", role);
    f.append("personAccess", access);
  }
  return f;
}

describe("the people on the set-up form", () => {
  it("reads each row in order, lower-cases emails and skips blank rows", () => {
    const { people, error } = parsePeople(
      form([
        ["Priya Shah", "Priya@Sunrise.example"],
        ["", ""],
        ["Tom Reid", "tom@sunrise.example", "org_office", "password"],
      ]),
    );
    expect(error).toBeUndefined();
    expect(people).toEqual([
      { name: "Priya Shah", email: "priya@sunrise.example", role: "org_admin", access: "email" },
      { name: "Tom Reid", email: "tom@sunrise.example", role: "org_office", access: "password" },
    ]);
  });

  it("only knows two roles and two ways in: anything else is a manager by email", () => {
    const { people } = parsePeople(form([["Eve", "eve@x.example", "platform_admin", "sms"]]));
    expect(people[0]).toMatchObject({ role: "org_admin", access: "email" });
  });

  it("refuses a bad address, a repeat, an empty list and more than ten", () => {
    expect(parsePeople(form([["Priya", "not-an-email"]])).error).toMatch(/Check the email address for Priya/);
    expect(parsePeople(form([["A", "a@x.example"], ["B", "A@x.example"]])).error).toMatch(/twice/);
    expect(parsePeople(form([["", ""]])).error).toMatch(/at least one/);
    const eleven = Array.from({ length: 11 }, (_, i) => [`P${i}`, `p${i}@x.example`] as [string, string]);
    expect(parsePeople(form(eleven)).error).toMatch(/10 people at most/);
  });
});
