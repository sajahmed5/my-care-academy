import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, cleanup, createOrg, createUser, setFeature, signIn } from "./helpers";
import { COMPETENCY_FORMS, SPOT_CHECK_FORM } from "../lib/audit-forms";

/**
 * What a carer sees of Staff Audits (STAFF-AUDITS.md, CARER-FILE.md §6): their
 * booked dates and their own appraisal self-assessment — never the
 * supervision record, and never anyone else's.
 */
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `sa-${l}-${RUN}@example.test`;

let orgId: string;
let managerId: string;
let carerId: string;
let otherId: string;
let bookingId: string;
let saId: string;
const userIds: string[] = [];
let carer: SupabaseClient;
let manager: SupabaseClient;

beforeAll(async () => {
  const admin = adminClient();
  orgId = await createOrg(`Staff audits ${RUN}`);
  await setFeature(orgId, "people.supervisions", true);
  await setFeature(orgId, "people.competency", true);
  managerId = await createUser({ email: email("manager"), password: PW, role: "org_admin", organisationId: orgId });
  carerId = await createUser({ email: email("carer"), password: PW, role: "learner", organisationId: orgId });
  otherId = await createUser({ email: email("other"), password: PW, role: "learner", organisationId: orgId });
  userIds.push(managerId, carerId, otherId);
  manager = await signIn(email("manager"), PW);
  carer = await signIn(email("carer"), PW);

  const { data: b, error } = await manager
    .from("staff_audit_bookings")
    .insert({ organisation_id: orgId, user_id: carerId, kind: "appraisal", booked_on: "2030-01-01", with_user_id: managerId })
    .select("id")
    .single();
  if (error) throw error;
  bookingId = b.id;
  const { data: sa, error: saError } = await manager
    .from("appraisal_self_assessments")
    .insert({ organisation_id: orgId, user_id: carerId, booking_id: bookingId, questions: [{ id: "q", label: "Q" }] })
    .select("id")
    .single();
  if (saError) throw saError;
  saId = sa.id;
  await admin.from("staff_audit_bookings").insert({ organisation_id: orgId, user_id: otherId, kind: "supervision", booked_on: "2030-01-02" });
  await admin.from("supervisions").insert({ organisation_id: orgId, user_id: carerId, kind: "supervision", held_on: "2026-10-01", summary: "manager's notes" });
  await admin.from("spot_checks").insert({ organisation_id: orgId, user_id: carerId, checked_on: "2026-10-01", outcome: "developing", client_name: "A client" });
}, 60_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("supervisions").delete().eq("organisation_id", orgId);
  await admin.from("spot_checks").delete().eq("organisation_id", orgId);
  await admin.from("staff_audit_bookings").delete().eq("organisation_id", orgId);
  await cleanup(userIds, [orgId]);
});

describe("a carer and Staff Audits", () => {
  it("reads their own booking and no one else's", async () => {
    const { data } = await carer.from("staff_audit_bookings").select("id, user_id");
    expect(data?.map((r) => r.id)).toEqual([bookingId]);
  });

  it("never reads a supervision record", async () => {
    const { data } = await carer.from("supervisions").select("id");
    expect(data).toEqual([]);
  });

  it("never reads a spot check, unannounced or not", async () => {
    const { data } = await carer.from("spot_checks").select("id");
    expect(data).toEqual([]);
    const { data: seen } = await manager.from("spot_checks").select("id");
    expect(seen?.length).toBe(1);
  });

  it("fills in their own self-assessment", async () => {
    const { error } = await carer
      .from("appraisal_self_assessments")
      .update({ answers: { q: "It went well" }, submitted_at: new Date().toISOString() })
      .eq("id", saId);
    expect(error).toBeNull();
    const { data } = await manager.from("appraisal_self_assessments").select("answers").eq("id", saId).single();
    expect(data?.answers).toEqual({ q: "It went well" });
  });

  it("cannot change the questions", async () => {
    const { error } = await carer.from("appraisal_self_assessments").update({ questions: [] }).eq("id", saId);
    expect(error).not.toBeNull();
  });

  it("cannot book anything", async () => {
    const { error } = await carer
      .from("staff_audit_bookings")
      .insert({ organisation_id: orgId, user_id: carerId, kind: "supervision", booked_on: "2030-02-01" });
    expect(error).not.toBeNull();
  });

  it("cannot change it once the appraisal has been held", async () => {
    await manager.from("staff_audit_bookings").update({ status: "done" }).eq("id", bookingId);
    const { data } = await carer
      .from("appraisal_self_assessments")
      .update({ answers: { q: "changed later" } })
      .eq("id", saId)
      .select("id");
    expect(data).toEqual([]);
  });

  it("sees nothing without the package", async () => {
    await setFeature(orgId, "people.supervisions", false);
    const { data } = await carer.from("staff_audit_bookings").select("id");
    await setFeature(orgId, "people.supervisions", true);
    expect(data).toEqual([]);
  });
});

describe("suggested training", () => {
  it("names only courses that exist", async () => {
    const slugs = new Set(
      [SPOT_CHECK_FORM, ...COMPETENCY_FORMS].flatMap((f) => Object.values(f.courses).flat()),
    );
    const { data } = await adminClient().from("courses").select("slug").in("slug", [...slugs]);
    expect(new Set((data ?? []).map((c) => c.slug))).toEqual(slugs);
  });
});
