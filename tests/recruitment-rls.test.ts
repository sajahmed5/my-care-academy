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

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `rec-${l}-${RUN}@example.test`;

let orgOn: string;
let orgOff: string;
const userIds: string[] = [];
const orgIds: string[] = [];
let adminOn: SupabaseClient;
let adminOff: SupabaseClient;

beforeAll(async () => {
  const admin = adminClient();
  orgOn = await createOrg(`Rec On ${RUN}`);
  orgOff = await createOrg(`Rec Off ${RUN}`);
  orgIds.push(orgOn, orgOff);
  // Entitlement now comes from the feature catalogue; the assertions below are
  // unchanged, which is how we know the gate behaves identically.
  await setFeature(orgOn, "recruitment.tracker", true);
  await setFeature(orgOff, "recruitment.tracker", false);

  const a1 = await createUser({ email: email("on"), password: PW, role: "org_admin", organisationId: orgOn });
  const a2 = await createUser({ email: email("off"), password: PW, role: "org_admin", organisationId: orgOff });
  userIds.push(a1, a2);

  await admin.from("candidates").insert([
    { organisation_id: orgOn, full_name: `On Cand ${RUN}` },
    { organisation_id: orgOff, full_name: `Off Cand ${RUN}` },
  ]);

  adminOn = await signIn(email("on"), PW);
  adminOff = await signIn(email("off"), PW);
}, 60_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("candidates").delete().in("organisation_id", [orgOn, orgOff]);
  await cleanup(userIds, orgIds);
});

describe("recruitment feature-gating via RLS", () => {
  it("an entitled org reads its candidates", async () => {
    const { data } = await adminOn.from("candidates").select("id");
    expect(data?.length).toBe(1);
  });

  it("a non-entitled org sees no candidates even though one exists", async () => {
    const { data } = await adminOff.from("candidates").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("a non-entitled org cannot add a candidate", async () => {
    const { error } = await adminOff
      .from("candidates")
      .insert({ organisation_id: orgOff, full_name: "blocked" });
    expect(error).not.toBeNull();
  });

  it("does not leak another org's candidates", async () => {
    const { data } = await adminOn.from("candidates").select("organisation_id");
    expect(data?.every((c) => c.organisation_id === orgOn)).toBe(true);
  });
});
