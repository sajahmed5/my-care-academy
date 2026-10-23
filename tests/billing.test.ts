import { describe, it, expect } from "vitest";
import { priceIdForTier, tierForPriceId } from "../lib/billing";

// What each package includes is no longer decided here — see
// tests/entitlements (the seeded matrix) and tests/billing-apply (the webhook).

describe("price ↔ tier mapping", () => {
  it("round-trips through env", () => {
    process.env.STRIPE_PRICE_FULL = "price_full_test";
    process.env.STRIPE_PRICE_CORE = "price_core_test";
    expect(priceIdForTier("full")).toBe("price_full_test");
    expect(tierForPriceId("price_full_test")).toBe("full");
    expect(tierForPriceId("price_core_test")).toBe("core");
    expect(tierForPriceId("price_unknown")).toBeNull();
  });
});
