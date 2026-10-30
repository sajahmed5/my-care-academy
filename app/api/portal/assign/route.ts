import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePortalOrg, isOrg } from "@/lib/portal-api";
import { logAudit } from "@/lib/audit";
import { endOfMonthISO, planPortalAssign } from "@/lib/assign";
import { chunk } from "@/lib/engine-digest";
import { fetchAll } from "@/lib/fetch-all";
import { emailAssignees, trainingNotices } from "@/lib/assignment-email";
import { siteOrigin } from "@/lib/site-url";

/**
 * Ids per `.in()` filter or bulk update. Ids travel in the request URL, which
 * fails outright somewhere past ~390 of them; this route accepts up to 1,000
 * refs, so every list is split. Matches IDS_PER_REQUEST in lib/engine.
 */
const IDS_PER_REQUEST = 100;

/** The most courses, or pathways, one call may name. */
const MAX_ITEMS = 200;

export const dynamic = "force-dynamic";
// Invites send emails one by one; give the function room to breathe.
export const maxDuration = 60;

/**
 * Allocate training from the portal.
 *
 * Body: { externalRefs: string[], courseIds?: string[], pathwayIds?: string[], dueDate?: "yyyy-mm-dd" }
 *
 * Pathways expand to their courses, exactly like the platform's own assign
 * action. Assigning something a carer already has NEVER resets their
 * progress or assigned date; a new enrolment with no date sent gets the
 * platform default (end of this month) — see planPortalAssign. Learners are resolved by
 * external_ref; unknown refs are reported back, not silently dropped.
 *
 * Each carer given a course they didn't have gets the same "Training to
 * complete" email as an assign from the console, once, naming what's new.
 * A course they already had, or a changed due date, sends nothing — MyRoster
 * may send the same assignment again.
 */
export async function POST(req: Request) {
  const org = await resolvePortalOrg(req);
  if (!isOrg(org)) return org;

  let body: { externalRefs?: string[]; courseIds?: string[]; pathwayIds?: string[]; dueDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const refs = (body.externalRefs ?? []).filter(Boolean);
  if (refs.length === 0 || refs.length > 1000) return NextResponse.json({ error: "Send 1-1000 externalRefs" }, { status: 400 });
  const dueDate = body.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : null;

  const admin = createAdminClient();

  // Expand pathways -> courses, dedupe. Both lists are capped, and every
  // lookup split, so no request carries more ids than its URL can hold.
  const sentCourses = [...new Set((Array.isArray(body.courseIds) ? body.courseIds : []).filter(Boolean))];
  const pathwayIds = [...new Set((Array.isArray(body.pathwayIds) ? body.pathwayIds : []).filter(Boolean))];
  if (sentCourses.length > MAX_ITEMS || pathwayIds.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Send at most ${MAX_ITEMS} courseIds and ${MAX_ITEMS} pathwayIds` }, { status: 400 });
  }
  const courseIds = new Set(sentCourses);
  for (const part of chunk(pathwayIds, IDS_PER_REQUEST)) {
    const rows = await fetchAll<{ pathway_id: string; course_id: string }>((f, t) =>
      admin.from("pathway_courses").select("pathway_id, course_id").in("pathway_id", part).order("pathway_id").order("course_id").range(f, t),
    );
    for (const pc of rows) courseIds.add(pc.course_id);
  }
  if (courseIds.size === 0) return NextResponse.json({ error: "Nothing to assign" }, { status: 400 });

  // Only real courses — a stale id from the portal must not insert a ghost —
  // and not retired ones.
  const validCourseIds = (
    await Promise.all(
      chunk([...courseIds], IDS_PER_REQUEST).map(async (part) => {
        const { data, error } = await admin.from("courses").select("id").in("id", part).is("retired_at", null);
        if (error) throw new Error(error.message);
        return (data ?? []).map((c) => c.id as string);
      }),
    )
  ).flat();

  const users = (
    await Promise.all(
      chunk(refs, IDS_PER_REQUEST).map(async (part) => {
        const { data, error } = await admin
          .from("users")
          .select("id, external_ref, status")
          .eq("organisation_id", org.id)
          .in("external_ref", part);
        if (error) throw new Error(error.message);
        return data ?? [];
      }),
    )
  ).flat();
  const foundRefs = new Set(users.map((u) => u.external_ref));
  const unknownRefs = refs.filter((r) => !foundRefs.has(r));
  const activeUsers = users.filter((u) => u.status === "active");

  // New enrolments always get a due date; existing ones keep theirs (lib/assign).
  const userIds = activeUsers.map((u) => u.id);
  // Paged as well as split: 100 carers on 16 courses is already past the
  // 1,000-row read cap, and an enrolment missed here would be inserted again
  // and fail the whole call on the unique (user, course) key.
  const existing = validCourseIds.length
    ? (
        await Promise.all(
          chunk(userIds, IDS_PER_REQUEST).flatMap((part) =>
            chunk(validCourseIds, IDS_PER_REQUEST).map((coursePart) =>
              fetchAll<{ id: string; user_id: string; course_id: string; due_date: string | null }>((f, t) =>
                admin.from("enrolments").select("id, user_id, course_id, due_date")
                  .eq("organisation_id", org.id).in("user_id", part).in("course_id", coursePart)
                  .order("id").range(f, t),
              ),
            ),
          ),
        )
      ).flat()
    : [];
  const plan = planPortalAssign({
    userIds, courseIds: validCourseIds, existing,
    dueDateSent: dueDate, defaultDue: endOfMonthISO(), nowIso: new Date().toISOString(),
  });

  let assigned = 0;
  if (plan.inserts.length) {
    const { error, count } = await admin
      .from("enrolments")
      .insert(plan.inserts.map((r) => ({ organisation_id: org.id, ...r })), { count: "exact" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    assigned = count ?? plan.inserts.length;

    const origin = await siteOrigin();
    const inserts = plan.inserts;
    after(async () => {
      const titles = new Map<string, string>();
      for (const part of chunk([...new Set(inserts.map((r) => r.course_id))], IDS_PER_REQUEST)) {
        const { data } = await admin.from("courses").select("id, title").in("id", part);
        for (const c of data ?? []) titles.set(c.id as string, c.title as string);
      }
      await emailAssignees(admin, "training_assigned", trainingNotices(inserts, titles), {
        organisationId: org.id, assignedBy: null, origin,
      });
    });
  }
  // One update per due date (in practice there is only one per call), a
  // URL-safe number of ids at a time — it was one request per enrolment.
  const idsByDue = new Map<string, string[]>();
  for (const u of plan.dueUpdates) {
    const ids = idsByDue.get(u.due_date) ?? [];
    ids.push(u.id);
    idsByDue.set(u.due_date, ids);
  }
  for (const [due_date, ids] of idsByDue) {
    for (const part of chunk(ids, IDS_PER_REQUEST)) {
      const { error } = await admin.from("enrolments").update({ due_date }).in("id", part).eq("organisation_id", org.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  await logAudit({
    organisationId: org.id,
    action: "portal.assign_training",
    entity: "enrolments",
    detail: { learners: activeUsers.length, courses: validCourseIds.length, dueDate: dueDate ?? `default ${endOfMonthISO()}`, newEnrolments: plan.inserts.length, dueDatesSet: plan.dueUpdates.length, unknownRefs },
  });

  return NextResponse.json({
    // Everything now in place for these carers and courses, as before; newlyAssigned is just the new ones.
    assigned: assigned + existing.length,
    newlyAssigned: assigned,
    learners: activeUsers.length,
    courses: validCourseIds.length,
    unknownRefs,
    inactiveRefs: users.filter((u) => u.status !== "active").map((u) => u.external_ref),
  });
}
