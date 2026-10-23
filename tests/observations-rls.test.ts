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

// Care Certificate observations are a paid add-on gated by four RLS policies,
// and until now had no suite of their own — the gate was only ever exercised
// through the UI. Same shape as forms-rls and recruitment-rls.

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `obs-${l}-${RUN}@example.test`;

let orgOn: string;
let orgOff: string;
let learnerOn: string;
let learnerOff: string;

const userIds: string[] = [];
const orgIds: string[] = [];

let adminOn: SupabaseClient;
let adminOff: SupabaseClient;
let learnerOnClient: SupabaseClient;

beforeAll(async () => {
  const admin = adminClient();
  orgOn = await createOrg(`Obs On ${RUN}`);
  orgOff = await createOrg(`Obs Off ${RUN}`);
  orgIds.push(orgOn, orgOff);

  await setFeature(orgOn, "training.observations", true);
  await setFeature(orgOff, "training.observations", false);

  const a1 = await createUser({ email: email("admin-on"), password: PW, role: "org_admin", organisationId: orgOn });
  const a2 = await createUser({ email: email("admin-off"), password: PW, role: "org_admin", organisationId: orgOff });
  learnerOn = await createUser({ email: email("learner-on"), password: PW, role: "learner", organisationId: orgOn });
  learnerOff = await createUser({ email: email("learner-off"), password: PW, role: "learner", organisationId: orgOff });
  userIds.push(a1, a2, learnerOn, learnerOff);

  // One observation in each org, seeded past RLS.
  await admin.from("care_cert_observations").insert([
    { organisation_id: orgOn, user_id: learnerOn, standard_no: 1, status: "competent" },
    { organisation_id: orgOff, user_id: learnerOff, standard_no: 1, status: "competent" },
  ]);

  adminOn = await signIn(email("admin-on"), PW);
  adminOff = await signIn(email("admin-off"), PW);
  learnerOnClient = await signIn(email("learner-on"), PW);
}, 60_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("care_cert_observations").delete().in("organisation_id", [orgOn, orgOff]);
  await cleanup(userIds, orgIds);
});

describe("care_cert_observations gating", () => {
  it("an entitled org admin reads their observations", async () => {
    const { data, error } = await adminOn.from("care_cert_observations").select("organisation_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].organisation_id).toBe(orgOn);
  });

  it("a non-entitled org admin sees none, though a row exists", async () => {
    const { data, error } = await adminOff.from("care_cert_observations").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("a non-entitled org admin cannot record one", async () => {
    const { error } = await adminOff.from("care_cert_observations").insert({
      organisation_id: orgOff,
      user_id: learnerOff,
      standard_no: 2,
    });
    expect(error).not.toBeNull();
  });

  it("does not leak across organisations", async () => {
    const { data } = await adminOn
      .from("care_cert_observations")
      .select("organisation_id")
      .eq("organisation_id", orgOff);
    expect(data ?? []).toEqual([]);
  });

  it("a learner reads their own record", async () => {
    const { data, error } = await learnerOnClient
      .from("care_cert_observations")
      .select("user_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].user_id).toBe(learnerOn);
  });
});
