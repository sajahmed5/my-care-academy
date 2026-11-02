import { test, expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { adminDb } from "./db";
import { seeded, session } from "./roles";

/**
 * Companies can never see each other's records. The manager of QA Other Care
 * tries every record page, download and export of QA Test Care by id — the
 * URL a bookmark, a guessed id or a tampered link would carry — and must get
 * nothing: no page, no file, and never a QA Test Care name in the body.
 */
interface Target { path: string; name: string }

async function targets(): Promise<Target[]> {
  const db = adminDb();
  const org = seeded("QA_TEST_ORG_ID");
  const pick = async (table: string, select = "id", extra: Record<string, unknown> = {}) => {
    let q = db.from(table).select(select).eq("organisation_id", org);
    for (const [k, v] of Object.entries(extra)) q = q.eq(k, v);
    const { data, error } = await q.limit(1);
    if (error) throw new Error(`${table}: ${error.message}`);
    return data?.[0] as unknown as Record<string, string> | undefined;
  };
  const staff = (await db.from("users").select("id").eq("organisation_id", org).eq("role", "learner").limit(1)).data?.[0];
  const client = await pick("clients");
  const complaint = await pick("complaints");
  const audit = await pick("audits");
  const hrCase = await pick("hr_cases");
  const candidate = await pick("candidates");
  const cert = await pick("certificates");
  const pip = await pick("pips");
  const survey = await pick("feedback_surveys");
  const absence = await pick("sickness_absences");
  const leaver = await pick("hr_leavers");
  const probation = await pick("probation_reviews");
  const response = await pick("form_responses");
  const policy = await pick("organisation_policies", "policy_id");
  const policyCode = policy ? (await db.from("policy_documents").select("code").eq("id", policy.policy_id).single()).data?.code : null;
  const t: Target[] = [];
  const add = (path: string | null | undefined, name: string) => path && t.push({ path, name });
  add(staff && `/org/staff/${staff.id}`, "staff file");
  add(staff && `/org/staff/${staff.id}/evidence`, "evidence pack PDF");
  add(staff && `/org/staff/${staff.id}/evidence/files`, "evidence ZIP");
  add(staff && `/org/staff/${staff.id}/supervisions/new`, "book supervision");
  add(staff && `/org/observations/${staff.id}`, "Care Certificate");
  add(client && `/org/clients/${client.id}`, "client");
  add(complaint && `/org/complaints/${complaint.id}`, "complaint");
  add(complaint && `/org/complaints/${complaint.id}/pdf`, "complaint PDF");
  add(complaint && `/org/complaints/${complaint.id}/bundle`, "complaint bundle");
  add(audit && `/org/audits/${audit.id}`, "service audit");
  add(hrCase && `/org/hr/cases/${hrCase.id}`, "HR case");
  add(hrCase && `/org/hr/cases/${hrCase.id}/pdf`, "HR case PDF");
  add(candidate && `/org/recruitment/${candidate.id}`, "candidate");
  add(candidate && `/org/recruitment/${candidate.id}/zip`, "candidate ZIP");
  add(cert && `/org/certificates/${cert.id}`, "certificate");
  add(cert && `/org/certificates/${cert.id}/download`, "certificate download");
  add(pip && `/org/pips/${pip.id}`, "performance plan");
  add(pip && `/org/pips/${pip.id}/pdf`, "performance plan PDF");
  add(survey && `/org/feedback/${survey.id}`, "feedback survey");
  add(survey && `/org/feedback/${survey.id}/report`, "feedback report");
  add(absence && `/org/hr/absence/${absence.id}`, "absence");
  add(leaver && `/org/hr/leavers/${leaver.id}`, "leaver");
  add(probation && `/org/hr/probation/review/${probation.id}`, "probation review");
  add(response && `/org/forms/responses/${response.id}`, "form response");
  add(response && `/org/forms/responses/${response.id}/pdf`, "form response PDF");
  add(policyCode && `/org/policies/${policyCode}`, "policy (by code, own copy)");
  add(`/org/certificates/pack?organisation=${org}`, "certificate pack");
  return t;
}

const FORBIDDEN_WORDS = [/Fakecarer/, /Fakeclient/, /Fakedaughter/, /Fakecandidate/, /Fakecompetency/, /QA Test Care/];

test.describe("a manager of another company", () => {
  let api: APIRequestContext;
  let list: Target[];
  test.beforeAll(async ({ baseURL }) => {
    api = await playwrightRequest.newContext({ baseURL, storageState: session("otherManager") });
    list = await targets();
    expect(list.length).toBeGreaterThan(15);
  });
  test.afterAll(async () => api.dispose());

  test("gets nothing from QA Test Care's record pages and downloads", async () => {
    const leaks: string[] = [];
    for (const { path, name } of list) {
      const res = await api.get(path, { maxRedirects: 0 });
      const status = res.status();
      const type = res.headers()["content-type"] ?? "";
      const body = status === 200 ? await res.text() : "";
      const leaked = FORBIDDEN_WORDS.some((re) => re.test(body));
      // A file served, or a page naming the other company's people, is a leak.
      if (leaked || (status === 200 && !/text\/html/.test(type))) leaks.push(`${name} ${path}: ${status} ${type}`);
      if (status === 200 && /text\/html/.test(type) && !/not found|couldn.t find|no longer|doesn.t exist|404/i.test(body)) {
        leaks.push(`${name} ${path}: 200 page without a not-found message`);
      }
      if (status >= 500) leaks.push(`${name} ${path}: server error ${status}`);
    }
    expect(leaks).toEqual([]);
  });
});

test.describe("a carer", () => {
  test("cannot download a colleague's certificate or open a manager's record pages", async ({ baseURL }) => {
    const db = adminDb();
    const org = seeded("QA_TEST_ORG_ID");
    const me = (await db.from("users").select("id").eq("email", process.env.QA_TEST_STAFF_EMAIL!).single()).data!;
    const other = (await db.from("certificates").select("id, user_id").eq("organisation_id", org).neq("user_id", me.id).limit(1)).data?.[0];
    expect(other).toBeTruthy();
    const api = await playwrightRequest.newContext({ baseURL, storageState: session("testStaff") });
    for (const path of [`/learn/certificates/${other!.id}`, `/learn/certificates/${other!.id}/download`, `/org/staff/${other!.user_id}`, `/org/certificates/${other!.id}/download`]) {
      const res = await api.get(path, { maxRedirects: 0 });
      const type = res.headers()["content-type"] ?? "";
      expect(res.status() === 200 && !/text\/html/.test(type), `${path} served a file`).toBe(false);
      if (res.status() === 200) {
        const body = await res.text();
        expect(body, path).toMatch(/not found|couldn.t find|no longer|doesn.t exist|404/i);
      }
    }
    await api.dispose();
  });
});

test("a signed-out visitor cannot fetch any record page or file", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  for (const { path } of await targets()) {
    const res = await api.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBeGreaterThanOrEqual(300);
    expect(res.headers()["location"] ?? "", path).toMatch(/\/login/);
  }
  await api.dispose();
});
