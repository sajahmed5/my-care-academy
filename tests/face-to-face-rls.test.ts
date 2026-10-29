import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, cleanup, createOrg, createUser, setFeature, signIn } from "./helpers";

// Face-to-face bookings (FACE-TO-FACE.md): signed-in users only read, gated
// by the feature; the service role writes, and the booking trigger holds the
// line on places and on whose staff can be booked. Same shape as
// observations-rls.

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `f2f-${l}-${RUN}@example.test`;

let orgOn: string;
let orgOff: string;
let sessionId: string;
const learners: Record<string, string> = {};
const userIds: string[] = [];
const orgIds: string[] = [];

let adminOn: SupabaseClient;
let adminOff: SupabaseClient;
let learnerA: SupabaseClient;

beforeAll(async () => {
  const admin = adminClient();
  orgOn = await createOrg(`F2F On ${RUN}`);
  orgOff = await createOrg(`F2F Off ${RUN}`);
  orgIds.push(orgOn, orgOff);
  await setFeature(orgOn, "training.face_to_face", true);
  await setFeature(orgOff, "training.face_to_face", false);

  userIds.push(
    await createUser({ email: email("admin-on"), password: PW, role: "org_admin", organisationId: orgOn }),
    await createUser({ email: email("admin-off"), password: PW, role: "org_admin", organisationId: orgOff }),
  );
  for (const [key, org] of [["a", orgOn], ["b", orgOn], ["c", orgOn], ["d", orgOff]] as const) {
    learners[key] = await createUser({ email: email(`learner-${key}`), password: PW, role: "learner", organisationId: org });
    userIds.push(learners[key]);
  }

  // Far ahead and plainly a test, in case anyone looks while it runs.
  const { data, error } = await admin
    .from("face_to_face_sessions")
    .insert({ kind: "induction", starts_at: "2030-06-03T09:00:00Z", ends_at: "2030-06-03T12:00:00Z", places: 2, notes: `TEST ${RUN}` })
    .select("id")
    .single();
  if (error) throw error;
  sessionId = data.id as string;

  adminOn = await signIn(email("admin-on"), PW);
  adminOff = await signIn(email("admin-off"), PW);
  learnerA = await signIn(email("learner-a"), PW);
}, 60_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("face_to_face_sessions").delete().eq("id", sessionId);
  await cleanup(userIds, orgIds);
});

const book = (user: string, org: string) =>
  adminClient().from("face_to_face_bookings").insert({ session_id: sessionId, organisation_id: org, user_id: user }).select("id").single();

describe("face-to-face booking rules", () => {
  it("books up to the places, then refuses", async () => {
    expect((await book(learners.a, orgOn)).error).toBeNull();
    expect((await book(learners.b, orgOn)).error).toBeNull();
    const full = await book(learners.c, orgOn);
    expect(full.error?.message).toContain("full");
  });

  it("won't book someone onto another company's booking", async () => {
    const { error } = await book(learners.d, orgOn);
    expect(error?.message).toMatch(/own current staff|full/);
  });

  it("gives the place back when a booking is cancelled", async () => {
    const admin = adminClient();
    await admin.from("face_to_face_bookings").update({ status: "cancelled" }).eq("session_id", sessionId).eq("user_id", learners.b);
    expect((await book(learners.c, orgOn)).error).toBeNull();
  });
});

describe("face-to-face reads", () => {
  it("an entitled manager reads the session and their own bookings", async () => {
    const { data: sessions } = await adminOn.from("face_to_face_sessions").select("id").eq("id", sessionId);
    expect(sessions).toHaveLength(1);
    const { data: bookings } = await adminOn.from("face_to_face_bookings").select("user_id, status").neq("status", "cancelled");
    expect((bookings ?? []).map((b) => b.user_id).sort()).toEqual([learners.a, learners.c].sort());
  });

  it("an entitled manager sees places taken across every company", async () => {
    const { data, error } = await adminOn.rpc("face_to_face_places_taken", { p_from: "2030-01-01T00:00:00Z" });
    expect(error).toBeNull();
    expect((data as { session_id: string; taken: number }[]).find((r) => r.session_id === sessionId)?.taken).toBe(2);
  });

  it("a manager without the feature sees no sessions, bookings or counts", async () => {
    expect((await adminOff.from("face_to_face_sessions").select("id").eq("id", sessionId)).data ?? []).toEqual([]);
    expect((await adminOff.from("face_to_face_bookings").select("id")).data ?? []).toEqual([]);
    expect((await adminOff.rpc("face_to_face_places_taken", { p_from: "2030-01-01T00:00:00Z" })).data ?? []).toEqual([]);
  });

  it("a carer reads their own booking only", async () => {
    const { data } = await learnerA.from("face_to_face_bookings").select("user_id");
    expect((data ?? []).map((b) => b.user_id)).toEqual([learners.a]);
  });

  it("nobody signed in can write a booking", async () => {
    const { error } = await adminOn
      .from("face_to_face_bookings")
      .insert({ session_id: sessionId, organisation_id: orgOn, user_id: learners.b });
    expect(error).not.toBeNull();
  });
});
