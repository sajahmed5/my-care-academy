import { test, expect, request as playwrightRequest, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { adminDb } from "./db";
import { seeded, session } from "./roles";

/**
 * People flows end to end, as the manager of QA Test Care (and the office
 * worker where the brief asks): inviting staff and their first sign-in,
 * editing and deactivating a carer, clients (form and spreadsheet), the
 * staff spreadsheet, holidays, absence, probation, cases and leavers; and
 * the forms at a phone's width.
 *
 * Everything a test creates carries a per-run tag (`qa-run-<tag>`) and is
 * removed again in afterAll, so the suite can run beside the others and
 * again tomorrow. Seeded people are only ever read, never changed: the
 * carers these flows act on are made here, through the same admin API the
 * seed uses, and deleted at the end.
 */

const tag = Date.now().toString(36);
const ORG = () => seeded("QA_TEST_ORG_ID");
const today = () => new Date().toISOString().slice(0, 10);
/** yyyy-mm-dd, `n` days from today (UTC, as the app counts). */
function day(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** "25 Oct 2026": the one way the site writes a date (lib/dates.ts). */
const uk = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "Europe/London", ...opts });

/** A carer of QA Test Care made for one test, the way the seed makes them. */
interface Carer { id: string; email: string; password: string; name: string }
async function makeCarer(label: string): Promise<Carer> {
  const email = `qa-run-${tag}-${label}@example.com`;
  const password = `Qa!${tag}-${label}-Pass9`;
  const name = `Run${tag} ${label.charAt(0).toUpperCase()}${label.slice(1)} Fakerun`;
  const { data, error } = await adminDb().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "learner", organisation_id: ORG(), full_name: name },
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  // The handle_new_user trigger writes the profile; make sure it did.
  await expect.poll(async () => (await adminDb().from("users").select("id").eq("id", data.user!.id).maybeSingle()).data?.id).toBe(data.user.id);
  return { id: data.user.id, email, password, name };
}
async function deleteUser(id: string | undefined) {
  if (id) await adminDb().auth.admin.deleteUser(id);
}
/**
 * A signed-out browser. `browser.newContext()` alone inherits the describe's
 * `storageState`, so a "fresh" context would still carry the manager's cookies.
 */
const fresh = (browser: Browser, extra: Parameters<Browser["newContext"]>[0] = {}) =>
  browser.newContext({ ...extra, storageState: { cookies: [], origins: [] } });
/** The page's own error message, not Next's empty route announcer (also role=alert). */
const alertOf = (page: Page) => page.locator("[role=alert]:not(#__next-route-announcer__)");
/** Through the real sign-in form, as the global setup does. */
async function signIn(browser: Browser, email: string, password: string, expectIn = true, extra: Parameters<Browser["newContext"]>[0] = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await fresh(browser, extra);
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Let the sign-in finish before the caller navigates on, or it is cut short.
  if (expectIn) await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  return { context, page };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Inviting a carer
// ───────────────────────────────────────────────────────────────────────────

test.describe("inviting a carer (manager)", () => {
  test.use({ storageState: session("testManager") });
  const made: string[] = [];
  test.afterAll(async () => {
    for (const email of made) {
      const { data } = await adminDb().from("users").select("id").eq("email", email).maybeSingle();
      await deleteUser(data?.id as string | undefined);
    }
  });

  test("the invite link lets them set a password once, then lands them on /learn", async ({ page, browser }) => {
    const email = `qa-run-${tag}-invitee@example.com`;
    made.push(email);
    // People → Staff → Add staff goes to the Invite section.
    await page.goto("/org/learners");
    await page.getByRole("link", { name: "Add staff" }).click();
    await expect(page).toHaveURL(/\/org\/learners\/admin\?section=invite/);
    await page.getByLabel("Full name").fill(`Run${tag} Invitee Fakerun`);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Invite staff member" }).click();
    // No email service, so the page shows the link to pass on.
    await expect(page.getByText(`Invite created for ${email}`)).toBeVisible();
    const link = (await page.locator("code").first().textContent())?.trim() ?? "";
    // The 14-day "Set up your account" button, not a short-lived link.
    expect(link).toMatch(/^http:\/\/localhost:3100\/auth\/setup\?t=.+/);
    // The profile exists already, in the right company, not yet signed in.
    const profile = (await adminDb().from("users").select("organisation_id, role, status, last_seen_at").eq("email", email).single()).data!;
    expect(profile).toMatchObject({ organisation_id: ORG(), role: "learner" });
    // A copy of the invitation is kept for the platform, with the link taken
    // out (sending is off here, so it's marked not sent).
    const copy = (await adminDb().from("email_log").select("type, sent, html, sent_by, organisation_id").eq("to_email", email).single()).data!;
    expect(copy).toMatchObject({ type: "invitation", sent: false, organisation_id: ORG() });
    expect(copy.sent_by).toBeTruthy();
    expect(copy.html).toContain("sign-in link removed");
    expect(copy.html).not.toContain("/auth/setup?t=");
    // Staff list: there, enabled, never signed in.
    await page.goto("/org/learners/admin");
    const row = page.locator("table tbody tr", { hasText: email });
    await expect(row).toContainText("Enabled");
    await expect(row).toContainText("Never");

    // The invitee, signed out, in their own browser.
    const theirs = await fresh(browser);
    const them = await theirs.newPage();
    // An email scanner opens it first: that must not spoil it.
    expect((await fetch(link, { redirect: "manual" })).status).toBeLessThan(400);
    await them.goto(link);
    await expect(them).toHaveURL(/\/auth\/confirm/);
    await them.getByRole("button", { name: "Continue" }).click();
    await them.waitForURL(/\/auth\/set-password/);
    await expect(them.getByText(email)).toBeVisible();
    const password = `Strong!${tag}Pw-42`;
    await them.getByLabel("New password").fill(password);
    await them.getByLabel("Confirm password").fill(password);
    await them.getByRole("button", { name: "Set password & continue" }).click();
    await expect(them).toHaveURL(/\/learn(\/|$|\?)/, { timeout: 30_000 });
    await theirs.close();

    // The same button again, once they've signed in, goes to sign in: it
    // never opens an account somebody is using.
    const again = await fresh(browser);
    const p2 = await again.newPage();
    await p2.goto(link);
    await expect(p2).toHaveURL(/\/login/);
    await expect(p2.getByRole("button", { name: "Continue" })).toHaveCount(0);
    await again.close();

    // And the password they chose works at the sign-in form.
    const { context, page: signed } = await signIn(browser, email, password);
    await expect(signed).toHaveURL(/\/learn(\/|$|\?)/, { timeout: 30_000 });
    await context.close();
  });

  test("an email already in use is refused with a message and no duplicate", async ({ page }) => {
    const email = process.env.QA_TEST_STAFF_EMAIL!;
    await page.goto("/org/learners/admin?section=invite");
    await page.getByLabel("Full name").fill("Someone Else");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Invite staff member" }).click();
    const alert = alertOf(page);
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/already/i);
    const { count } = await adminDb().from("users").select("id", { count: "exact", head: true }).eq("email", email);
    expect(count).toBe(1);
  });

  test("a missing or malformed email never leaves the browser", async ({ page }) => {
    await page.goto("/org/learners/admin?section=invite");
    const emailBox = page.getByLabel("Email");
    await page.getByRole("button", { name: "Invite staff member" }).click();
    expect(await emailBox.evaluate((el: HTMLInputElement) => el.validationMessage)).not.toBe("");
    await emailBox.fill("not-an-email");
    await page.getByRole("button", { name: "Invite staff member" }).click();
    expect(await emailBox.evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(true);
    await expect(alertOf(page)).toHaveCount(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. A carer's file: employment details, deactivate, reactivate, delete
// ───────────────────────────────────────────────────────────────────────────

test.describe("a carer's file (manager)", () => {
  test.use({ storageState: session("testManager") });
  let carer: Carer;
  test.beforeAll(async () => {
    carer = await makeCarer("file");
  });
  test.afterAll(async () => deleteUser(carer?.id));

  test("employment details save, show as UK dates on their own HR page, and survive a reload", async ({ page, browser }) => {
    await page.goto(`/org/staff/${carer.id}?section=employment`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(carer.name);
    // The clock-change day: must read back as 25 Oct 2026, not the 24th.
    await page.getByLabel("Start date").fill("2026-10-25");
    await page.getByLabel("Job title").fill("Care worker <b>QA</b>");
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Start date")).toHaveValue("2026-10-25");
    await expect(page.getByLabel("Job title")).toHaveValue("Care worker <b>QA</b>");
    // Probation runs six months from the start: ends 25 Apr 2027.
    await expect(page.getByText("Ends 25 Apr 2027")).toBeVisible();
    await expect(page.getByText("Due 25 Nov 2026")).toBeVisible();
    const emp = (await adminDb().from("staff_employment").select("start_date, job_title, probation_status").eq("user_id", carer.id).single()).data!;
    expect(emp).toMatchObject({ start_date: "2026-10-25", job_title: "Care worker <b>QA</b>", probation_status: "in_probation" });

    // Their own HR page, as them: the same date, written the UK way, HTML inert.
    const { context, page: mine } = await signIn(browser, carer.email, carer.password);
    await mine.goto("/learn/hr");
    await expect(mine.getByText("Started 25 Oct 2026")).toBeVisible();
    await expect(mine.getByText("Care worker <b>QA</b>")).toBeVisible();
    expect(await mine.locator("b").count()).toBe(0);
    await context.close();
  });

  test("deactivating locks them out and the list says so; reactivating lets them back in", async ({ page, browser }) => {
    page.on("dialog", (d) => d.accept());
    await page.goto("/org/learners/admin");
    const row = page.locator("table tbody tr", { hasText: carer.email });
    await expect(row).toContainText("Enabled");
    await row.getByRole("button", { name: "Deactivate" }).click();
    await expect(row).toContainText("Deactivated", { timeout: 15_000 });
    await expect.poll(async () => (await adminDb().from("users").select("status").eq("id", carer.id).single()).data?.status).toBe("deactivated");

    // Locked out at the sign-in form.
    const locked = await signIn(browser, carer.email, carer.password, false);
    await expect(alertOf(locked.page).or(locked.page.getByText(/deactivated|suspended|can.t sign in|not match|try again/i)).first()).toBeVisible({ timeout: 15_000 });
    await expect(locked.page).not.toHaveURL(/\/learn/);
    await locked.context.close();

    await page.reload();
    await row.getByRole("button", { name: "Reactivate" }).click();
    await expect(row).toContainText("Enabled", { timeout: 15_000 });
    await expect.poll(async () => (await adminDb().from("users").select("status").eq("id", carer.id).single()).data?.status).toBe("active");
    const back = await signIn(browser, carer.email, carer.password);
    await expect(back.page).toHaveURL(/\/learn(\/|$|\?)/, { timeout: 30_000 });
    await back.context.close();
  });

  test("a cancelled confirmation changes nothing; a confirmed delete removes them for good", async ({ page }) => {
    const victim = await makeCarer("delete");
    try {
      await page.goto("/org/learners/admin");
      const row = page.locator("table tbody tr", { hasText: victim.email });
      await expect(row).toBeVisible();
      // Say no.
      page.once("dialog", (d) => d.dismiss());
      await row.getByRole("button", { name: "Delete" }).click();
      await page.waitForTimeout(1000);
      await expect(row).toBeVisible();
      expect((await adminDb().from("users").select("id").eq("id", victim.id).maybeSingle()).data?.id).toBe(victim.id);
      // Say yes.
      page.once("dialog", (d) => {
        expect(d.message()).toContain(victim.name);
        expect(d.message()).toMatch(/cannot be undone/i);
        void d.accept();
      });
      await row.getByRole("button", { name: "Delete" }).click();
      await expect(row).toHaveCount(0, { timeout: 20_000 });
      await expect.poll(async () => (await adminDb().from("users").select("id").eq("id", victim.id).maybeSingle()).data).toBeNull();
      const { data: auth } = await adminDb().auth.admin.getUserById(victim.id);
      expect(auth.user).toBeNull();
    } finally {
      await deleteUser(victim.id).catch(() => undefined);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Clients
// ───────────────────────────────────────────────────────────────────────────

test.describe("clients (manager)", () => {
  test.use({ storageState: session("testManager") });
  const prefix = `QA Run${tag}`;
  test.afterAll(async () => {
    await adminDb().from("clients").delete().eq("organisation_id", ORG()).like("full_name", `${prefix}%`);
  });

  test("adds a client, opens their page, and the list shows UK dates and a tidied postcode", async ({ page }) => {
    const name = `${prefix} Added Fakeclient`;
    await page.goto("/org/clients/new");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Date of birth").fill("1940-02-29");
    await page.getByLabel("Postcode").fill("  m1 1aa ");
    await page.getByLabel("Region").fill("North");
    await page.getByLabel("Care started").fill("2026-10-25");
    await page.getByLabel("Which council").fill("Fakeshire Council");
    await page.getByLabel("We help this client with their medication").check();
    await page.getByRole("button", { name: "Add client" }).click();
    await expect(page).toHaveURL(/\/org\/clients\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    const saved = (await adminDb().from("clients").select("*").eq("organisation_id", ORG()).eq("full_name", name).single()).data!;
    expect(saved).toMatchObject({ date_of_birth: "1940-02-29", postcode: "M1 1AA", start_date: "2026-10-25", funder_type: "council", funder_name: "Fakeshire Council", medication_support: true, status: "active" });
    await page.goto(`/org/clients?q=${encodeURIComponent(name)}`);
    const row = page.locator("table tbody tr", { hasText: name });
    await expect(row).toContainText("29 Feb 1940");
    await expect(row).toContainText("25 Oct 2026");
    await expect(row).toContainText("Fakeshire Council");
  });

  test("refuses a missing name, and a name of spaces only", async ({ page }) => {
    await page.goto("/org/clients/new");
    const nameBox = page.getByLabel("Name");
    await page.getByRole("button", { name: "Add client" }).click();
    expect(await nameBox.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
    await expect(page).toHaveURL(/\/org\/clients\/new$/);
    await nameBox.fill("    ");
    await page.getByRole("button", { name: "Add client" }).click();
    await expect(alertOf(page)).toContainText("No name");
    await expect(page).toHaveURL(/\/org\/clients\/new$/);
  });

  test("the same name and date of birth twice is refused, even with different case and spacing", async ({ page }) => {
    const name = `${prefix} Twice Fakeclient`;
    const add = async (n: string) => {
      await page.goto("/org/clients/new");
      await page.getByLabel("Name").fill(n);
      await page.getByLabel("Date of birth").fill("1950-06-15");
      await page.getByRole("button", { name: "Add client" }).click();
    };
    await add(name);
    await expect(page).toHaveURL(/\/org\/clients\/[0-9a-f-]{36}$/);
    await add(name);
    await expect(alertOf(page)).toContainText("already a client with this name and date of birth");
    await add(`  ${name.toUpperCase()}  `);
    await expect(alertOf(page)).toContainText("already a client");
    const { count } = await adminDb().from("clients").select("id", { count: "exact", head: true }).eq("organisation_id", ORG()).ilike("full_name", name);
    expect(count).toBe(1);
  });

  test("apostrophes, emoji and HTML in the name are kept and shown as text; over-long names are refused", async ({ page }) => {
    const name = `${prefix} O'Brien-Søren 🧑‍⚕️ <script>alert(1)</script> & "quotes"`;
    let dialogs = 0;
    page.on("dialog", (d) => {
      dialogs++;
      void d.dismiss();
    });
    await page.goto("/org/clients/new");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Region").fill("<img src=x onerror=alert(2)>");
    await page.getByRole("button", { name: "Add client" }).click();
    await expect(page).toHaveURL(/\/org\/clients\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(page.getByLabel("Name")).toHaveValue(name);
    expect(await page.locator("script:not([src]):not([type])").filter({ hasText: "alert(1)" }).count()).toBe(0);
    expect(await page.locator("img[src='x']").count()).toBe(0);
    expect(dialogs).toBe(0);
    await page.goto(`/org/clients?q=${encodeURIComponent("O'Brien")}`);
    await expect(page.locator("table tbody tr", { hasText: "O'Brien-Søren" })).toContainText("<script>");
    expect(dialogs).toBe(0);

    // 201 characters: refused. 10,000: refused the same way.
    for (const long of [`${prefix} ${"x".repeat(201 - prefix.length - 1)}`, `${prefix} ${"y".repeat(10_000)}`]) {
      await page.goto("/org/clients/new");
      await page.getByLabel("Name").fill(long);
      await page.getByRole("button", { name: "Add client" }).click();
      await expect(alertOf(page)).toContainText("Name is too long");
    }
    const { count } = await adminDb().from("clients").select("id", { count: "exact", head: true }).eq("organisation_id", ORG()).like("full_name", `${prefix} x%`);
    expect(count).toBe(0);
  });

  test("a date of birth in 1900, or in the year 2999, is refused", async ({ page }) => {
    // Fixed 2 Nov 2026: a birth date more than 120 years ago or in the future,
    // and a start date that far out, can't be right.
    for (const [label, dob] of [["Old", "1900-01-01"], ["Future", "2999-12-31"]] as const) {
      await page.goto("/org/clients/new");
      await page.getByLabel("Name").fill(`${prefix} ${label} Fakeclient`);
      await page.getByLabel("Date of birth").fill(dob);
      await page.getByLabel("Care started").fill(dob);
      await page.getByRole("button", { name: "Add client" }).click();
      await expect(alertOf(page)).toContainText("can't be right");
      await expect(page).toHaveURL(/\/org\/clients\/new$/);
    }
  });

  test("edits a client, ends their care, and the list moves them to 'ended'; there is no delete", async ({ page }) => {
    const name = `${prefix} Edited Fakeclient`;
    await page.goto("/org/clients/new");
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Add client" }).click();
    await expect(page).toHaveURL(/\/org\/clients\/[0-9a-f-]{36}$/);
    const id = page.url().split("/").pop()!;
    // Finding (Medium, intermittent): once in several runs the client page
    // answered "Something went wrong" (digest 1390903005) straight after the
    // add; a reload showed it fine, and 12 back-to-back fetches never
    // reproduced it. Noted and carried past, so the rest of the flow is checked.
    if (await page.getByText("Something went wrong").isVisible().catch(() => false)) {
      test.info().annotations.push({ type: "flaky-server-error", description: `/org/clients/${id} showed the error page right after adding` });
      await page.reload();
    }
    await page.getByLabel("Region").fill("South");
    await page.getByLabel("Funded by").selectOption("self");
    await expect(page.getByLabel("Which council")).toHaveCount(0);
    await page.getByLabel("Status").selectOption("ended");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/org/clients/${id}$`));
    await expect.poll(async () => (await adminDb().from("clients").select("region, funder_type, status").eq("id", id).single()).data).toEqual({ region: "South", funder_type: "self", status: "ended" });
    await page.goto(`/org/clients?q=${encodeURIComponent(name)}`);
    await expect(page.locator("table tbody tr", { hasText: name })).toHaveCount(0);
    await page.goto(`/org/clients?q=${encodeURIComponent(name)}&show=ended`);
    await expect(page.locator("table tbody tr", { hasText: name })).toHaveCount(1);
    // No way to remove a client from the UI: ending their care is the only exit.
    await page.goto(`/org/clients/${id}`);
    await expect(page.getByRole("button", { name: /delete|remove/i })).toHaveCount(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Spreadsheets: clients and staff
// ───────────────────────────────────────────────────────────────────────────

test.describe("spreadsheet uploads (manager)", () => {
  test.use({ storageState: session("testManager") });
  const prefix = `QA Sheet${tag}`;
  const madeEmails: string[] = [];
  test.afterAll(async () => {
    await adminDb().from("clients").delete().eq("organisation_id", ORG()).like("full_name", `${prefix}%`);
    for (const email of madeEmails) {
      const { data } = await adminDb().from("users").select("id").eq("email", email).maybeSingle();
      await deleteUser(data?.id as string | undefined);
    }
  });

  const csvFile = (name: string, text: string) => ({ name, mimeType: "text/csv", buffer: Buffer.from(text, "utf8") });

  test("the client template downloads as CSV with the columns the upload reads", async ({ page, baseURL }) => {
    const api = await playwrightRequest.newContext({ baseURL, storageState: session("testManager") });
    const res = await api.get("/org/clients/template");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/text\/csv/);
    expect(res.headers()["content-disposition"]).toContain('filename="client-list-template.csv"');
    const text = await res.text();
    expect(text.replace(/^﻿/, "").split(/\r?\n/)[0]).toBe("Name,Date of birth,Region,Postcode,Funder,Medication support,Start date,Status");
    await api.dispose();
    // The page's own button points at it.
    await page.goto("/org/clients/import");
    await expect(page.getByRole("link", { name: "Download the template" })).toHaveAttribute("href", "/org/clients/template");
  });

  test("a good file is previewed, bad rows are left out, and the counts match the database", async ({ page }) => {
    const a = `${prefix} Alpha Fakeclient`;
    const b = `${prefix} Beta Fakeclient`;
    const csv =
      "Name,Date of birth,Region,Postcode,Funder,Medication support,Start date,Status\r\n" +
      `${a},01/02/1940,East,M2 2BB,Fakeshire Council,Yes,25/10/2026,Active\r\n` +
      `${b},31/02/1950,East,,Self-funded,No,,Active\r\n` + // 31 February: not a date
      `${a},01/02/1940,East,M2 2BB,NHS,Yes,25/10/2026,Active\r\n` + // the same person twice
      `${prefix} Gamma Fakeclient,1/3/45,West,,,,,\r\n`;
    await page.goto("/org/clients/import");
    await page.locator("input[type=file]").setInputFiles(csvFile("clients.csv", csv));
    await expect(page.getByText(/3 clients ready to add, 1 with something to fix/)).toBeVisible();
    await expect(page.getByText(`Date of birth "31/02/1950" isn't a date`)).toBeVisible();
    await page.getByRole("button", { name: "Add 3 clients" }).click();
    const status = page.getByRole("status");
    await expect(status).toBeVisible({ timeout: 20_000 });
    // Alpha once, Gamma, and the repeat of Alpha left out alongside Beta.
    await expect(status).toContainText("2 added, 2 left out.");
    const { data: rows } = await adminDb().from("clients").select("full_name, date_of_birth, postcode, start_date, funder_type, medication_support").eq("organisation_id", ORG()).like("full_name", `${prefix}%`).order("full_name");
    expect(rows).toEqual([
      { full_name: a, date_of_birth: "1940-02-01", postcode: "M2 2BB", start_date: "2026-10-25", funder_type: "council", medication_support: true },
      { full_name: `${prefix} Gamma Fakeclient`, date_of_birth: "1945-03-01", postcode: null, start_date: null, funder_type: "council", medication_support: false },
    ]);
    // The list shows the clock-change day correctly.
    await page.goto(`/org/clients?q=${encodeURIComponent(a)}`);
    await expect(page.locator("table tbody tr", { hasText: a })).toContainText("25 Oct 2026");

    // The same file again updates rather than repeats.
    await page.goto("/org/clients/import");
    await page.locator("input[type=file]").setInputFiles(csvFile("clients.csv", csv));
    await page.getByRole("button", { name: "Add 3 clients" }).click();
    await expect(page.getByRole("status")).toContainText("0 added, 2 updated, 2 left out.", { timeout: 20_000 });
    const { count } = await adminDb().from("clients").select("id", { count: "exact", head: true }).eq("organisation_id", ORG()).like("full_name", `${prefix}%`);
    expect(count).toBe(2);
  });

  test("a file with the wrong columns, and an empty file, are refused before anything is saved", async ({ page }) => {
    await page.goto("/org/clients/import");
    await page.locator("input[type=file]").setInputFiles(csvFile("wrong.csv", "Foo,Bar\r\n1,2\r\n"));
    await expect(alertOf(page)).toContainText("Couldn't find a Name column");
    await expect(page.getByRole("button", { name: /^Add/ })).toHaveCount(0);
    await page.locator("input[type=file]").setInputFiles(csvFile("empty.csv", ""));
    await expect(alertOf(page)).toContainText("needs a header row and at least one client");
    await page.locator("input[type=file]").setInputFiles(csvFile("header-only.csv", "Name,Date of birth\r\n"));
    await expect(alertOf(page)).toContainText("needs a header row and at least one client");
  });

  test("the staff spreadsheet invites the valid rows and reports each failure", async ({ page }) => {
    const ok1 = `qa-run-${tag}-sheet1@example.com`;
    const ok2 = `qa-run-${tag}-sheet2@example.com`;
    madeEmails.push(ok1, ok2);
    const csv =
      "name,email,role\r\n" +
      `Run${tag} Sheet One Fakerun,${ok1},learner\r\n` +
      `Run${tag} Sheet Two Fakerun,${ok2},\r\n` +
      `Bad Email,not-an-email,learner\r\n` +
      `Already Here,${process.env.QA_TEST_STAFF_EMAIL},learner\r\n` +
      `Wants Console,qa-run-${tag}-sheet3@example.com,org_admin\r\n`;
    await page.goto("/org/learners/admin?section=invite");
    const bulk = page.locator("form", { hasText: "Bulk import" }).or(page.locator("form").filter({ has: page.locator("input[type=file]") }));
    await bulk.locator("input[type=file]").setInputFiles(csvFile("staff.csv", csv));
    await expect(page.getByText(/5 row\(s\) ready — 2 highlighted in red/)).toBeVisible();
    await page.getByRole("button", { name: "Invite 5 staff" }).click();
    await expect(page.getByText("2 invited, 3 failed.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("not-an-email: Not a valid email address")).toBeVisible();
    await expect(page.getByText(`${process.env.QA_TEST_STAFF_EMAIL}: Already has an account`)).toBeVisible();
    await expect(page.getByText(/sheet3@example.com: Console users are added from the Account page/)).toBeVisible();
    const { data: users } = await adminDb().from("users").select("email, role, organisation_id, full_name").in("email", [ok1, ok2]).order("email");
    expect(users).toEqual([
      { email: ok1, role: "learner", organisation_id: ORG(), full_name: `Run${tag} Sheet One Fakerun` },
      { email: ok2, role: "learner", organisation_id: ORG(), full_name: `Run${tag} Sheet Two Fakerun` },
    ]);
    const { count } = await adminDb().from("users").select("id", { count: "exact", head: true }).eq("email", `qa-run-${tag}-sheet3@example.com`);
    expect(count).toBe(0);
  });

  test("the staff spreadsheet with wrong columns or nothing in it", async ({ page }) => {
    await page.goto("/org/learners/admin?section=invite");
    const input = page.locator("form").filter({ has: page.locator("input[type=file]") }).locator("input[type=file]");
    await input.setInputFiles(csvFile("empty.csv", ""));
    await expect(page.getByText("The file is empty.")).toBeVisible();
    await input.setInputFiles(csvFile("wrong.csv", "Foo,Bar\r\nSomething,Else\r\n"));
    // Fixed 2 Nov 2026: a header row we don't recognise is refused up front, like the client upload.
    await expect(page.getByText(/Couldn't recognise the header row \("foo, bar"\)/)).toBeVisible();
    await input.setInputFiles(csvFile("noemail.csv", "name,phone\r\nJo,0161\r\n"));
    await expect(page.getByText("Couldn't find an email column. Use headers: name, email, role.")).toBeVisible();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Holidays, absence, probation, cases, leavers
// ───────────────────────────────────────────────────────────────────────────

test.describe("holidays", () => {
  test.use({ storageState: session("testManager") });
  let carer: Carer;
  test.beforeAll(async () => {
    carer = await makeCarer("holiday");
  });
  test.afterAll(async () => deleteUser(carer?.id));

  test("a carer asks; the manager approves one and declines another; Today and the allowance follow", async ({ page, browser }) => {
    test.setTimeout(120_000);
    // The manager sets their allowance on their file.
    await page.goto(`/org/staff/${carer.id}?section=employment&sub=holidays`);
    const allowance = page.getByLabel(/^Allowance for/);
    await allowance.fill("20");
    await page.locator("form", { has: allowance }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." }).first()).toBeVisible();
    await expect(page.getByText("20 days left")).toBeVisible();

    // The carer asks for two stretches of leave from their own page.
    const first = { from: day(1), to: day(2) };
    const second = { from: day(10), to: day(11) };
    const { context, page: mine } = await signIn(browser, carer.email, carer.password);
    await mine.goto("/learn/hr");
    await expect(mine.getByText("20 days left")).toBeVisible();
    const ask = async (from: string, to: string, amount: string) => {
      await mine.getByLabel("First day").fill(from);
      await mine.getByLabel("Last day").fill(to);
      await mine.getByLabel(/^How many/).fill(amount);
      await mine.getByRole("button", { name: "Ask for this leave" }).click();
    };
    // The last day before the first: the browser refuses it (the field's min is the first day).
    await ask(first.to, first.from, "2");
    expect(await mine.getByLabel("Last day").evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow)).toBe(true);
    await expect(mine.getByRole("status")).toHaveCount(0);
    // In the past: refused.
    await ask(day(-3), day(-2), "2");
    await expect(mine.getByRole("status")).toContainText("Ask for leave from today on");
    await ask(first.from, first.to, "2");
    await expect(mine.getByRole("status")).toContainText("Saved.");
    await expect(mine.getByText(`${uk(first.from)} to ${uk(first.to)}`)).toBeVisible();
    await expect(mine.getByText("waiting 2 days")).toBeVisible();
    await ask(second.from, second.to, "2");
    await expect(mine.getByRole("status")).toContainText("Saved.");
    await expect(mine.getByText("waiting 4 days")).toBeVisible();

    // The manager decides, from the Holidays page.
    const when = (iso: string) => uk(iso, { weekday: "short", day: "numeric", month: "short" });
    await page.goto("/org/hr/holidays");
    const requests = page.locator("section", { hasText: "Waiting for a decision" }).locator(".divide-y > div").filter({ hasText: carer.name });
    await expect(requests).toHaveCount(2);
    const row1 = requests.filter({ hasText: when(first.from) });
    // Who else is off those days (the seed's Lena Fakeholiday, when her leave falls here).
    await expect(row1).toContainText(/Nobody else is off then\.|Also off then: /);
    await row1.getByRole("button", { name: "Approve" }).click();
    await expect(requests).toHaveCount(1, { timeout: 15_000 });
    const row2 = requests.filter({ hasText: when(second.from) });
    await row2.getByRole("button", { name: "Decline…" }).click();
    // Declining needs a reason.
    await row2.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(row2.getByRole("status")).toContainText("Give the reason");
    await row2.getByPlaceholder("Why (it goes in their email)").fill("Too many off that week");
    await row2.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(requests).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("Off later this week").locator("..")).toContainText(carer.name);

    // What the database says.
    const { data: rows } = await adminDb().from("leave_requests").select("start_date, status, decision_note, amount").eq("user_id", carer.id).order("start_date");
    expect(rows).toEqual([
      { start_date: first.from, status: "approved", decision_note: null, amount: 2 },
      { start_date: second.from, status: "declined", decision_note: "Too many off that week", amount: 2 },
    ]);

    // Today's "Who's off this week" should list them too: see the next test,
    // which documents why it doesn't.

    // The allowance arithmetic: 20 given, 2 booked ahead, 18 left.
    await page.goto(`/org/staff/${carer.id}?section=employment&sub=holidays`);
    await expect(page.getByText("Taken 0 days · booked 2 days · 18 days left")).toBeVisible();
    await mine.reload();
    await expect(mine.getByText("18 days left")).toBeVisible();
    await expect(mine.getByText("booked 2 days")).toBeVisible();
    await expect(mine.getByText("Too many off that week")).toBeVisible();
    await expect(mine.getByText("Declined")).toBeVisible();
    await context.close();
  });
});

test.describe("Today's Who's off this week", () => {
  test.use({ storageState: session("testManager") });

  test("lists the people on approved leave or off sick this week", async ({ page }) => {
    // Was always "Nobody is on leave or off sick this week": the card's
    // users join was ambiguous (three foreign keys to users) and the error
    // went unread. The seed has Kai Fakesick off sick with no return date.
    await page.goto("/org");
    const strip = page.locator("section", { has: page.getByRole("heading", { name: "Who's off this week" }) });
    await expect(strip).toBeVisible();
    await expect(strip).not.toContainText("Nobody is on leave or off sick this week.");
    await expect(strip).toContainText("Kai Fakesick");
    await expect(strip).toContainText("off sick");
  });
});

test.describe("absence", () => {
  test.use({ storageState: session("testManager") });
  let carer: Carer;
  test.beforeAll(async () => {
    carer = await makeCarer("absence");
  });
  test.afterAll(async () => deleteUser(carer?.id));

  test("records a sickness with the checks, then the return-to-work interview", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/org/hr/absence");
    await page.locator("#ab-who").selectOption({ label: carer.name });
    // Back before they went off: refused.
    await page.locator("#ab-start").fill("2026-10-25");
    await page.locator("#ab-back").fill("2026-10-20");
    await page.locator("#ab-reason").selectOption("Cold, flu or COVID-19");
    await page.getByRole("button", { name: "Record the absence" }).click();
    await expect(page.getByRole("status")).toContainText("They came back after they went off");
    // No reason: refused.
    await page.locator("#ab-back").fill("2026-10-28");
    await page.locator("#ab-reason").selectOption("");
    await page.getByRole("button", { name: "Record the absence" }).click();
    await expect(page.getByRole("status")).toContainText("Choose the reason.");
    // 10,000 characters of detail, with HTML in it.
    await page.locator("#ab-reason").selectOption("Cold, flu or COVID-19");
    await page.locator("#ab-detail").fill(`<b>QA</b> ${"detail ".repeat(1500)}`);
    await page.getByRole("button", { name: "Record the absence" }).click();
    await expect(page.getByRole("status")).toContainText("Saved.");
    const absence = (await adminDb().from("sickness_absences").select("id, start_date, returned_on, reason, reason_detail, rtw_status").eq("user_id", carer.id).single()).data!;
    expect(absence).toMatchObject({ start_date: "2026-10-25", returned_on: "2026-10-28", reason: "Cold, flu or COVID-19", rtw_status: "none" });
    // Finding (Low): the detail box has no limit, and the server keeps the
    // first 1,000 characters without telling anyone the rest was dropped.
    expect((absence.reason_detail as string).length).toBe(1000);
    // The same dates again: refused as an overlap.
    await page.locator("#ab-who").selectOption({ label: carer.name });
    await page.locator("#ab-start").fill("2026-10-26");
    await page.locator("#ab-back").fill("2026-10-27");
    await page.locator("#ab-reason").selectOption("Other");
    await page.getByRole("button", { name: "Record the absence" }).click();
    await expect(page.getByRole("status")).toContainText("already have an absence over those dates");

    // Return to work due: it's listed, and the absence page reads in UK dates.
    await expect(page.locator("section", { hasText: "Return-to-work interviews due" })).toContainText(carer.name);
    await page.goto(`/org/hr/absence/${absence.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Absence: ${carer.name}`);
    await expect(page.getByText("Back 28 Oct 2026")).toBeVisible();
    await expect(page.getByText("from 25 Oct 2026")).toBeVisible();
    await expect(page.getByText("3 days")).toBeVisible();
    await expect(page.getByText("Due by 31 Oct 2026")).toBeVisible();
    expect(await page.locator("b", { hasText: "QA" }).count()).toBe(0);
    await expect(page.locator("#ab-detail")).toHaveValue(/^<b>QA<\/b> detail/);

    // Finishing with blanks is refused; then held.
    await page.getByRole("button", { name: "Finish the interview" }).click();
    await expect(page.getByRole("status")).toContainText("Some answers still need filling in.");
    await expect(alertOf(page).first()).toBeVisible();
    await page.getByLabel("How are they feeling now?").fill("Fine, fully recovered.");
    await page.getByRole("radiogroup", { name: "Is the reason recorded the right one?" }).getByRole("radio", { name: "Yes" }).click();
    await page.getByRole("radiogroup", { name: "Did they see a GP or go to hospital?" }).getByRole("radio", { name: "No" }).click();
    await page.getByRole("radiogroup", { name: "Was it caused or made worse by work?" }).getByRole("radio", { name: "No" }).click();
    await page.getByLabel("After sickness and diarrhoea").selectOption("Not applicable");
    await page.getByRole("radiogroup", { name: /Are they taking anything/ }).getByRole("radio", { name: "No" }).click();
    await page.getByRole("radiogroup", { name: "Are they fit to return to all their duties?" }).getByRole("radio", { name: "Yes" }).click();
    await page.getByRole("button", { name: "Finish the interview" }).click();
    await expect(page.getByRole("status")).toContainText("Finished.");
    await expect(page.getByText(`Held ${uk(today())}.`)).toBeVisible();
    await expect.poll(async () => (await adminDb().from("sickness_absences").select("rtw_status, rtw_held_on").eq("id", absence.id).single()).data).toEqual({ rtw_status: "held", rtw_held_on: today() });
  });
});

test.describe("probation", () => {
  test.use({ storageState: session("testManager") });
  let carer: Carer;
  test.beforeAll(async () => {
    carer = await makeCarer("probation");
  });
  test.afterAll(async () => deleteUser(carer?.id));

  test("a start date schedules the reviews; the first is booked, then held and finished", async ({ page }) => {
    test.setTimeout(120_000);
    const start = day(-45);
    await page.goto(`/org/staff/${carer.id}?section=employment`);
    await expect(page.getByText("Set their start date and their probation reviews appear here")).toBeVisible();
    await page.getByLabel("Start date").fill(start);
    await page.getByLabel("Job title").fill("Care worker");
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await expect(page.getByText("1-month review")).toBeVisible();
    await expect(page.getByText("3-month review")).toBeVisible();
    await expect(page.getByText("End of probation review")).toBeVisible();
    await expect(page.getByText("In probation")).toBeVisible();
    const line = page.locator("div", { has: page.getByText("1-month review", { exact: true }) }).filter({ has: page.getByRole("button", { name: "Book it" }) }).last();
    await expect(line).toContainText("Overdue");
    await line.getByRole("button", { name: "Book it" }).click();
    await line.getByLabel("Date").fill(day(2));
    await line.getByLabel("Time").fill("10:30");
    await line.getByRole("button", { name: "Book and tell them" }).click();
    await expect(line.getByRole("status")).toContainText("Booked.");
    await expect.poll(async () => (await adminDb().from("probation_reviews").select("status, booked_on, booked_time").eq("user_id", carer.id).single()).data).toEqual({ status: "booked", booked_on: day(2), booked_time: "10:30" });
    await page.reload();
    await expect(page.getByText(`booked ${uk(day(2))} at 10:30`)).toBeVisible();

    await page.getByRole("button", { name: "Hold the review" }).first().click();
    await expect(page).toHaveURL(/\/org\/hr\/probation\/review\/[0-9a-f-]{36}/, { timeout: 20_000 });
    // Finishing with nothing filled in is refused, with the fields marked.
    await page.getByRole("button", { name: /^Finish the review/ }).click();
    await expect(page.getByRole("status")).toContainText(/Choose the outcome|still need filling in/);
    for (const label of ["Quality of their care", "Attendance and timekeeping", "Care notes and records", "Training and induction", "Conduct, attitude and following policy", "Working with colleagues and the office"]) {
      await page.getByLabel(label).selectOption("What we expect");
    }
    await page.getByLabel("What's going well").fill("Punctual, kind, <i>records</i> complete.");
    await page.getByLabel("What was agreed").fill("Book the moving and handling refresher\nShadow a senior for one week");
    await page.getByLabel("On track").check();
    await page.getByRole("button", { name: /^Finish the review/ }).click();
    await expect(page).toHaveURL(new RegExp(`/org/staff/${carer.id}\\?section=employment`), { timeout: 20_000 });
    await expect(page.getByText(`held ${uk(today())} · On track`)).toBeVisible();
    await expect(page.getByRole("link", { name: "Read the review" })).toBeVisible();
    const review = (await adminDb().from("probation_reviews").select("status, outcome, held_on, answers").eq("user_id", carer.id).single()).data!;
    expect(review).toMatchObject({ status: "held", outcome: "on_track", held_on: today() });
    // What was agreed became actions on their file.
    const { data: actions } = await adminDb().from("record_actions").select("title").eq("user_id", carer.id).order("title");
    expect(actions?.map((a) => a.title)).toEqual(["Book the moving and handling refresher", "Shadow a senior for one week"]);
    // The held review reads back with the HTML as text.
    await page.getByRole("link", { name: "Read the review" }).click();
    await expect(page.getByLabel("What's going well")).toHaveValue("Punctual, kind, <i>records</i> complete.");
    await expect(page.getByText("This review has been finished.")).toBeVisible();
  });
});

test.describe("cases and leavers", () => {
  test.use({ storageState: session("testManager") });
  let carer: Carer;
  test.beforeAll(async () => {
    carer = await makeCarer("case");
  });
  test.afterAll(async () => deleteUser(carer?.id));

  test("opens a disciplinary case about them", async ({ page }) => {
    await page.goto(`/org/hr/cases/new?user=${carer.id}`);
    await expect(page.locator("#nc-who")).toHaveValue(carer.id);
    await page.getByRole("button", { name: "Open the case" }).click();
    await expect(page.getByRole("status")).toContainText("Write what the concern is.");
    const summary = `Late to two visits on ${uk(day(-3))}; <script>alert('x')</script> & "no call ahead".`;
    await page.locator("#nc-summary").fill(summary);
    await page.getByRole("button", { name: "Open the case" }).click();
    await expect(page).toHaveURL(/\/org\/hr\/cases\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(carer.name);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/DIS-\d{4}-\d{3}/);
    await expect(page.getByText(summary)).toBeVisible();
    const c = (await adminDb().from("hr_cases").select("kind, subtype, stage, summary, raised_on").eq("user_id", carer.id).single()).data!;
    expect(c).toMatchObject({ kind: "disciplinary", subtype: "conduct", summary, raised_on: today() });
    // On their file.
    await page.goto(`/org/staff/${carer.id}?section=employment&sub=cases`);
    await expect(page.getByText(/DIS-\d{4}-\d{3}/)).toBeVisible();
    await expect(page.getByText(`raised ${uk(today())}`)).toBeVisible();
  });

  test("records that they are leaving, with the date checks", async ({ page }) => {
    await page.goto("/org/hr/leavers");
    await page.locator("#lv-who").selectOption({ label: carer.name });
    await page.getByRole("button", { name: "Record that they're leaving" }).click();
    await expect(page.getByRole("status")).toContainText("Set their last working day.");
    await page.locator("#lv-last").fill(day(5));
    await page.locator("#lv-notice").fill(day(6));
    await page.getByRole("button", { name: "Record that they're leaving" }).click();
    await expect(page.getByRole("status")).toContainText("Notice is given before the last day.");
    await page.locator("#lv-notice").fill(day(-1));
    await page.locator("#lv-reason").selectOption("retired");
    await page.getByRole("button", { name: "Record that they're leaving" }).click();
    await expect(page).toHaveURL(/\/org\/hr\/leavers\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Leaving: ${carer.name}`);
    await expect(page.getByText(uk(day(5))).first()).toBeVisible();
    const l = (await adminDb().from("hr_leavers").select("reason, last_day, notice_on, login_off_at").eq("user_id", carer.id).single()).data!;
    expect(l).toEqual({ reason: "retired", last_day: day(5), notice_on: day(-1), login_off_at: null });
    // Only once.
    await page.goto("/org/hr/leavers");
    await expect(page.locator("#lv-who option", { hasText: carer.name })).toHaveCount(0);
    await page.goto(`/org/staff/${carer.id}?section=employment&sub=leaving`);
    await expect(page.getByText(`last day ${uk(day(5))}`)).toBeVisible();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. The office worker
// ───────────────────────────────────────────────────────────────────────────

test.describe("the office worker", () => {
  test.use({ storageState: session("testTrainer") });
  const prefix = `QA Office${tag}`;
  test.afterAll(async () => {
    await adminDb().from("clients").delete().eq("organisation_id", ORG()).like("full_name", `${prefix}%`);
  });

  test("opens the same people pages, but Settings and the Account page send them home", async ({ baseURL }) => {
    const api = await playwrightRequest.newContext({ baseURL, storageState: session("testTrainer") });
    for (const path of ["/org/learners/admin?section=invite", "/org/learners/admin", "/org/clients/new", "/org/clients/import", "/org/clients/template", "/org/hr/holidays", "/org/hr/absence", "/org/hr/probation", "/org/hr/cases/new", "/org/hr/leavers"]) {
      const res = await api.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
    }
    for (const path of ["/org/settings", "/org/settings/hr", "/org/billing"]) {
      const res = await api.get(path, { maxRedirects: 0 });
      const target = (res.headers()["location"] ?? "").replace(/^https?:\/\/[^/]+/, "");
      expect(res.status(), path).toBeGreaterThanOrEqual(300);
      expect(res.status(), path).toBeLessThan(400);
      expect(target, path).toMatch(/^\/org(\?|$)/);
    }
    await api.dispose();
  });

  test("adds a client and sees the staff list, where managers are read-only to them", async ({ page }) => {
    const name = `${prefix} Fakeclient`;
    await page.goto("/org/clients/new");
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Add client" }).click();
    await expect(page).toHaveURL(/\/org\/clients\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await page.goto("/org/learners/admin");
    const manager = page.locator("table tbody tr", { hasText: process.env.QA_TEST_MANAGER_EMAIL! });
    await expect(manager).toContainText("Manager only");
    await expect(manager.getByRole("button", { name: "Delete" })).toHaveCount(0);
    const carer = page.locator("table tbody tr", { hasText: process.env.QA_TEST_STAFF_EMAIL! });
    await expect(carer.getByRole("button", { name: "Deactivate" })).toBeVisible();
    // Cases: office workers see and open them, as managers do (Saj, 2 Nov 2026).
    await page.goto("/org/hr/cases/new");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Open a case");
    await expect(page.getByText(/can open a case/)).toHaveCount(0);
    await expect(page.locator("form")).toBeVisible();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. At a phone's width
// ───────────────────────────────────────────────────────────────────────────

test.describe("@mobile the forms at 390px", () => {
  test.use({ storageState: session("testManager"), viewport: { width: 390, height: 844 } });
  const made: string[] = [];
  // Cleaned up here rather than in the test, which a timeout can cut short.
  test.afterAll(async () => {
    for (const id of made) await deleteUser(id).catch(() => undefined);
  });

  /** No sideways scroll, and the button is on screen and at least 44px tall. */
  async function usable(page: Page, button: ReturnType<Page["getByRole"]>, what: string): Promise<string[]> {
    const notes: string[] = [];
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > 390) notes.push(`${what}: page scrolls sideways (${scrollWidth}px)`);
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    expect(box, `${what}: button missing`).not.toBeNull();
    if (box!.x < 0 || box!.x + box!.width > 390) notes.push(`${what}: button cut off (x ${Math.round(box!.x)}, w ${Math.round(box!.width)})`);
    if (box!.height < 44) notes.push(`${what}: button ${Math.round(box!.height)}px tall, under 44`);
    return notes;
  }

  test("@mobile invite, client, leave, absence and leaver forms fit and can be submitted", async ({ page }) => {
    const notes: string[] = [];
    await page.goto("/org/learners/admin?section=invite");
    notes.push(...(await usable(page, page.getByRole("button", { name: "Invite staff member" }), "invite")));
    notes.push(...(await usable(page, page.getByRole("button", { name: "Invite staff" }).last(), "bulk import")));
    await page.goto("/org/clients/new");
    notes.push(...(await usable(page, page.getByRole("button", { name: "Add client" }), "client")));
    await page.goto("/org/clients/import");
    notes.push(...(await usable(page, page.getByRole("link", { name: "Download the template" }), "client template")));
    await page.goto("/org/hr/holidays");
    notes.push(...(await usable(page, page.getByRole("button", { name: "Add the leave" }), "leave")));
    await page.goto("/org/hr/absence");
    notes.push(...(await usable(page, page.getByRole("button", { name: "Record the absence" }), "absence")));
    await page.goto("/org/hr/leavers");
    notes.push(...(await usable(page, page.getByRole("button", { name: "Record that they're leaving" }), "leaver")));
    await page.goto("/org/hr/cases/new");
    notes.push(...(await usable(page, page.getByRole("button", { name: "Open the case" }), "case")));
    // The staff list's own buttons on the phone cards.
    await page.goto("/org/learners/admin");
    const card = page.locator("div.rounded-xl.border", { hasText: process.env.QA_TEST_STAFF_EMAIL! });
    notes.push(...(await usable(page, card.getByRole("button", { name: "Deactivate" }), "staff card deactivate")));
    notes.push(...(await usable(page, card.getByRole("button", { name: "Delete" }), "staff card delete")));
    // Nothing may be cut off; the 44px targets are reported (see the findings).
    expect(notes.filter((n) => /cut off|sideways/.test(n))).toEqual([]);
    test.info().annotations.push({ type: "touch-targets", description: notes.join("; ") || "all at least 44px" });
    console.log("[mobile] " + (notes.join("; ") || "all at least 44px"));
  });

  test("@mobile a carer can ask for leave on a phone", async ({ browser }) => {
    const carer = await makeCarer("mobile");
    made.push(carer.id);
    {
      const { context, page } = await signIn(browser, carer.email, carer.password, true, { viewport: { width: 390, height: 844 } });
      await page.goto("/learn/hr");
      const button = page.getByRole("button", { name: "Ask for this leave" });
      const notes = await usable(page, button, "carer leave");
      await page.getByLabel("First day").fill(day(3));
      await page.getByLabel("Last day").fill(day(3));
      await page.getByLabel(/^How many/).fill("1");
      await button.click();
      await expect(page.getByRole("status")).toContainText("Saved.");
      await expect(page.getByText("Waiting")).toBeVisible();
      expect(notes.filter((n) => /cut off|sideways/.test(n))).toEqual([]);
      console.log("[mobile] " + (notes.join("; ") || "carer leave button at least 44px"));
      await context.close();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Temporary passwords (ACCOUNT-ACCESS.md)
// ───────────────────────────────────────────────────────────────────────────

test.describe("a temporary password (manager)", () => {
  // In order: the second test looks at the carer the first one makes.
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: session("testManager") });
  let userId: string | undefined;
  test.afterAll(async () => deleteUser(userId));

  test("a manager gives one to a carer who never opened the invitation; the carer must choose their own", async ({ page, browser }) => {
    // Invited, never opened: an unconfirmed account with no password.
    const email = `qa-run-${tag}-temp@example.com`;
    const name = `Run${tag} Temp Fakerun`;
    const { data, error } = await adminDb().auth.admin.generateLink({
      type: "invite",
      email,
      options: { data: { role: "learner", organisation_id: ORG(), full_name: name } },
    });
    if (error || !data.user) throw new Error(`invite ${email}: ${error?.message}`);
    userId = data.user.id;
    await expect.poll(async () => (await adminDb().from("users").select("id").eq("id", userId!).maybeSingle()).data?.id).toBe(userId);

    await page.goto(`/org/staff/${userId}`);
    const card = page.getByRole("region", { name: "Signing in" });
    await expect(card).toContainText("Never signed in");
    await card.getByRole("button", { name: "Set temporary password" }).click();
    const shown = card.locator(".font-mono");
    await expect(shown).toHaveText(/^[A-Z][a-z]{2}\d-[A-Z][a-z]{2}\d-[A-Z][a-z]{2}\d$/, { timeout: 20_000 });
    const temporary = (await shown.textContent())!.trim();

    // The carer signs in with it and is held on "Choose your own password".
    const { context, page: them } = await signIn(browser, email, temporary);
    await them.waitForURL(/\/auth\/set-password/);
    await expect(them.getByRole("heading", { name: "Choose your own password" })).toBeVisible();
    await them.goto("/learn");
    await expect(them).toHaveURL(/\/auth\/set-password/);

    const own = `Own!${tag}Pw-77`;
    await them.getByLabel("New password").fill(own);
    await them.getByLabel("Confirm password").fill(own);
    await them.getByRole("button", { name: "Set password & continue" }).click();
    await expect(them).toHaveURL(/\/learn(\/|$|\?)/, { timeout: 30_000 });
    await them.goto("/learn");
    await expect(them).toHaveURL(/\/learn(\/|$|\?)/);
    await context.close();

    // The temporary one no longer works; their own does.
    const old = await signIn(browser, email, temporary, false);
    await expect(old.page.getByRole("alert").filter({ hasText: /don't match/ })).toBeVisible();
    await old.context.close();
    const mine = await signIn(browser, email, own);
    await expect(mine.page).toHaveURL(/\/learn(\/|$|\?)/);
    await mine.context.close();
  });

  test("an office worker doesn't get the button", async ({ browser }) => {
    test.skip(!userId, "needs the carer from the test above");
    const context = await browser.newContext({ storageState: session("testTrainer") });
    const page = await context.newPage();
    await page.goto(`/org/staff/${userId}`);
    await expect(page.getByRole("heading", { name: /Run.* Temp Fakerun/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Signing in" })).toHaveCount(0);
    await context.close();
  });
});
