"use server";

import { STAFF_ROLES } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvite } from "@/lib/invites";
import { anonymiseUserRecords, purgeUserFiles } from "@/lib/user-erasure";
import { logAudit } from "@/lib/audit";
import { fetchAll } from "@/lib/fetch-all";
import { endOfMonthISO, type AssignCsvRow } from "@/lib/assign";
import { emailAssignees } from "@/lib/assignment-email";
import { siteOrigin } from "@/lib/site-url";
import type { InviteState, SaveState } from "@/app/platform/actions";
import type { UserRole } from "@/lib/auth";

const INVITABLE_ROLES: UserRole[] = ["learner", "org_admin", "org_office"];
const ROLE_LABELS: Record<string, string> = {
  learner: "learner",
  org_admin: "manager",
  org_office: "office worker",
};

/** A console role is given from the Account page, by a manager. */
function canGrant(role: UserRole, context: { role: UserRole | null }): boolean {
  return role === "learner" || context.role === "org_admin";
}

/**
 * Invite a learner — or, from the Account page, a manager or office worker —
 * into the caller's own organisation.
 */
export async function inviteStaffAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const context = await requireConsole();

  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "learner") as UserRole;

  if (!email) return { ok: false, error: "Email is required." };
  if (!INVITABLE_ROLES.includes(role)) {
    return { ok: false, error: "Invalid role." };
  }
  if (!canGrant(role, context)) {
    return { ok: false, error: "Only a manager can add console users — from the Account page." };
  }
  if (!context.organisationId) {
    return { ok: false, error: "Your account has no organisation." };
  }

  try {
    const result = await createInvite({
      email,
      role,
      organisationId: context.organisationId,
      fullName: name,
      roleLabel: ROLE_LABELS[role],
    });
    await logAudit({
      context,
      action: "user.invited",
      entity: "user",
      detail: { email, role },
    });
    revalidatePath("/org");
    revalidatePath("/org/learners");
    revalidatePath("/org/learners/admin");
    return {
      ok: true,
      sent: result.sent,
      link: result.sent ? undefined : result.link,
      email,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to send invite.",
    };
  }
}

/**
 * Why a console user cannot be deactivated or deleted by this caller, or null.
 * Only a manager may act on a manager or office worker, and the organisation
 * always keeps one active manager — nobody else can add another.
 */
async function consoleTargetBlock(
  admin: ReturnType<typeof createAdminClient>,
  context: { role: UserRole | null; organisationId: string | null },
  targetRole: UserRole,
  removing: boolean,
): Promise<string | null> {
  if (targetRole === "learner") return null;
  if (context.role !== "org_admin") {
    return "Only a manager can change another console user — from the Account page.";
  }
  if (removing && targetRole === "org_admin") {
    const { count } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", context.organisationId!)
      .eq("role", "org_admin")
      .eq("status", "active");
    if ((count ?? 0) <= 1) return "This is your organisation's only manager — make someone else a manager first.";
  }
  return null;
}

/** Deactivate or reactivate a staff member within the caller's organisation. */
export async function setStaffStatusAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireConsole();

  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["active", "deactivated"].includes(status)) {
    return { ok: false, error: "Invalid status." };
  }
  if (userId === context.userId) {
    return { ok: false, error: "You cannot change your own status." };
  }

  const admin = createAdminClient();

  // Scope check: the target must belong to the caller's organisation.
  const { data: target } = await admin
    .from("users")
    .select("organisation_id, role")
    .eq("id", userId)
    .single();
  if (!target || target.organisation_id !== context.organisationId) {
    return { ok: false, error: "Staff member not found in your organisation." };
  }
  const blocked = await consoleTargetBlock(admin, context, target.role as UserRole, status === "deactivated");
  if (blocked) return { ok: false, error: blocked };

  const { error } = await admin
    .from("users")
    .update({ status })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  // Also block/unblock at the auth layer.
  await admin.auth.admin.updateUserById(userId, {
    ban_duration: status === "deactivated" ? "876000h" : "none",
  });

  await logAudit({
    context,
    action: status === "deactivated" ? "staff.deactivated" : "staff.reactivated",
    entity: "user",
    entityId: userId,
  });

  revalidatePath("/org");
  revalidatePath("/org/learners");
  revalidatePath("/org/learners/admin");
  return { ok: true };
}

/** Permanently delete a staff member from the caller's organisation (issue #14). */
export async function deleteStaffAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireConsole();

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { ok: false, error: "Missing staff member." };
  if (userId === context.userId) {
    return { ok: false, error: "You cannot delete your own account." };
  }

  const admin = createAdminClient();

  // Scope check: the target must belong to the caller's organisation.
  const { data: target } = await admin
    .from("users")
    .select("organisation_id, email, role")
    .eq("id", userId)
    .single();
  if (!target || target.organisation_id !== context.organisationId) {
    return { ok: false, error: "Staff member not found in your organisation." };
  }
  const blocked = await consoleTargetBlock(admin, context, target.role as UserRole, true);
  if (blocked) return { ok: false, error: blocked };

  // Stored files first: the rows naming their paths cascade away with the
  // account, so after the delete there is nothing left pointing at them and
  // the PDFs would sit in the buckets unreachable and unattributable.
  const purge = await purgeUserFiles(admin, userId);
  // Their address also sits in rows the cascade can't reach; strip it while
  // user_id still resolves.
  const anon = await anonymiseUserRecords(admin, userId, target.email);

  // Deleting the auth user cascades to the profile and their training records.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    context,
    action: "staff.deleted",
    entity: "user",
    entityId: userId,
    detail: {
      email: target.email,
      role: target.role,
      // Recorded whether or not removal worked — if storage failed, this is
      // the only remaining record of what to clean up by hand.
      filesFound: purge.found,
      filesRemoved: purge.removed,
      fileFailures: purge.failures,
      anonymised: anon,
    },
  });

  revalidatePath("/org");
  revalidatePath("/org/learners");
  revalidatePath("/org/learners/admin");
  return { ok: true };
}

export interface BulkState {
  ok?: boolean;
  error?: string;
  created?: number;
  failures?: { email: string; error: string }[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Bulk-invite staff from parsed CSV rows (name,email,role). */
export async function bulkInviteStaffAction(
  _prev: BulkState,
  formData: FormData,
): Promise<BulkState> {
  const context = await requireConsole();
  if (!context.organisationId) {
    return { ok: false, error: "Your account has no organisation." };
  }

  let rows: { name?: string; email?: string; role?: string }[];
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the CSV." };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows found in the CSV." };
  }

  const admin = createAdminClient();
  let created = 0;
  const failures: { email: string; error: string }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const email = (row.email ?? "").trim().toLowerCase();
    const role = ((row.role ?? "learner").trim().toLowerCase() || "learner") as UserRole;
    if (!email) continue;
    if (seen.has(email)) continue; // duplicate row in the file
    seen.add(email);
    if (!EMAIL_RE.test(email)) {
      failures.push({ email, error: "Not a valid email address" });
      continue;
    }
    if (role !== "learner") {
      failures.push({ email, error: "Console users are added from the Account page" });
      continue;
    }
    try {
      const invite = await createInvite({
        email,
        role,
        organisationId: context.organisationId,
        fullName: (row.name ?? "").trim(),
        roleLabel: ROLE_LABELS[role],
      });

      // Belt and braces (issue #16): confirm the profile row exists with the
      // right organisation — the DB trigger normally creates it, but if it
      // didn't, repair it here so the person can't end up org-less.
      if (invite.userId) {
        const { data: profile } = await admin
          .from("users")
          .select("id, organisation_id")
          .eq("id", invite.userId)
          .maybeSingle();
        if (!profile) {
          await admin.from("users").insert({
            id: invite.userId,
            email,
            full_name: (row.name ?? "").trim() || email,
            role,
            organisation_id: context.organisationId,
          });
        } else if (!profile.organisation_id) {
          await admin
            .from("users")
            .update({ organisation_id: context.organisationId, role })
            .eq("id", invite.userId);
        }
      }
      created += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      failures.push({
        email,
        error: /already.*(registered|exists)/i.test(msg)
          ? "Already has an account"
          : msg,
      });
    }
  }

  await logAudit({
    context,
    action: "staff.bulk_invited",
    entity: "user",
    detail: { created, failed: failures.length },
  });

  revalidatePath("/org");
  revalidatePath("/org/learners");
  revalidatePath("/org/learners/admin");
  return { ok: true, created, failures };
}

export interface AssignState {
  ok?: boolean;
  error?: string;
  count?: number;
  /** People and courses, so the form can say it in plain words. */
  learners?: number;
  courses?: number;
  dueDate?: string;
}

/**
 * Assign a course or a whole pathway to staff, with an optional due date.
 * Creates enrolments (idempotent — re-assigning keeps existing progress).
 */
export async function assignTrainingAction(
  _prev: AssignState,
  formData: FormData,
): Promise<AssignState> {
  const context = await requireConsole();
  if (!context.organisationId) {
    return { ok: false, error: "Your account has no organisation." };
  }

  // Every assignment carries a due date; default is end of the current month.
  const dueDate = String(formData.get("dueDate") ?? "").trim() || endOfMonthISO();
  const pathwayId = String(formData.get("pathway") ?? "").trim();
  const selectedCourseIds = formData.getAll("courseIds").map(String).filter(Boolean);
  const allCarers = String(formData.get("all") ?? "") !== "";
  const selectedUserIds = formData.getAll("userIds").map(String);

  const supabase = await createClient();

  // Resolve to a concrete set of course ids (selected courses ∪ pathway courses).
  const courseIdSet = new Set<string>(selectedCourseIds);
  if (pathwayId) {
    const { data } = await supabase
      .from("pathway_courses")
      .select("course_id")
      .eq("pathway_id", pathwayId);
    for (const r of data ?? []) courseIdSet.add(r.course_id as string);
  }
  const courseIds = [...courseIdSet];
  if (courseIds.length === 0) {
    return { ok: false, error: "Choose at least one course or a pathway." };
  }

  // Resolve the target learners. "All carers" = every active learner in the org
  // (RLS scopes the read to the caller's org).
  let userIds: string[];
  if (allCarers) {
    // Paged: an organisation past 1,000 carers would otherwise be silently
    // half-assigned. The organisation filter lets Postgres use its index
    // instead of testing RLS on every user row.
    const data = await fetchAll((f, t) =>
      supabase
        .from("users")
        .select("id")
        .eq("organisation_id", context.organisationId!)
        // "All carers" means the carers: office staff are picked by name.
        .eq("role", "learner")
        .eq("status", "active")
        .order("id")
        .range(f, t),
    );
    userIds = data.map((u) => u.id as string);
  } else {
    if (selectedUserIds.length === 0) {
      return { ok: false, error: "Select at least one carer, or tick 'all carers'." };
    }
    // Members of staff only, checked here: a filtered <select> is not a
    // permission check (issues #35, #36). Since 29 Oct 2026 that includes
    // office staff and managers, who have training too.
    // Checked a hundred at a time: the ids travel in the URL, and a long
    // enough list is refused outright.
    userIds = [];
    for (const chunk of chunks(selectedUserIds)) {
      const { data: orgUsers } = await supabase
        .from("users")
        .select("id")
        .eq("organisation_id", context.organisationId)
        .in("id", chunk)
        .in("role", STAFF_ROLES)
        .eq("status", "active");
      userIds.push(...(orgUsers ?? []).map((u) => u.id as string));
    }
  }
  if (userIds.length === 0) {
    return { ok: false, error: "No valid carers selected." };
  }

  const rows = [];
  for (const uid of userIds) {
    for (const cid of courseIds) {
      rows.push({
        organisation_id: context.organisationId,
        user_id: uid,
        course_id: cid,
        due_date: dueDate,
      });
    }
  }
  if (rows.length === 0) {
    return { ok: false, error: "No valid staff selected." };
  }

  const { error } = await supabase
    .from("enrolments")
    .upsert(rows, { onConflict: "user_id,course_id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/org");
  revalidatePath("/org/learners");
  revalidatePath("/org/learners/admin");
  await logAudit({
    context,
    action: "training.assigned",
    entity: "enrolment",
    detail: { courses: courseIds.length, learners: userIds.length, dueDate },
  });

  // One email per carer naming what they were given, after the response so a
  // large assign is not held up by the mail provider.
  const origin = await siteOrigin();
  const organisationId = context.organisationId;
  after(async () => {
    const admin = createAdminClient();
    const { data: courses } = await admin.from("courses").select("title").in("id", courseIds.slice(0, 100));
    const titles = (courses ?? []).map((c) => c.title as string);
    const title =
      titles.length === 1
        ? titles[0]
        : `${courseIds.length} courses${titles.length ? ` (${titles.slice(0, 5).join(", ")}${courseIds.length > 5 ? ", …" : ""})` : ""}`;
    await emailAssignees(
      admin,
      "training_assigned",
      userIds.map((userId) => ({ userId, title, dueDate, href: "/learn/modules" })),
      { organisationId, assignedBy: context.userId, origin },
    );
  });

  revalidatePath("/learn");
  // Assigning from a carer's own page: refresh that page too. One pattern
  // call — "all carers" used to make one per person in the organisation.
  revalidatePath("/org/staff/[userId]", "page");
  return {
    ok: true,
    count: rows.length,
    learners: userIds.length,
    courses: courseIds.length,
    dueDate,
  };
}

export interface BulkAssignState {
  ok?: boolean;
  error?: string;
  assigned?: number;
  failures?: { line: string; error: string }[];
}

/**
 * Bulk-assign courses from parsed CSV rows (email, course title, optional due
 * date — defaults to end of the current month). Upserts enrolments, so
 * re-running a file never wipes progress.
 */
export async function bulkAssignTrainingAction(
  _prev: BulkAssignState,
  formData: FormData,
): Promise<BulkAssignState> {
  const context = await requireConsole();
  if (!context.organisationId) {
    return { ok: false, error: "Your account has no organisation." };
  }

  let rows: AssignCsvRow[];
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the CSV." };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows found in the CSV." };
  }

  const supabase = await createClient();
  const [{ data: users }, { data: courses }] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from("users")
        .select("id, email")
        .eq("organisation_id", context.organisationId!)
        .in("role", STAFF_ROLES)
        .order("id")
        .range(f, t),
    ).then((data) => ({ data })),
    supabase.from("courses").select("id, title"),
  ]);
  const userByEmail = new Map(
    (users ?? []).map((u) => [String(u.email).toLowerCase(), u.id as string]),
  );
  const courseByTitle = new Map(
    (courses ?? []).map((c) => [String(c.title).toLowerCase(), c.id as string]),
  );

  const defaultDue = endOfMonthISO();
  const upserts = [];
  const failures: { line: string; error: string }[] = [];
  for (const row of rows) {
    const line = `${row.email} → ${row.course}`;
    if (row.problem) {
      failures.push({ line, error: row.problem });
      continue;
    }
    const userId = userByEmail.get(row.email.toLowerCase());
    if (!userId) {
      failures.push({ line, error: "No learner with that email in your organisation" });
      continue;
    }
    const courseId = courseByTitle.get(row.course.toLowerCase());
    if (!courseId) {
      failures.push({ line, error: "No course with that exact title" });
      continue;
    }
    upserts.push({
      organisation_id: context.organisationId,
      user_id: userId,
      course_id: courseId,
      due_date: row.dueDate ?? defaultDue,
    });
  }

  if (upserts.length > 0) {
    const { error } = await supabase
      .from("enrolments")
      .upsert(upserts, { onConflict: "user_id,course_id" });
    if (error) return { ok: false, error: error.message, failures };

    // One email per carer for everything the file gave them, as Assign
    // training does — after the response, so a long file is not held up.
    const titleOf = new Map((courses ?? []).map((c) => [c.id as string, c.title as string]));
    const perUser = new Map<string, { titles: string[]; due: string }>();
    for (const u of upserts) {
      const entry = perUser.get(u.user_id) ?? { titles: [], due: u.due_date };
      entry.titles.push(titleOf.get(u.course_id) ?? "a course");
      if (u.due_date < entry.due) entry.due = u.due_date;
      perUser.set(u.user_id, entry);
    }
    const origin = await siteOrigin();
    const organisationId = context.organisationId;
    after(() =>
      emailAssignees(
        createAdminClient(),
        "training_assigned",
        [...perUser].map(([userId, e]) => ({
          userId,
          title: e.titles.length === 1 ? e.titles[0] : `${e.titles.length} courses (${e.titles.slice(0, 5).join(", ")}${e.titles.length > 5 ? ", …" : ""})`,
          dueDate: e.due,
          href: "/learn/modules",
        })),
        { organisationId, assignedBy: context.userId, origin },
      ),
    );
  }

  await logAudit({
    context,
    action: "training.bulk_assigned",
    entity: "enrolment",
    detail: { assigned: upserts.length, failed: failures.length },
  });

  revalidatePath("/org");
  revalidatePath("/org/learners");
  revalidatePath("/org/learners/admin");
  revalidatePath("/learn");
  return { ok: true, assigned: upserts.length, failures };
}

/** Statuses an enrolment can be removed from — see unassignTrainingAction. */
const UNASSIGNABLE = ["not_started", "in_progress"];

/**
 * Take a course back off a learner (issue #36).
 *
 * Training could be assigned but never un-assigned — there was no delete path
 * for an enrolment anywhere in the product — so a mistake was permanent.
 *
 * Only while not started or in progress. A completed enrolment is a training
 * record on a compliance product, and its certificate lives in a separate
 * table that would survive the delete, leaving a certificate for training the
 * system no longer believes happened. "expired" is blocked for the same
 * reason: it means they DID complete it once and it has since lapsed.
 */
export async function unassignTrainingAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireConsole();
  if (!context.organisationId) {
    return { ok: false, error: "Your account has no organisation." };
  }

  const userId = String(formData.get("userId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  if (!userId || !courseId) return { ok: false, error: "Missing enrolment." };

  const admin = createAdminClient();
  const { data: enrolment } = await admin
    .from("enrolments")
    .select("id, status, organisation_id, courses(title)")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();

  // Service-role read: this check is what keeps organisations apart.
  if (!enrolment || enrolment.organisation_id !== context.organisationId) {
    return { ok: false, error: "That training isn't assigned in your organisation." };
  }
  if (!UNASSIGNABLE.includes(enrolment.status as string)) {
    return {
      ok: false,
      error:
        enrolment.status === "completed"
          ? "This course has been completed — removing it would delete the training record. Completed training can't be unassigned."
          : "This course was completed once and has since expired, so it's part of the training record and can't be unassigned.",
    };
  }

  const { error } = await admin
    .from("enrolments")
    .delete()
    .eq("id", enrolment.id);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    context,
    action: "training.unassigned",
    entity: "enrolment",
    entityId: enrolment.id as string,
    detail: {
      userId,
      courseId,
      course: (enrolment.courses as unknown as { title?: string } | null)?.title,
      status: enrolment.status,
    },
  });

  revalidatePath(`/org/staff/${userId}`);
  revalidatePath("/org");
  revalidatePath("/org/learners");
  revalidatePath("/org/learners/admin");
  revalidatePath("/learn");
  return { ok: true };
}


export interface BulkEnrolmentState {
  ok?: boolean;
  error?: string;
  /** What happened, in numbers the form can put in a sentence. */
  changed?: number;
  refused?: number;
}

/** "user:course" pairs, as the tables emit them. */
function pairsFrom(formData: FormData): { userId: string; courseId: string }[] {
  return formData
    .getAll("pairs")
    .map(String)
    .map((p) => {
      const [userId, courseId] = p.split(":");
      return { userId, courseId };
    })
    .filter((p) => p.userId && p.courseId);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** PostgREST puts `.in()` lists in the URL; past ~390 ids it is refused. */
const IN_CHUNK = 100;
const chunks = <T,>(xs: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += IN_CHUNK) out.push(xs.slice(i, i + IN_CHUNK));
  return out;
};

/**
 * The enrolments behind a set of "user:course" pairs, in this organisation
 * only, keyed by pair. The bulk actions used to read (and then write) one
 * enrolment per round trip — two hundred ticked rows were four hundred
 * sequential requests. A pair that isn't found here is either not enrolled or
 * belongs to another organisation; both are refused. Service-role reads: the
 * organisation_id filter is what keeps organisations apart.
 */
async function enrolmentsForPairs(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  pairs: { userId: string; courseId: string }[],
): Promise<Map<string, { id: string; status: string }>> {
  const valid = pairs.filter((p) => UUID.test(p.userId) && UUID.test(p.courseId));
  const userIds = [...new Set(valid.map((p) => p.userId))];
  const courseIds = [...new Set(valid.map((p) => p.courseId))];
  const wanted = new Set(valid.map((p) => `${p.userId}:${p.courseId}`));
  const found = new Map<string, { id: string; status: string }>();
  for (const users of chunks(userIds)) {
    for (const courses of chunks(courseIds)) {
      const rows = await fetchAll((f, t) =>
        admin
          .from("enrolments")
          .select("id, user_id, course_id, status")
          .eq("organisation_id", organisationId)
          .in("user_id", users)
          .in("course_id", courses)
          .order("id")
          .range(f, t),
      );
      for (const r of rows) {
        const key = `${r.user_id}:${r.course_id}`;
        if (wanted.has(key)) found.set(key, { id: r.id as string, status: r.status as string });
      }
    }
  }
  return found;
}

/**
 * Unassign several courses at once.
 *
 * Assigning the wrong course to fifty carers took one click; taking it back
 * took fifty page visits and fifty confirmations (usability audit, 7 Oct
 * 2026). Same rule as the single unassign: completed and expired training is
 * a record and stays — those rows are refused and counted, not silently
 * skipped.
 */
export async function bulkUnassignAction(
  _prev: BulkEnrolmentState,
  formData: FormData,
): Promise<BulkEnrolmentState> {
  const context = await requireConsole();
  if (!context.organisationId) {
    return { ok: false, error: "Your account has no organisation." };
  }
  const pairs = pairsFrom(formData);
  if (pairs.length === 0) return { ok: false, error: "Nothing selected." };

  const admin = createAdminClient();
  const found = await enrolmentsForPairs(admin, context.organisationId, pairs);
  const keys = new Set(pairs.map((p) => `${p.userId}:${p.courseId}`));
  const ids = [...keys]
    .map((k) => found.get(k))
    .filter((e): e is { id: string; status: string } => !!e && UNASSIGNABLE.includes(e.status))
    .map((e) => e.id);
  let changed = 0;
  // One delete per hundred rows, not one per row. The status test is repeated
  // in the delete so a course completed since the read above is left alone;
  // what comes back is what actually went.
  for (const chunk of chunks(ids)) {
    const { data } = await admin
      .from("enrolments")
      .delete()
      .eq("organisation_id", context.organisationId)
      .in("id", chunk)
      .in("status", UNASSIGNABLE)
      .select("id");
    changed += data?.length ?? 0;
  }
  const refused = keys.size - changed;

  await logAudit({
    context,
    action: "training.unassigned",
    entity: "enrolment",
    detail: { bulk: true, removed: changed, refused },
  });

  revalidatePath("/org");
  revalidatePath("/org/learners");
  revalidatePath("/org/learners/statistics");
  revalidatePath("/learn");
  // Every carer page at once, rather than one call per ticked row.
  revalidatePath("/org/staff/[userId]", "page");
  return { ok: true, changed, refused };
}

/**
 * Move the due date on several assignments at once — pushing a deadline for a
 * group used to mean re-running the whole assign form. Completed training is
 * left alone: its due date is part of what "completed late" was judged on.
 */
export async function bulkDueDateAction(
  _prev: BulkEnrolmentState,
  formData: FormData,
): Promise<BulkEnrolmentState> {
  const context = await requireConsole();
  if (!context.organisationId) {
    return { ok: false, error: "Your account has no organisation." };
  }
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { ok: false, error: "Choose a due date." };
  }
  const pairs = pairsFrom(formData);
  if (pairs.length === 0) return { ok: false, error: "Nothing selected." };

  const admin = createAdminClient();
  const found = await enrolmentsForPairs(admin, context.organisationId, pairs);
  const keys = new Set(pairs.map((p) => `${p.userId}:${p.courseId}`));
  const ids = [...keys]
    .map((k) => found.get(k))
    .filter((e): e is { id: string; status: string } => !!e && e.status !== "completed")
    .map((e) => e.id);
  let changed = 0;
  // Batched, as in bulkUnassignAction; completed rows are excluded in the
  // write as well as the read.
  for (const chunk of chunks(ids)) {
    const { data } = await admin
      .from("enrolments")
      .update({ due_date: dueDate })
      .eq("organisation_id", context.organisationId)
      .in("id", chunk)
      .neq("status", "completed")
      .select("id");
    changed += data?.length ?? 0;
  }
  const refused = keys.size - changed;

  await logAudit({
    context,
    action: "training.due_date_changed",
    entity: "enrolment",
    detail: { changed, refused, dueDate },
  });

  revalidatePath("/org");
  revalidatePath("/org/learners");
  revalidatePath("/org/learners/statistics");
  revalidatePath("/learn");
  // Every carer page at once, rather than one call per ticked row.
  revalidatePath("/org/staff/[userId]", "page");
  return { ok: true, changed, refused };
}
