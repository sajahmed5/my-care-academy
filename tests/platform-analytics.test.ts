import { describe, expect, it } from "vitest";
import { adminClient } from "./helpers";
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

  it("sums agreed amounts of active organisations, and counts the gaps", async () => {
    const admin = adminClient();
    const analytics = await loadPlatformAnalytics(admin);
    const [{ data: orgs }, { data: amounts }] = await Promise.all([
      admin.from("organisations").select("id, status"),
      admin.from("organisation_subscriptions").select("organisation_id, monthly_amount_pence"),
    ]);
    const pence = new Map((amounts ?? []).map((a) => [a.organisation_id, a.monthly_amount_pence]));

    let total = 0;
    let missing = 0;
    for (const o of orgs ?? []) {
      if (o.status === "suspended") continue;
      const p = pence.get(o.id);
      if (p == null) missing += 1;
      else total += p;
    }
    expect(analytics.mrr).toBe(total / 100);
    expect(analytics.orgsWithoutAmount).toBe(missing);
  }, 60_000);
});
