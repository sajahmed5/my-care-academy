import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, cleanup, createOrg, createUser, setFeature, signIn } from "./helpers";

// Bespoke reports (BESPOKE-REPORTS.md): a company's requests and reports are
// seen only by that company's console, only while its package has the
// feature; carers never see them, and nobody signed in writes them — every
// write is the service role, after the app's own checks.

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `bespoke-${l}-${RUN}@example.test`;

let orgA: string;
let orgB: string;
let requestA: string;
let reportA: string;
const userIds: string[] = [];
const orgIds: string[] = [];

let managerA: SupabaseClient;
let officeA: SupabaseClient;
let carerA: SupabaseClient;
let managerB: SupabaseClient;

beforeAll(async () => {
  const admin = adminClient();
  orgA = await createOrg(`Bespoke A ${RUN}`);
  orgB = await createOrg(`Bespoke B ${RUN}`);
  orgIds.push(orgA, orgB);
  await setFeature(orgA, "reports.bespoke", true);
  await setFeature(orgB, "reports.bespoke", true);

  userIds.push(
    await createUser({ email: email("manager-a"), password: PW, role: "org_admin", organisationId: orgA }),
    await createUser({ email: email("office-a"), password: PW, role: "org_office", organisationId: orgA }),
    await createUser({ email: email("carer-a"), password: PW, role: "learner", organisationId: orgA }),
    await createUser({ email: email("manager-b"), password: PW, role: "org_admin", organisationId: orgB }),
  );

  const { data: req, error } = await admin
    .from("report_requests")
    .insert({ organisation_id: orgA, title: `TEST ${RUN}`, question: "Test", audience: "cqc", frequency: "one_off", format: "pdf", due_on: "2030-01-15" })
    .select("id")
    .single();
  if (error) throw error;
  requestA = req.id as string;
  await admin.from("report_request_messages").insert({ request_id: requestA, organisation_id: orgA, body: "Test", from_us: true });
  const { data: rep, error: repError } = await admin
    .from("bespoke_reports")
    .insert({ organisation_id: orgA, request_id: requestA, title: `TEST ${RUN}` })
    .select("id")
    .single();
  if (repError) throw repError;
  reportA = rep.id as string;

  managerA = await signIn(email("manager-a"), PW);
  officeA = await signIn(email("office-a"), PW);
  carerA = await signIn(email("carer-a"), PW);
  managerB = await signIn(email("manager-b"), PW);
}, 60_000);

afterAll(async () => {
  await adminClient().from("report_requests").delete().eq("id", requestA);
  await cleanup(userIds, orgIds);
});

const count = async (c: SupabaseClient, table: string) => {
  const { data, error } = await c.from(table).select("id").eq("organisation_id", orgA);
  expect(error).toBeNull();
  return data?.length ?? 0;
};

describe("bespoke report rows", () => {
  it("are read by the company's own console", async () => {
    for (const c of [managerA, officeA]) {
      expect(await count(c, "report_requests")).toBe(1);
      expect(await count(c, "report_request_messages")).toBe(1);
      expect(await count(c, "bespoke_reports")).toBe(1);
    }
  });

  it("are never seen by another company or by a carer", async () => {
    for (const c of [managerB, carerA]) {
      expect(await count(c, "report_requests")).toBe(0);
      expect(await count(c, "report_request_messages")).toBe(0);
      expect(await count(c, "bespoke_reports")).toBe(0);
    }
  });

  it("can't be written by anyone signed in", async () => {
    const ins = await managerA
      .from("report_requests")
      .insert({ organisation_id: orgA, title: "x", question: "x", audience: "cqc", frequency: "one_off", format: "pdf", due_on: "2030-01-01" });
    expect(ins.error).not.toBeNull();
    const upd = await managerA.from("bespoke_reports").update({ managers_only: true }).eq("id", reportA).select("id");
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const msg = await managerA.from("report_request_messages").insert({ request_id: requestA, organisation_id: orgA, body: "x" });
    expect(msg.error).not.toBeNull();
  });

  it("go when the package no longer has bespoke reports", async () => {
    await setFeature(orgA, "reports.bespoke", false);
    expect(await count(managerA, "report_requests")).toBe(0);
    expect(await count(managerA, "bespoke_reports")).toBe(0);
    await setFeature(orgA, "reports.bespoke", true);
  });

  it("hide a report that has been taken down", async () => {
    await adminClient().from("bespoke_reports").update({ archived_at: new Date().toISOString() }).eq("id", reportA);
    expect(await count(managerA, "bespoke_reports")).toBe(0);
  });
});
