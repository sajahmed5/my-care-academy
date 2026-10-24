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
 * An office worker is a console user in the database: the same rows as a
 * manager. What keeps Account manager-only is the app, not RLS — so this
 * checks the rows open up, and that the one write that would matter (a role
 * change on users) is not something either console role can make directly.
 */
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `office-${l}-${RUN}@example.test`;

let orgId: string;
let officeId: string;
let learnerId: string;
const userIds: string[] = [];
let office: SupabaseClient;

beforeAll(async () => {
  const admin = adminClient();
  orgId = await createOrg(`Office ${RUN}`);
  await setFeature(orgId, "recruitment.tracker", true);
  officeId = await createUser({ email: email("office"), password: PW, role: "org_office", organisationId: orgId });
  learnerId = await createUser({ email: email("learner"), password: PW, role: "learner", organisationId: orgId });
  userIds.push(officeId, learnerId);
  await admin.from("candidates").insert({ organisation_id: orgId, full_name: `Cand ${RUN}` });
  office = await signIn(email("office"), PW);
}, 60_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("candidates").delete().eq("organisation_id", orgId);
  await cleanup(userIds, [orgId]);
});

describe("an office worker in the console", () => {
  it("reads the organisation's candidates like a manager", async () => {
    const { data } = await office.from("candidates").select("id");
    expect(data?.length).toBe(1);
  });

  it("can add a candidate", async () => {
    const { error } = await office
      .from("candidates")
      .insert({ organisation_id: orgId, full_name: `Added by office ${RUN}` });
    expect(error).toBeNull();
  });

  it("reads the organisation's people, which the learner lists need", async () => {
    const { data } = await office.from("users").select("id").eq("organisation_id", orgId);
    expect(data?.map((u) => u.id).sort()).toEqual([officeId, learnerId].sort());
  });

  // /account reads the signed-in user's own row with their own client, so this
  // is the read behind an office worker's name and password page.
  it("reads their own row, name and all", async () => {
    const { data } = await office
      .from("users")
      .select("id, full_name, email")
      .eq("id", officeId)
      .maybeSingle();
    expect(data?.id).toBe(officeId);
    expect(data?.email).toBe(email("office"));
  });

  it("cannot change a role directly — only the Account page's service-role action does that", async () => {
    const { data } = await office
      .from("users")
      .update({ role: "org_admin" })
      .eq("id", officeId)
      .select("id");
    expect(data ?? []).toEqual([]);
    const { data: still } = await adminClient().from("users").select("role").eq("id", officeId).single();
    expect(still?.role).toBe("org_office");
  });
});
