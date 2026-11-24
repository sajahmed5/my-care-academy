import { describe, expect, it } from "vitest";
import {
  checkHumanAnswer,
  MAX_AGE_MS,
  newHumanChallenge,
  readAnswer,
} from "../lib/human-check";

const secret = "test-secret";
const asked = new Date("2026-11-24T10:00:00Z");
const later = (ms: number) => new Date(asked.getTime() + ms);
// Always "four plus three".
const fixed = (() => {
  const seq = [3, 2];
  return () => seq.shift()!;
});

describe("the contact form's are-you-a-person question", () => {
  it("asks a sum in words and keeps the answer out of the page", () => {
    const c = newHumanChallenge(secret, asked, fixed());
    expect(c.question).toBe("What is four plus three?");
    // Only the time, a nonce and a signature: nothing that spells out 7.
    expect(c.token.split(".")).toHaveLength(3);
    expect(c.token.split(".")[0]).toBe(String(asked.getTime()));
  });

  it("passes the right answer, as digits or a word", () => {
    const c = newHumanChallenge(secret, asked, fixed());
    expect(checkHumanAnswer(secret, c.token, "7", later(10_000))).toBe("ok");
    expect(checkHumanAnswer(secret, c.token, " Seven ", later(10_000))).toBe("ok");
  });

  it("refuses a wrong or empty answer", () => {
    const c = newHumanChallenge(secret, asked, fixed());
    expect(checkHumanAnswer(secret, c.token, "8", later(10_000))).toBe("wrong");
    expect(checkHumanAnswer(secret, c.token, "", later(10_000))).toBe("wrong");
  });

  it("catches a form sent faster than a person could fill it", () => {
    const c = newHumanChallenge(secret, asked, fixed());
    expect(checkHumanAnswer(secret, c.token, "7", later(1_000))).toBe("too-fast");
  });

  it("lets a question go stale", () => {
    const c = newHumanChallenge(secret, asked, fixed());
    expect(checkHumanAnswer(secret, c.token, "7", later(MAX_AGE_MS + 1))).toBe("expired");
  });

  it("refuses a token signed with another key or tampered with", () => {
    const c = newHumanChallenge("other", asked, fixed());
    expect(checkHumanAnswer(secret, c.token, "7", later(10_000))).toBe("wrong");
    expect(checkHumanAnswer(secret, "nonsense", "7", later(10_000))).toBe("invalid");
    const [, nonce, sig] = newHumanChallenge(secret, asked, fixed()).token.split(".");
    const backdated = `${asked.getTime() - 60_000}.${nonce}.${sig}`;
    expect(checkHumanAnswer(secret, backdated, "7", later(10_000))).toBe("wrong");
  });

  it("reads answers", () => {
    expect(readAnswer("12")).toBe(12);
    expect(readAnswer("eighteen")).toBe(18);
    expect(readAnswer("seven-ish")).toBeNull();
  });
});
