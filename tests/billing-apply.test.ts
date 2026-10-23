import { afterAll, describe, it, expect } from "vitest";
import { adminClient, cleanup, createOrg, setFeature } from "./helpers";
import { applySubscriptionToOrg } from "../lib/billing";

const orgIds: string[] = [];
const RUN = `${Date.now()}`;

afterAll(async () => {
  await cleanup([], orgIds);
});

async function has(org: string, feature: string): Promise<boolean> {
  const { data, error } = await adminClient().rpc("org_has_feature", {
    p_org: org,
    p_feature: feature,
  });
  if (error) throw error;
  return data === true;
}

describe("applySubscriptionToOrg (what the webhook does)", () => {
  it("a Full subscription sets the package, and the package brings the add-ons", async () => {
    const admin = adminClient();
    const org = await createOrg(`Bill Full ${RUN}`);
    orgIds.push(org);

    await applySubscriptionToOrg(admin, {
      organisationId: org,
      tier: "full",
      customerId: "cus_test",
      subscriptionId: "sub_test",
      status: "active",
    });

    const { data } = await admin
      .from("organisations")
      .select("package_tier, subscription_status")
      .eq("id", org)
      .single();
    expect(data).toMatchObject({ package_tier: "full", subscription_status: "active" });
    expect(await has(org, "forms.builder")).toBe(true);
    expect(await has(org, "recruitment.tracker")).toBe(true);
  });

  it("cancelling downgrades to Essentials and the add-ons go with it", async () => {
    const admin = adminClient();
    const org = await createOrg(`Bill Cancel ${RUN}`);
    orgIds.push(org);

    await applySubscriptionToOrg(admin, { organisationId: org, tier: "full" });
    await applySubscriptionToOrg(admin, {
      organisationId: org,
      tier: "core",
      subscriptionId: null,
      status: "canceled",
    });

    const { data } = await admin
      .from("organisations")
      .select("package_tier")
      .eq("id", org)
      .single();
    expect(data?.package_tier).toBe("core");
    expect(await has(org, "forms.builder")).toBe(false);
    expect(await has(org, "recruitment.tracker")).toBe(false);
  });

  // The old flag writes would have overwritten this. A platform admin's
  // exception now survives whatever billing does.
  it("leaves a platform admin's exception alone", async () => {
    const admin = adminClient();
    const org = await createOrg(`Bill Exception ${RUN}`);
    orgIds.push(org);
    await setFeature(org, "forms.builder", true);

    await applySubscriptionToOrg(admin, { organisationId: org, tier: "core", status: "active" });
    expect(await has(org, "forms.builder")).toBe(true);
  });
});
