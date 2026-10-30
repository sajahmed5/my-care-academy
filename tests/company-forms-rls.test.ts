import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, cleanup, createOrg, createUser, setFeature, signIn } from "./helpers";

/**
 * A company's own forms (FORMS.md, "Editable"): the console builds and
 * changes its own, nobody else sees them, nobody deletes one, and a carer
 * cannot write any. Company choices about our forms are its own too.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `company-forms-${l}-${RUN}@example.test`;

let orgA: string;
let orgB: string;
const userIds: string[] = [];
const orgIds: string[] = [];
let officeA: SupabaseClient;
let carerA: SupabaseClient;
let officeB: SupabaseClient;
let libraryId: string;
let ownId: string;

beforeAll(async () => {
  const admin = adminClient();
  orgA = await createOrg(`Company forms A ${RUN}`);
  orgB = await createOrg(`Company forms B ${RUN}`);
  orgIds.push(orgA, orgB);
  for (const o of orgIds) await setFeature(o, "forms.builder", true);
  userIds.push(
    await createUser({ email: email("office-a"), password: PW, role: "org_office", organisationId: orgA }),
    await createUser({ email: email("carer-a"), password: PW, role: "learner", organisationId: orgA }),
    await createUser({ email: email("office-b"), password: PW, role: "org_office", organisationId: orgB }),
  );
  // One of ours, as a draft so no real company sees it during the run.
  const { data: lib } = await admin
    .from("form_templates")
    .insert({ code: `TEST-LIB-${RUN}`, title: "Test library form", category: "care", status: "draft" })
    .select("id")
    .single();
  libraryId = lib!.id as string;
  officeA = await signIn(email("office-a"), PW);
  carerA = await signIn(email("carer-a"), PW);
  officeB = await signIn(email("office-b"), PW);
}, 60_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("organisation_form_settings").delete().in("organisation_id", orgIds);
  await admin.from("form_templates").delete().in("organisation_id", orgIds);
  await admin.from("form_templates").delete().eq("id", libraryId);
  await cleanup(userIds, orgIds);
});

describe("a company's own forms", () => {
  it("the office can build one", async () => {
    const { data, error } = await officeA
      .from("form_templates")
      .insert({ code: `TEST-OWN-${RUN}`, title: "Our form", category: "other", organisation_id: orgA, status: "published", based_on_id: libraryId })
      .select("id")
      .single();
    expect(error).toBeNull();
    ownId = data!.id as string;
  });

  it("but not one for another company", async () => {
    const { error } = await officeA
      .from("form_templates")
      .insert({ code: `TEST-OTHER-${RUN}`, title: "Theirs", category: "other", organisation_id: orgB });
    expect(error).not.toBeNull();
  });

  it("nor one of ours", async () => {
    const { error } = await officeA.from("form_templates").insert({ code: `TEST-OURS-${RUN}`, title: "Ours", category: "other" });
    expect(error).not.toBeNull();
  });

  it("a carer cannot build one", async () => {
    const { error } = await carerA
      .from("form_templates")
      .insert({ code: `TEST-CARER-${RUN}`, title: "Carer's", category: "other", organisation_id: orgA });
    expect(error).not.toBeNull();
  });

  it("the company can change its own, and nobody else can see it", async () => {
    const { error } = await officeA.from("form_templates").update({ title: "Our form, revised" }).eq("id", ownId);
    expect(error).toBeNull();
    const { data } = await officeB.from("form_templates").select("id").eq("id", ownId);
    expect(data).toEqual([]);
    const { count } = await officeB.from("form_templates").update({ title: "Hijacked" }, { count: "exact" }).eq("id", ownId);
    expect(count ?? 0).toBe(0);
  });

  it("a carer in the company can read a published one (to fill it in)", async () => {
    const { data } = await carerA.from("form_templates").select("id").eq("id", ownId);
    expect(data?.length).toBe(1);
  });

  it("nobody can delete one", async () => {
    const { error } = await officeA.from("form_templates").delete().eq("id", ownId);
    expect(error).not.toBeNull();
  });
});

describe("company choices about our forms", () => {
  it("the office can switch one off; a carer cannot", async () => {
    const { error } = await officeA.from("organisation_form_settings").insert({ organisation_id: orgA, template_id: libraryId, hidden: true });
    expect(error).toBeNull();
    const { error: carerErr } = await carerA
      .from("organisation_form_settings")
      .upsert({ organisation_id: orgA, template_id: libraryId, hidden: false }, { onConflict: "organisation_id,template_id" });
    expect(carerErr).not.toBeNull();
  });

  it("another company cannot see or set them", async () => {
    const { data } = await officeB.from("organisation_form_settings").select("template_id").eq("organisation_id", orgA);
    expect(data).toEqual([]);
    const { error } = await officeB.from("organisation_form_settings").insert({ organisation_id: orgA, template_id: libraryId, hidden: false });
    expect(error).not.toBeNull();
  });
});
