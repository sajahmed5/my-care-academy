import { describe, expect, it } from "vitest";
import { adminClient } from "./helpers";
import { LIST_PRICE_GBP } from "../lib/pricing";
import type { PackageTier } from "../lib/organisations";
import { loadPlatformAnalytics } from "../lib/platform-analytics";

/**
 * The analytics page resolves who has which feature in TypeScript, because it
 * needs every organisation at once. has_feature() resolves the same thing in
 * SQL for the gates. Two implementations of one rule drift, so this holds them
 * to each other against whatever is in the database right now.
 */
describe("platform analytics", () => {
  it("counts feature adoption exactly as the gates resolve it", async () => {
    const admin = adminClient();
    const analytics = await loadPlatformAnalytics(admin);
    const { data: orgs } = await admin.from("organisations").select("id");

    for (const feature of analytics.adoption) {
      let expected = 0;
      for (const o of orgs ?? []) {
        const { data } = await admin.rpc("org_has_feature", {
          p_org: o.id,
          p_feature: feature.key,
        });
        if (data === true) expected += 1;
      }
      expect(feature.organisations, feature.key).toBe(expected);
    }
  }, 60_000);

  it("counts MRR at list price for every active organisation", async () => {
    const admin = adminClient();
    const analytics = await loadPlatformAnalytics(admin);
    const { data: orgs } = await admin.from("organisations").select("package_tier, status");
    let total = 0;
    for (const o of orgs ?? []) {
      if (o.status === "suspended") continue;
      total += LIST_PRICE_GBP[(o.package_tier ?? "core") as PackageTier] ?? 0;
    }
    expect(analytics.mrr).toBe(total);
  }, 60_000);
});
