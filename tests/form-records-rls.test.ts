import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, cleanup, createOrg, createUser, setFeature, signIn } from "./helpers";

/**
 * Client and company forms (FORMS.md): the office fills them in, as itself,
 * about its own clients. A carer cannot write one, nor can a company without
 * forms in its package, nor can anyone about another company's client.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `form-records-${l}-${RUN}@example.test`;

let orgA: string;
let orgB: string;
let orgOff: string;
let clientA: string;
let clientB: string;
let clientOff: string;
let templateId: string;
const userIds: string[] = [];
const orgIds: string[] = [];
let office: SupabaseClient;
let carer: SupabaseClient;
let officeOff: SupabaseClient;
let officeId: string;
let carerId: string;
let officeOffId: string;

beforeAll(async () => {
  const admin = adminClient();
  orgA = await createOrg(`Records A ${RUN}`);
  orgB = await createOrg(`Records B ${RUN}`);
  orgOff = await createOrg(`Records Off ${RUN}`);
  orgIds.push(orgA, orgB, orgOff);
  for (const o of [orgA, orgB]) {
    await setFeature(o, "forms.builder", true);
    await setFeature(o, "clients.list", true);
  }
  await setFeature(orgOff, "forms.builder", false);
  await setFeature(orgOff, "clients.list", true);

  officeId = await createUser({ email: email("office"), password: PW, role: "org_office", organisationId: orgA });
  carerId = await createUser({ email: email("carer"), password: PW, role: "learner", organisationId: orgA });
  officeOffId = await createUser({ email: email("off"), password: PW, role: "org_office", organisationId: orgOff });
  userIds.push(officeId, carerId, officeOffId);

  const { data: clients } = await admin
    .from("clients")
    .insert([
      { organisation_id: orgA, full_name: `Client A ${RUN}` },
      { organisation_id: orgB, full_name: `Client B ${RUN}` },
      { organisation_id: orgOff, full_name: `Client Off ${RUN}` },
    ])
    .select("id, organisation_id");
  clientA = clients!.find((c) => c.organisation_id === orgA)!.id as string;
  clientB = clients!.find((c) => c.organisation_id === orgB)!.id as string;
  clientOff = clients!.find((c) => c.organisation_id === orgOff)!.id as string;

  const { data: t } = await admin
    .from("form_templates")
    .insert({ code: `TEST-RECORDS-${RUN}`, title: "Test client form", category: "care", audience: "client", status: "draft" })
    .select("id")
    .single();
  templateId = t!.id as string;

  office = await signIn(email("office"), PW);
  carer = await signIn(email("carer"), PW);
  officeOff = await signIn(email("off"), PW);
}, 60_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("form_responses").delete().eq("template_id", templateId);
  await admin.from("form_templates").delete().eq("id", templateId);
  await admin.from("clients").delete().in("id", [clientA, clientB, clientOff]);
  await cleanup(userIds, orgIds);
});

const record = (orgId: string, userId: string, clientId: string | null, subject = "client") => ({
  organisation_id: orgId,
  template_id: templateId,
  template_version: 1,
  user_id: userId,
  subject,
  client_id: clientId,
  answers: {},
});

describe("client and company form records", () => {
  it("the office can record a form about its own client", async () => {
    const { error } = await office.from("form_responses").insert(record(orgA, officeId, clientA));
    expect(error).toBeNull();
  });

  it("the office can record a company form", async () => {
    const { error } = await office.from("form_responses").insert(record(orgA, officeId, null, "company"));
    expect(error).toBeNull();
  });

  it("not about another company's client", async () => {
    const { error } = await office.from("form_responses").insert(record(orgA, officeId, clientB));
    expect(error).not.toBeNull();
  });

  it("a carer cannot record a client form", async () => {
    const { error } = await carer.from("form_responses").insert(record(orgA, carerId, clientA));
    expect(error).not.toBeNull();
  });

  it("not without forms in the package", async () => {
    const { error } = await officeOff.from("form_responses").insert(record(orgOff, officeOffId, clientOff));
    expect(error).not.toBeNull();
  });

  it("not in someone else's name", async () => {
    const { error } = await office.from("form_responses").insert(record(orgA, carerId, clientA));
    expect(error).not.toBeNull();
  });

  it("a carer response still needs an ask behind it", async () => {
    const { error } = await carer.from("form_responses").insert(record(orgA, carerId, null, "carer"));
    expect(error).not.toBeNull();
  });

  it("the office reads its own records and nobody else's", async () => {
    const { data } = await office.from("form_responses").select("organisation_id").eq("template_id", templateId);
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every((r) => r.organisation_id === orgA)).toBe(true);
  });
});
