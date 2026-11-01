import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, cleanup, createOrg, createUser, signIn } from "./helpers";

/**
 * Stars in the console: an office worker reads their company's attempts
 * through quiz_attempt_stars (security invoker, so quiz_attempts' own
 * policies apply) and the in-content star rows; a learner sees only their
 * own; another company sees nothing. The view returns the question count,
 * never the ids.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `stars-${l}-${RUN}@example.test`;

const userIds: string[] = [];
const orgIds: string[] = [];
let orgId: string;
let carerId: string;
let office: SupabaseClient;
let carer: SupabaseClient;
let stranger: SupabaseClient;

beforeAll(async () => {
  const admin = adminClient();
  orgId = await createOrg(`Stars ${RUN}`);
  const otherOrg = await createOrg(`Stars other ${RUN}`);
  orgIds.push(orgId, otherOrg);

  carerId = await createUser({ email: email("carer"), password: PW, role: "learner", organisationId: orgId });
  const officeId = await createUser({ email: email("office"), password: PW, role: "org_office", organisationId: orgId });
  const strangerId = await createUser({ email: email("stranger"), password: PW, role: "org_office", organisationId: otherOrg });
  userIds.push(carerId, officeId, strangerId);

  const { data: course } = await admin.from("courses").select("id").limit(1).single();
  const questionIds = Array.from({ length: 20 }, (_, i) => `q-${i}`);
  const { error: attemptError } = await admin.from("quiz_attempts").insert({
    organisation_id: orgId,
    user_id: carerId,
    course_id: course!.id,
    question_ids: questionIds,
    answers: {},
    score: 85,
    passed: true,
    started_at: new Date(Date.now() - 600_000).toISOString(),
    submitted_at: new Date().toISOString(),
  });
  if (attemptError) throw attemptError;
  const { error: starError } = await admin.from("content_question_stars").insert({
    organisation_id: orgId,
    user_id: carerId,
    course_id: course!.id,
    question_key: `content-${RUN}`,
  });
  if (starError) throw starError;

  [office, carer, stranger] = await Promise.all([signIn(email("office"), PW), signIn(email("carer"), PW), signIn(email("stranger"), PW)]);
});

afterAll(async () => {
  await cleanup(userIds, orgIds);
});

describe("quiz_attempt_stars (console stars)", () => {
  it("gives an office worker the company's attempts with the question count, not the ids", async () => {
    const { data, error } = await office.from("quiz_attempt_stars").select("user_id, score, passed, questions").eq("organisation_id", orgId);
    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: carerId, score: 85, passed: true, questions: 20 }]);
    const stars = await office.from("content_question_stars").select("user_id").eq("organisation_id", orgId);
    expect(stars.error).toBeNull();
    expect(stars.data).toHaveLength(1);
  });

  it("gives a learner their own, and another company nothing", async () => {
    const own = await carer.from("quiz_attempt_stars").select("questions").eq("user_id", carerId);
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ questions: 20 }]);
    const other = await stranger.from("quiz_attempt_stars").select("id").eq("organisation_id", orgId);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
  });

  it("cannot be written through", async () => {
    const { error } = await office.from("quiz_attempt_stars").delete().eq("organisation_id", orgId);
    expect(error).not.toBeNull();
  });
});
