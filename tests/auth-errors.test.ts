import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "../lib/auth-errors";

describe("sign-in errors are said in a carer's words", () => {
  it("turns the commonest failure into something actionable", () => {
    const msg = friendlyAuthError("Invalid login credentials");
    expect(msg).toContain("don't match");
    expect(msg).toContain("Forgot your password?");
  });

  it("tells someone who never finished setup where their link is", () => {
    expect(friendlyAuthError("Email not confirmed")).toContain(
      "invitation email",
    );
  });

  it("reads GoTrue's throttle messages as one thing", () => {
    const wait = "Too many attempts just now. Please wait a minute and try again.";
    expect(
      friendlyAuthError(
        "For security purposes, you can only request this after 54 seconds",
      ),
    ).toBe(wait);
    expect(friendlyAuthError("Request rate limit reached")).toBe(wait);
  });

  it("names a dropped connection rather than blaming the password", () => {
    expect(friendlyAuthError("Failed to fetch")).toContain(
      "internet connection",
    );
  });

  it("matches whatever case GoTrue used", () => {
    expect(friendlyAuthError("INVALID LOGIN CREDENTIALS")).toBe(
      friendlyAuthError("invalid login credentials"),
    );
  });

  it("never passes an unrecognised message through to the screen", () => {
    const raw = "AuthApiError: unexpected_failure at /token";
    const shown = friendlyAuthError(raw);
    expect(shown).not.toContain("AuthApiError");
    expect(shown).toContain("contact My Care Academy");
  });

  it("falls back to the caller's wording when it has better context", () => {
    expect(friendlyAuthError("something odd", "Could not save that.")).toBe(
      "Could not save that.",
    );
  });

  it("handles a missing message", () => {
    expect(friendlyAuthError(null)).toContain("Something went wrong");
    expect(friendlyAuthError(undefined, "Fallback.")).toBe("Fallback.");
  });
});
