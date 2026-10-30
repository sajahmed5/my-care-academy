import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, cleanup, createOrg, createUser, setFeature, signIn } from "./helpers";

/**
 * Feedback rounds (FORMS.md): the office manages its own invitations, wording
 * and "you said, we did"; a carer and another company cannot; the office may
 * mark what it made of an answer but never change the answer.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `feedback-rounds-${l}-${RUN}@example.test`;

let orgA: string;
let orgB: string;
let surveyA: string;
let responseA: string;
let clientA: string;
const userIds: string[] = [];
const orgIds: string[] = [];
let officeA: SupabaseClient;
let carerA: SupabaseClient;
let officeB: SupabaseClient;

beforeAll(async () => {
  const admin = adminClient();
  orgA = await createOrg(`Feedback A ${RUN}`);
  orgB = await createOrg(`Feedback B ${RUN}`);
  orgIds.push(orgA, orgB);
  for (const o of orgIds) {
    await setFeature(o, "quality.feedback", true);
    await setFeature(o, "clients.list", true);
  }
  userIds.push(
    await createUser({ email: email("office-a"), password: PW, role: "org_office", organisationId: orgA }),
    await createUser({ email: email("carer-a"), password: PW, role: "learner", organisationId: orgA }),
    await createUser({ email: email("office-b"), password: PW, role: "org_office", organisationId: orgB }),
  );
  const { data: c } = await admin.from("clients").insert({ organisation_id: orgA, full_name: `Client ${RUN}` }).select("id").single();
  clientA = c!.id as string;
  const { data: s } = await admin
    .from("feedback_surveys")
    .insert({ organisation_id: orgA, kind: "client", token: `tok-${RUN}-xxxxxxxxxxxxxxxxxxxxxxxx`, named: true })
    .select("id")
    .single();
  surveyA = s!.id as string;
  const { data: r } = await admin
    .from("feedback_responses")
    .insert({ survey_id: surveyA, organisation_id: orgA, answers: { overall: 2 }, client_id: clientA })
    .select("id")
    .single();
  responseA = r!.id as string;
  officeA = await signIn(email("office-a"), PW);
  carerA = await signIn(email("carer-a"), PW);
  officeB = await signIn(email("office-b"), PW);
}, 60_000);

afterAll(async () => {
  const admin = adminClient();
  await admin.from("feedback_surveys").delete().in("organisation_id", orgIds);
  await admin.from("organisation_feedback_questions").delete().in("organisation_id", orgIds);
  await admin.from("clients").delete().eq("id", clientA);
  await cleanup(userIds, orgIds);
});

describe("feedback rounds", () => {
  it("staff rounds cannot be named", async () => {
    const { error } = await officeA
      .from("feedback_surveys")
      .insert({ organisation_id: orgA, kind: "staff", token: `staff-${RUN}-xxxxxxxxxxxxxxxxxxxxxx`, named: true });
    expect(error).not.toBeNull();
  });

  it("the office invites a family about its own client; others cannot", async () => {
    const row = { survey_id: surveyA, organisation_id: orgA, token: `inv-${RUN}-xxxxxxxxxxxxxxxxxxxxxxxx`, client_id: clientA, email: "delivered@resend.dev" };
    expect((await carerA.from("feedback_invitations").insert({ ...row, token: `${row.token}c` })).error).not.toBeNull();
    expect((await officeB.from("feedback_invitations").insert({ ...row, token: `${row.token}b` })).error).not.toBeNull();
    expect((await officeA.from("feedback_invitations").insert(row)).error).toBeNull();
  });

  it("the office words its own survey; a carer cannot", async () => {
    const q = [{ id: "overall", text: "Overall?", type: "rating" }];
    expect((await carerA.from("organisation_feedback_questions").insert({ organisation_id: orgA, kind: "client", questions: q })).error).not.toBeNull();
    expect((await officeA.from("organisation_feedback_questions").insert({ organisation_id: orgA, kind: "client", questions: q })).error).toBeNull();
  });

  it("the office writes you said, we did for its own round only", async () => {
    expect((await officeA.from("feedback_actions").insert({ survey_id: surveyA, organisation_id: orgA, you_said: "Late calls" })).error).toBeNull();
    expect((await officeB.from("feedback_actions").insert({ survey_id: surveyA, organisation_id: orgB, you_said: "Sneaky" })).error).not.toBeNull();
  });

  it("the office can mark what it made of an answer, but not change the answer", async () => {
    const { error: answerErr } = await officeA.from("feedback_responses").update({ answers: { overall: 5 } }).eq("id", responseA);
    expect(answerErr).not.toBeNull();
    const { error } = await officeA.from("feedback_responses").update({ compliment_id: null }).eq("id", responseA);
    expect(error).toBeNull();
    const { data } = await officeB.from("feedback_responses").select("id").eq("id", responseA);
    expect(data).toEqual([]);
  });
});
