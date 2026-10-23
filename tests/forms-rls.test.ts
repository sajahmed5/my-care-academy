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
const email = (l: string) => `forms-${l}-${RUN}@example.test`;

let orgOn: string; // forms_enabled = true
let orgOff: string; // forms_enabled = false

const userIds: string[] = [];
const orgIds: string[] = [];

let adminOn: SupabaseClient;
let adminOff: SupabaseClient;

beforeAll(async () => {
  const admin = adminClient();
  orgOn = await createOrg(`Forms On ${RUN}`);
  orgOff = await createOrg(`Forms Off ${RUN}`);
  orgIds.push(orgOn, orgOff);

  // Entitlement now comes from the feature catalogue. Everything below this
  // line is unchanged from when it read organisations.forms_enabled — which is
  // the point: the gate behaves identically.
  await setFeature(orgOn, "forms.builder", true);
  await setFeature(orgOff, "forms.builder", false);

  const a1 = await createUser({
    email: email("on"),
    password: PW,
    role: "org_admin",
    organisationId: orgOn,
  });
  const a2 = await createUser({
    email: email("off"),
    password: PW,
    role: "org_admin",
    organisationId: orgOff,
  });
  userIds.push(a1, a2);

  // Seed one form in each org via the service role (bypasses RLS).
  await admin.from("forms").insert([
    { organisation_id: orgOn, title: `On form ${RUN}` },
    { organisation_id: orgOff, title: `Off form ${RUN}` },
  ]);

  adminOn = await signIn(email("on"), PW);
  adminOff = await signIn(email("off"), PW);
}, 60_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("forms").delete().in("organisation_id", [orgOn, orgOff]);
  await cleanup(userIds, orgIds);
});

describe("forms feature-gating via RLS", () => {
  it("an entitled org can read its forms", async () => {
    const { data } = await adminOn.from("forms").select("id, title");
    expect(data?.length).toBe(1);
  });

  it("a non-entitled org cannot read forms even though one exists", async () => {
    const { data } = await adminOff.from("forms").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("a non-entitled org cannot create a form", async () => {
    const { error } = await adminOff
      .from("forms")
      .insert({ organisation_id: orgOff, title: "blocked" });
    expect(error).not.toBeNull();
  });

  it("an entitled org can create a form", async () => {
    const { error } = await adminOn
      .from("forms")
      .insert({ organisation_id: orgOn, title: "allowed" });
    expect(error).toBeNull();
  });

  it("does not leak another org's forms", async () => {
    const { data } = await adminOn.from("forms").select("organisation_id");
    expect(data?.every((f) => f.organisation_id === orgOn)).toBe(true);
  });
});
