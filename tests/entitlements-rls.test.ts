import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  cleanup,
  createOrg,
  createUser,
  setFeature,
  signIn,
} from "./helpers";

/**
 * How entitlement resolves, through real signed-in clients: an override row
 * beats the package, and with neither the answer is no.
 *
 * The case that matters most is the second — a package that includes a
 * feature, switched off for one organisation. tierFlags() could never express
 * that; the old switches on the org form could, but left no record of why.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `ent-${l}-${RUN}@example.test`;

const userIds: string[] = [];
const orgIds: string[] = [];

let tierOnly: SupabaseClient; // Growth, no overrides
let overriddenOff: SupabaseClient; // Growth, forms forced off
let overriddenOn: SupabaseClient; // Starter, Care Certificate forced on

async function orgAdminOn(
  tier: string,
  label: string,
): Promise<{ client: SupabaseClient; orgId: string }> {
  const orgId = await createOrg(`Ent ${label} ${RUN}`);
  orgIds.push(orgId);
  await adminClient()
    .from("organisations")
    .update({ package_tier: tier })
    .eq("id", orgId);
  const userId = await createUser({
    email: email(label),
    password: PW,
    role: "org_admin",
    organisationId: orgId,
  });
  userIds.push(userId);
  return { client: await signIn(email(label), PW), orgId };
}

async function has(client: SupabaseClient, feature: string): Promise<boolean> {
  const { data, error } = await client.rpc("has_feature", { p_feature: feature });
  if (error) throw error;
  return data as boolean;
}

beforeAll(async () => {
  tierOnly = (await orgAdminOn("core_recruitment", "tier")).client;

  const off = await orgAdminOn("core_recruitment", "off");
  await setFeature(off.orgId, "forms.builder", false);
  overriddenOff = off.client;

  const on = await orgAdminOn("core", "on");
  await setFeature(on.orgId, "training.observations", true);
  overriddenOn = on.client;
}, 60_000);

afterAll(async () => {
  await cleanup(userIds, orgIds);
});

describe("has_feature", () => {
  it("follows the package when there is no override", async () => {
    expect(await has(tierOnly, "forms.builder")).toBe(true);
    expect(await has(tierOnly, "platform.white_label")).toBe(false);
  });

  it("lets an override switch off something the package includes", async () => {
    expect(await has(overriddenOff, "forms.builder")).toBe(false);
  });

  it("lets an override switch on something the package does not include", async () => {
    expect(await has(overriddenOn, "training.observations")).toBe(true);
  });

  it("says no when neither the package nor an override says yes", async () => {
    expect(await has(overriddenOn, "forms.builder")).toBe(false);
  });

  it("always includes the training", async () => {
    for (const client of [tierOnly, overriddenOff, overriddenOn]) {
      expect(await has(client, "training.courses")).toBe(true);
    }
  });

  it("says no to a feature that does not exist", async () => {
    expect(await has(tierOnly, "nonsense.feature")).toBe(false);
  });
});

describe("my_entitlements", () => {
  it("returns every enabled key in one call", async () => {
    const { data, error } = await overriddenOn.rpc("my_entitlements");
    expect(error).toBeNull();
    expect((data as string[]).sort()).toEqual(
      [
        "training.courses",
        "training.matrix",
        "training.observations",
        "training.programmes",
      ].sort(),
    );
  });
});

// The old platform-admin switches and the Stripe webhook still write the
// boolean columns until their replacements ship. A write to a switch must
// still change what the organisation can reach — otherwise it saves, audits,
// and silently does nothing.
describe("the legacy add-on switches", () => {
  it("still take effect when written", async () => {
    const { client, orgId } = await orgAdminOn("core", "legacy");
    expect(await has(client, "forms.builder")).toBe(false);

    await adminClient()
      .from("organisations")
      .update({ forms_enabled: true })
      .eq("id", orgId);
    expect(await has(client, "forms.builder")).toBe(true);

    await adminClient()
      .from("organisations")
      .update({ forms_enabled: false })
      .eq("id", orgId);
    expect(await has(client, "forms.builder")).toBe(false);
  });

  it("leave a package's features alone when a write does not name them", async () => {
    const { client, orgId } = await orgAdminOn("core", "rename");
    await adminClient()
      .from("organisations")
      .update({ name: `Renamed ${RUN}`, package_tier: "core_recruitment" })
      .eq("id", orgId);
    // No switch was written, so the package decides.
    expect(await has(client, "forms.builder")).toBe(true);
  });
});

describe("org_has_feature", () => {
  // The service-role routes (the candidate-documents ZIP, form submission)
  // gate on exactly this call, because RLS is not in the way there.
  it("answers for a named organisation when asked by the service role", async () => {
    const { orgId } = await orgAdminOn("core_recruitment", "svc");
    const ask = async (feature: string) => {
      const { data, error } = await adminClient().rpc("org_has_feature", {
        p_org: orgId,
        p_feature: feature,
      });
      if (error) throw error;
      return data as boolean;
    };
    expect(await ask("recruitment.tracker")).toBe(true);

    await setFeature(orgId, "recruitment.tracker", false);
    expect(await ask("recruitment.tracker")).toBe(false);
  });

  // It takes an arbitrary organisation id, so an org admin must not be able to
  // call it to find out what another organisation has bought.
  it("cannot be called by a signed-in user", async () => {
    const { error } = await tierOnly.rpc("org_has_feature", {
      p_org: orgIds[0],
      p_feature: "forms.builder",
    });
    expect(error).not.toBeNull();
  });
});
