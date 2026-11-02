import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, cleanup, createOrg } from "./helpers";
import { monthCharge } from "@/lib/ai";

/**
 * The monthly AI spend must count every request, past the 1,000 rows one
 * read returns: the £ limit is only as good as this sum.
 */
describe("monthCharge", () => {
  let orgId = "";
  beforeAll(async () => {
    orgId = await createOrg(`AI cap ${Date.now()}`);
    const admin = adminClient();
    const rows = Array.from({ length: 1_100 }, () => ({
      organisation_id: orgId,
      feature: "offer_letter",
      model: "test",
      cost_usd: 0.001,
      cost_gbp: 0.001,
      charge_gbp: 0.01,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("ai_usage").insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
  }, 60_000);
  afterAll(async () => cleanup([], [orgId]));

  it("adds up more than a thousand requests", async () => {
    const { chargedGbp, requests } = await monthCharge(adminClient(), orgId);
    expect(requests).toBe(1_100);
    expect(chargedGbp).toBeCloseTo(11, 2);
  }, 60_000);
});
