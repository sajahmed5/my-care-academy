import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePortalOrg, isOrg } from "@/lib/portal-api";

export const dynamic = "force-dynamic";

/**
 * What can be assigned: the global catalogue, shaped for a picker.
 * Courses grouped by topic, plus pathways/programmes with their course lists —
 * the portal shows these exactly as the platform's own assign screen would.
 * Retired courses are left out, of the course sets too.
 */
export async function GET(req: Request) {
  const org = await resolvePortalOrg(req);
  if (!isOrg(org)) return org;

  const admin = createAdminClient();
  const [topicsQ, coursesQ, pathwaysQ, pcQ] = await Promise.all([
    admin.from("topics").select("id, title, sort_order").order("sort_order"),
    admin.from("courses").select("id, topic_id, title, summary, expiry_months, estimated_minutes, sort_order").is("retired_at", null).order("sort_order"),
    admin.from("pathways").select("id, title, kind, summary, sort_order").order("sort_order"),
    admin.from("pathway_courses").select("pathway_id, course_id, sort_order").order("sort_order"),
  ]);

  const live = new Set((coursesQ.data ?? []).map((c) => c.id as string));
  const coursesByPathway = new Map<string, string[]>();
  for (const pc of pcQ.data ?? []) {
    if (!live.has(pc.course_id)) continue;
    const list = coursesByPathway.get(pc.pathway_id) ?? [];
    list.push(pc.course_id);
    coursesByPathway.set(pc.pathway_id, list);
  }

  return NextResponse.json({
    topics: (topicsQ.data ?? []).map((t) => ({ id: t.id, title: t.title })),
    courses: (coursesQ.data ?? []).map((c) => ({
      id: c.id,
      topicId: c.topic_id,
      title: c.title,
      summary: c.summary,
      expiryMonths: c.expiry_months,
      estimatedMinutes: c.estimated_minutes,
    })),
    pathways: (pathwaysQ.data ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      kind: p.kind,
      summary: p.summary,
      courseIds: coursesByPathway.get(p.id) ?? [],
    })),
  });
}
