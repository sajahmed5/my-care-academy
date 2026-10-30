import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, cleanup, createOrg, createUser, setFeature, signIn } from "./helpers";

/**
 * Who reads service audits (SERVICE-AUDITS.md): managers and office, in
 * their own organisation, with the package. Never a carer, and never
 * another company's.
 */
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `svc-${l}-${RUN}@example.test`;

let orgId: string;
let otherOrgId: string;
const userIds: string[] = [];
let office: SupabaseClient;
let carer: SupabaseClient;
let outsider: SupabaseClient;

beforeAll(async () => {
  const admin = adminClient();
  orgId = await createOrg(`Service audits ${RUN}`);
  otherOrgId = await createOrg(`Service audits other ${RUN}`);
  await setFeature(orgId, "quality.audits", true);
  await setFeature(otherOrgId, "quality.audits", true);
  userIds.push(
    await createUser({ email: email("office"), password: PW, role: "org_office", organisationId: orgId }),
    await createUser({ email: email("carer"), password: PW, role: "learner", organisationId: orgId }),
    await createUser({ email: email("outsider"), password: PW, role: "org_admin", organisationId: otherOrgId }),
  );
  [office, carer, outsider] = await Promise.all([signIn(email("office"), PW), signIn(email("carer"), PW), signIn(email("outsider"), PW)]);
  await admin.from("service_audit_forms").insert({
    organisation_id: orgId,
    key: "own_test",
    label: "Test",
    scope: "service",
    questions: [{ id: "a", label: "A", type: "yes_no" }],
    due_every: 3,
    due_unit: "months",
  });
  await admin.from("audits").insert({ organisation_id: orgId, kind: "own_test", held_on: "2026-10-01", items: [], score: 50, review_status: "waiting" });
  await admin.from("client_qas").insert({ organisation_id: orgId, client_name: "A client", held_on: "2026-10-01", method: "phone", completed: false, not_done_reason: "No answer" });
}, 60_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("audits").delete().in("organisation_id", [orgId, otherOrgId]);
  await admin.from("client_qas").delete().in("organisation_id", [orgId, otherOrgId]);
  await admin.from("service_audit_forms").delete().in("organisation_id", [orgId, otherOrgId]);
  await admin.from("service_audit_settings").delete().in("organisation_id", [orgId, otherOrgId]);
  await cleanup(userIds, [orgId, otherOrgId]);
});

describe("service audits", () => {
  it("are read by the office, in their own organisation", async () => {
    const { data: forms } = await office.from("service_audit_forms").select("key");
    expect(forms?.map((f) => f.key)).toEqual(["own_test"]);
    const { data: audits } = await office.from("audits").select("id");
    expect(audits).toHaveLength(1);
    const { data: qas } = await office.from("client_qas").select("id");
    expect(qas).toHaveLength(1);
  });

  it("are never read by a carer", async () => {
    expect((await carer.from("service_audit_forms").select("key")).data).toEqual([]);
    expect((await carer.from("audits").select("id")).data).toEqual([]);
    expect((await carer.from("client_qas").select("id")).data).toEqual([]);
    expect((await carer.from("service_audit_settings").select("review_below")).data).toEqual([]);
  });

  it("are never read by another company", async () => {
    expect((await outsider.from("service_audit_forms").select("key")).data).toEqual([]);
    expect((await outsider.from("audits").select("id")).data).toEqual([]);
    expect((await outsider.from("client_qas").select("id")).data).toEqual([]);
  });

  it("won't take a QA that was done without its ratings", async () => {
    const { error } = await office
      .from("client_qas")
      .insert({ organisation_id: orgId, client_name: "A client", held_on: "2026-10-02", method: "visit", completed: true, with_whom: "client", safe: 5 });
    expect(error).not.toBeNull();
  });

  it("can't be written into another company's", async () => {
    const { error } = await outsider
      .from("service_audit_settings")
      .insert({ organisation_id: orgId, review_below: 10 });
    expect(error).not.toBeNull();
  });

  it("are hidden without the package", async () => {
    await setFeature(orgId, "quality.audits", false);
    const { data } = await office.from("service_audit_forms").select("key");
    await setFeature(orgId, "quality.audits", true);
    expect(data).toEqual([]);
  });

  it("can't be deleted through the Data API by the office", async () => {
    // audits keep their record: delete is not granted to authenticated.
    const { error } = await office.from("audits").delete().eq("organisation_id", orgId);
    expect(error).not.toBeNull();
    const { error: qaError } = await office.from("client_qas").delete().eq("organisation_id", orgId);
    expect(qaError).not.toBeNull();
  });
});
