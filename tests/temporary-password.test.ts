import { describe, expect, it } from "vitest";
import { generateTemporaryPassword } from "@/lib/temporary-password";
import { onTemporaryPassword } from "@/lib/temporary-password-claim";

describe("temporary passwords", () => {
  it("are three easy-to-read groups, with no 0/O or 1/l/I, and differ each time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      expect(p).toMatch(/^[A-Z][a-z]{2}[2-9]-[A-Z][a-z]{2}[2-9]-[A-Z][a-z]{2}[2-9]$/);
      expect(p).not.toMatch(/[0O1lIio]/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });

  it("are read from the token's app_metadata, and nothing else counts", () => {
    expect(onTemporaryPassword({ app_metadata: { password_temporary: true } })).toBe(true);
    expect(onTemporaryPassword({ app_metadata: { password_temporary: false } })).toBe(false);
    expect(onTemporaryPassword({ user_metadata: { password_temporary: true } })).toBe(false);
    expect(onTemporaryPassword({ app_metadata: { password_temporary: "true" } })).toBe(false);
    expect(onTemporaryPassword(null)).toBe(false);
  });
});
