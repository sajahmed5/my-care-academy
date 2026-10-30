import { describe, expect, it } from "vitest";
import { readSetupToken, setupToken, SETUP_LINK_DAYS } from "../lib/account-setup";

const secret = "test-secret";
const id = "76dea758-99f8-42ae-851b-a613a3fc4263";
const now = new Date("2026-10-30T07:00:00Z");

describe("set up your account links", () => {
  it("name the person they were made for", () => {
    expect(readSetupToken(secret, setupToken(secret, id, now), now)).toBe(id);
  });
  it("still work a week later, when the next reminder goes", () => {
    const later = new Date(now.getTime() + 7 * 86_400_000);
    expect(readSetupToken(secret, setupToken(secret, id, now), later)).toBe(id);
  });
  it(`run out after ${SETUP_LINK_DAYS} days`, () => {
    const after = new Date(now.getTime() + (SETUP_LINK_DAYS * 86_400 + 1) * 1000);
    expect(readSetupToken(secret, setupToken(secret, id, now), after)).toBeNull();
  });
  it("can't be pointed at someone else, or made with another key", () => {
    const [, exp, mac] = setupToken(secret, id, now).split(".");
    expect(readSetupToken(secret, `00000000-0000-0000-0000-000000000000.${exp}.${mac}`, now)).toBeNull();
    expect(readSetupToken(secret, setupToken("other-key", id, now), now)).toBeNull();
  });
  it("can't have their date pushed back", () => {
    const [, exp, mac] = setupToken(secret, id, now).split(".");
    expect(readSetupToken(secret, `${id}.${Number(exp) + 86_400}.${mac}`, now)).toBeNull();
  });
  it("turn away anything mangled", () => {
    for (const t of ["", "x", `${id}.123`, `${id}.abc.def`, "a.b.c"]) expect(readSetupToken(secret, t, now)).toBeNull();
  });
});
