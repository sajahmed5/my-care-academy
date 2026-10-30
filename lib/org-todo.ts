import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserContext } from "@/lib/auth";
import type { FeatureKey } from "@/lib/features";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/fetch-all";
import { STAFF_ROLES } from "@/lib/roles";
import { loadAuditForms } from "@/lib/audit-forms-data";
import { staffAuditDigest, type DigestLine } from "@/lib/staff-audit-digest";
import { loadHrDigests } from "@/lib/hr-digest";
import { hasCaseAccess } from "@/lib/hr/case-access";
import { policyDigest } from "@/lib/policy-digest";
import { loadReading } from "@/lib/policy-reading-data";
import { loadServiceDue } from "@/lib/service-audits-due";
import { dueCounts } from "@/lib/service-audits";
import { reviewRows } from "@/lib/form-reviews";
import { loadReviewRecords } from "@/lib/form-reviews-data";
import { UNTRIAGED } from "@/lib/complaints/stages";

/**
 * The Overview's "To do today" (ease-of-use review, 30 Oct 2026): one list
 * of what is waiting, from every add-on the company has, each line with one
 * button to where it is done. It counts what the weekly email counts — the
 * same digest code — so the two never disagree. Training's lines are built
 * on the Overview itself, from the staff it already reads.
 */
export interface TodoLine {
  key: string;
  /** "alert" is late or waiting on you; "warn" is coming up. */
  tone: "alert" | "warn";
  text: string;
  href: string;
  action: string;
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** "2 overdue, 3 due in the next 30 days" → its tone. */
const toneOf = (late: number): TodoLine["tone"] => (late > 0 ? "alert" : "warn");

async function staffAudits(supabase: SupabaseClient, orgId: string, meetings: boolean, checks: boolean): Promise<TodoLine[]> {
  const [users, supervisions, spotChecks, competency, forms] = await Promise.all([
    fetchAll((f, t) =>
      supabase.from("users").select("id, full_name, email, role").eq("organisation_id", orgId).in("role", STAFF_ROLES).eq("status", "active").order("id").range(f, t),
    ),
    meetings
      ? fetchAll((f, t) => supabase.from("supervisions").select("id, user_id, kind, held_on, next_due").eq("organisation_id", orgId).order("id").range(f, t))
      : [],
    checks
      ? fetchAll((f, t) => supabase.from("spot_checks").select("id, user_id, checked_on, next_due").eq("organisation_id", orgId).order("id").range(f, t))
      : [],
    checks
      ? fetchAll((f, t) => supabase.from("competency_checks").select("id, user_id, area, checked_on, next_due").eq("organisation_id", orgId).order("id").range(f, t))
      : [],
    loadAuditForms(orgId),
  ]);
  const person = (u: Record<string, unknown>) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) });
  const lines = staffAuditDigest({
    carers: users.filter((u) => u.role === "learner").map(person),
    staff: users.map(person),
    supervisions: supervisions.map((x) => ({ userId: x.user_id as string, kind: x.kind as string, heldOn: x.held_on as string, nextDue: (x.next_due as string | null) ?? null })),
    spotChecks: spotChecks.map((x) => ({ userId: x.user_id as string, heldOn: x.checked_on as string, nextDue: (x.next_due as string | null) ?? null })),
    competency: competency.map((x) => ({
      userId: x.user_id as string,
      heldOn: x.checked_on as string,
      nextDue: (x.next_due as string | null) ?? null,
      area: x.area as string,
    })),
    areas: forms.competency.map((f) => ({ key: f.key, label: f.label })),
    meetings,
    checks,
    now: new Date(),
  });
  // Competency is one line per skill in the email; here, one line for all of them.
  const skills = lines.filter((l) => l.href.startsWith("/org/due/competency"));
  const merged: DigestLine[] = lines.filter((l) => !skills.includes(l));
  if (skills.length) {
    merged.push({
      label: "Competency assessments",
      href: "/org/due/competency",
      overdue: skills.reduce((n, l) => n + l.overdue, 0),
      dueSoon: skills.reduce((n, l) => n + l.dueSoon, 0),
      never: 0,
    });
  }
  return merged.map((l) => {
    const late = l.overdue + l.never;
    const said = [l.overdue && `${l.overdue} overdue`, l.never && `${plural(l.never, "person has", "people have")} never had one`, l.dueSoon && `${l.dueSoon} due in the next 30 days`]
      .filter(Boolean)
      .join(", ");
    return { key: l.href, tone: toneOf(late), text: `${l.label}: ${said}`, href: l.href, action: "See who" };
  });
}

async function hr(context: UserContext, orgId: string): Promise<TodoLine[]> {
  const admin = createAdminClient();
  const users = await fetchAll((f, t) =>
    admin.from("users").select("id, role, status").eq("organisation_id", orgId).order("id").range(f, t),
  );
  const people = new Map(users.map((u) => [u.id as string, { org: orgId, role: u.role as string, status: u.status as string }]));
  const [digests, cases] = await Promise.all([loadHrDigests(admin, people, [orgId], new Date()), hasCaseAccess(admin, context)]);
  const ACTION: Record<string, string> = {
    Documents: "See who",
    "Probation reviews": "Book them",
    Absence: "Open absence",
    "Disciplinary and grievance": "Open cases",
    Leavers: "Open leavers",
    Holidays: "Decide",
  };
  return (digests.get(orgId) ?? [])
    // An office worker a manager hasn't named for cases doesn't see them.
    .filter((l) => cases || l.href !== "/org/hr/cases")
    .map((l) => ({
      key: l.href,
      tone: /overdue|expired|unfinished|trigger|waiting/.test(l.text) ? "alert" : "warn",
      text: `${l.label === "Documents" ? "Staff documents" : l.label}: ${l.text}`,
      href: l.href,
      action: ACTION[l.label] ?? "Open",
    }));
}

async function policies(supabase: SupabaseClient, orgId: string): Promise<TodoLine[]> {
  const [copies, reading] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from("organisation_policies")
        .select("id, review_due_on")
        .eq("organisation_id", orgId)
        .eq("status", "published")
        .gt("version", 0)
        .order("id")
        .range(f, t),
    ),
    loadReading(supabase, orgId),
  ]);
  const d = policyDigest(
    copies.map((c) => ({ copyId: c.id as string, title: "", code: "", reviewDueOn: (c.review_due_on as string | null) ?? null })),
    new Date(),
    reading.entries,
  );
  const out: TodoLine[] = [];
  if (d.latePeople) {
    out.push({
      key: "policies-late",
      tone: "alert",
      text: `${plural(d.latePeople, "person hasn't", "people haven't")} read and accepted a policy in time`,
      href: "/org/due/policies",
      action: "See who",
    });
  }
  if (d.reviewsOverdue + d.reviewsDueSoon) {
    out.push({
      key: "policies-review",
      tone: toneOf(d.reviewsOverdue),
      text: `Policy reviews: ${[d.reviewsOverdue && `${d.reviewsOverdue} overdue`, d.reviewsDueSoon && `${d.reviewsDueSoon} due soon`].filter(Boolean).join(", ")}`,
      href: "/org/due/policies",
      action: "See which",
    });
  }
  return out;
}

async function complaints(supabase: SupabaseClient, orgId: string): Promise<TodoLine[]> {
  const today = new Date().toISOString().slice(0, 10);
  const open = await fetchAll((f, t) =>
    supabase.from("complaints").select("id, kind, complete_by").eq("organisation_id", orgId).eq("status", "open").order("id").range(f, t),
  );
  const waiting = open.filter((c) => c.kind === UNTRIAGED).length;
  const late = open.filter((c) => c.kind !== UNTRIAGED && c.complete_by && (c.complete_by as string) < today).length;
  const out: TodoLine[] = [];
  if (waiting) {
    out.push({
      key: "complaints-waiting",
      tone: "alert",
      text: `${plural(waiting, "new concern")} waiting to be looked at`,
      href: `/org/complaints?status=open&kind=${UNTRIAGED}`,
      action: waiting === 1 ? "Open it" : "Open them",
    });
  }
  if (late) {
    out.push({
      key: "complaints-late",
      tone: "alert",
      text: `${plural(late, "complaint or concern", "complaints and concerns")} past the date to finish by`,
      href: "/org/complaints?status=open",
      action: "Open them",
    });
  }
  return out;
}

async function serviceAudits(supabase: SupabaseClient, orgId: string): Promise<TodoLine[]> {
  const due = await loadServiceDue(supabase, orgId);
  let late = 0;
  let soon = 0;
  for (const d of due) {
    if (d.form.scope === "service") {
      if (d.status === "overdue" || d.status === "never") late += 1;
      else if (d.status === "due_soon") soon += 1;
    } else {
      const c = dueCounts(d.clients);
      late += c.late;
      soon += c.soon;
    }
  }
  if (!late && !soon) return [];
  return [
    {
      key: "service-audits",
      tone: toneOf(late),
      text: `Service audits: ${[late && `${late} due now`, soon && `${soon} due in the next 30 days`].filter(Boolean).join(", ")}`,
      href: "/org/due/audits",
      action: "See which",
    },
  ];
}

async function formReviews(supabase: SupabaseClient, orgId: string): Promise<TodoLine[]> {
  const rows = reviewRows(await loadReviewRecords(supabase, orgId), new Date());
  const late = rows.filter((r) => r.status === "overdue").length;
  const soon = rows.filter((r) => r.status === "due_soon").length;
  if (!late && !soon) return [];
  return [
    {
      key: "form-reviews",
      tone: toneOf(late),
      text: `Form reviews: ${[late && `${late} overdue`, soon && `${soon} due in the next 30 days`].filter(Boolean).join(", ")}`,
      href: "/org/due/forms",
      action: "See which",
    },
  ];
}

async function recruitment(supabase: SupabaseClient, orgId: string): Promise<TodoLine[]> {
  const candidates = await fetchAll((f, t) =>
    supabase
      .from("candidates")
      .select("id, status, candidate_documents (review_status)")
      .eq("organisation_id", orgId)
      .not("status", "in", "(hired,rejected)")
      .order("id")
      .range(f, t),
  );
  const waiting = candidates.filter((c) =>
    ((c.candidate_documents ?? []) as { review_status: string | null }[]).some((d) => d.review_status === "submitted"),
  ).length;
  if (!waiting) return [];
  return [
    {
      key: "recruitment",
      tone: "alert",
      text: `${plural(waiting, "candidate has", "candidates have")} sent documents for you to check`,
      href: "/org/recruitment",
      action: "Check them",
    },
  ];
}

/** Everything but training, for the add-ons the company has. */
export async function loadOrgTodo(
  supabase: SupabaseClient,
  context: UserContext,
  enabled: Record<FeatureKey, boolean>,
): Promise<TodoLine[]> {
  const orgId = context.organisationId!;
  const meetings = enabled["people.supervisions"];
  const checks = enabled["people.competency"];
  const parts = await Promise.all([
    enabled["complaints.register"] ? complaints(supabase, orgId) : [],
    enabled["recruitment.tracker"] ? recruitment(supabase, orgId) : [],
    meetings || checks ? staffAudits(supabase, orgId, meetings, checks) : [],
    enabled["recruitment.tracker"] ? hr(context, orgId) : [],
    enabled["documents.library"] ? policies(supabase, orgId) : [],
    enabled["quality.audits"] ? serviceAudits(supabase, orgId) : [],
    enabled["forms.builder"] ? formReviews(supabase, orgId) : [],
  ]);
  return parts.flat();
}
