import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, cleanup, createOrg, createUser, setFeature, signIn } from "./helpers";

/**
 * A candidate's login (RECRUITMENT.md, release 2b) has no organisation: it
 * must read nothing of the company it applied to — not its candidates, their
 * documents or applications, its staff, or its clients — even its own
 * candidate record, which the candidate pages read as the service role.
 */
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `cand-${l}-${RUN}@example.test`;

let org: string;
let candidate: SupabaseClient;
const userIds: string[] = [];

beforeAll(async () => {
  const admin = adminClient();
  org = await createOrg(`Cand Org ${RUN}`);
  await setFeature(org, "recruitment.tracker", true);
  await setFeature(org, "clients.list", true);
  const staff = await createUser({ email: email("staff"), password: PW, role: "learner", organisationId: org });
  const cand = await createUser({ email: email("cand"), password: PW, role: "candidate", organisationId: null });
  userIds.push(staff, cand);
  const { data: c } = await admin
    .from("candidates")
    .insert({ organisation_id: org, full_name: `Cand ${RUN}`, email: email("cand"), user_id: cand })
    .select("id")
    .single();
  await admin.from("candidate_documents").insert({ candidate_id: c!.id, organisation_id: org, doc_type: "proof_id", review_status: "submitted" });
  await admin.from("candidate_applications").insert({ candidate_id: c!.id, organisation_id: org });
  await admin.from("clients").insert({ organisation_id: org, full_name: `Client ${RUN}` });
  candidate = await signIn(email("cand"), PW);
}, 60_000);

afterAll(async () => {
  await adminClient().from("candidates").delete().eq("organisation_id", org);
  await cleanup(userIds, [org]);
});

describe("a candidate's login", () => {
  it("has the candidate role and no organisation", async () => {
    const { data } = await adminClient().from("users").select("role, organisation_id").eq("id", userIds[1]).single();
    expect(data).toEqual({ role: "candidate", organisation_id: null });
  });

  for (const table of ["candidates", "candidate_documents", "candidate_applications", "clients", "recruitment_settings"]) {
    it(`reads nothing from ${table}`, async () => {
      const { data } = await candidate.from(table).select("*");
      expect(data ?? []).toEqual([]);
    });
  }

  it("sees no one else in the company", async () => {
    const { data } = await candidate.from("users").select("id").neq("id", userIds[1]);
    expect(data ?? []).toEqual([]);
  });

  it("can't write a candidate record", async () => {
    const { error } = await candidate.from("candidates").insert({ organisation_id: org, full_name: "Sneaky" });
    expect(error).not.toBeNull();
  });
});
