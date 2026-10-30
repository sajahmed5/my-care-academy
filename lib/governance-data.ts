/**
 * Reading everything the monthly governance report rests on, under RLS:
 * audits and client QAs (Service audits), open actions, concerns and
 * compliments (Complaints & safeguarding), supervisions and spot checks
 * (Staff Audits), and training. A part the company's package doesn't have is
 * left out rather than shown as nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { STAFF_ROLES } from "./roles";
import { auditKind } from "./audits";
import { kindLabel } from "./complaints/stages";
import { buildDueRows } from "./due-view";
import { autoFindings, autoTally, trainingCompliance } from "./auto-audits";
import { loadAutoSnapshot } from "./auto-audits-data";
import { loadReviewBelow } from "./service-audits-data";
import { loadServiceDue } from "./service-audits-due";
import { dueCounts } from "./service-audits";
import {
  summariseActions,
  summariseAudits,
  summariseConcerns,
  summariseQas,
  type GovernanceReport,
  type MonthRange,
  type StaffAuditSummary,
} from "./governance";

type Row = Record<string, unknown>;

export async function loadGovernanceReport(
  supabase: SupabaseClient,
  organisationId: string,
  range: MonthRange,
  enabled: { complaints: boolean; supervisions: boolean; spotChecks: boolean },
): Promise<GovernanceReport> {
  const org = organisationId;
  const page = <T = Row>(build: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => fetchAll<T>(build);
  const [{ data: organisation }, reviewBelow, { data: saved }, audits, qas, actions, due, training] = await Promise.all([
    supabase.from("organisations").select("name").eq("id", org).maybeSingle(),
    loadReviewBelow(org),
    supabase.from("governance_reports").select("summary").eq("organisation_id", org).eq("month", range.start).maybeSingle(),
    page((f, t) =>
      supabase.from("audits").select("id, kind, title, subject, client_name, held_on, score, review_status").eq("organisation_id", org).order("id").range(f, t),
    ),
    page((f, t) =>
      supabase
        .from("client_qas")
        .select("id, client_name, held_on, completed, score, review_status, safe, effective, caring, responsive, well_led")
        .eq("organisation_id", org)
        .order("id")
        .range(f, t),
    ),
    page((f, t) =>
      supabase
        .from("record_actions")
        .select("id, title, due_date, source_type, created_at, completed_at, owner:users!record_actions_user_id_fkey (full_name, email)")
        .eq("organisation_id", org)
        .order("id")
        .range(f, t),
    ),
    loadServiceDue(supabase, org),
    loadAutoSnapshot(supabase, org, "training"),
  ]);

  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const waitingQas = qas.filter((q) => q.review_status === "waiting").length;
  const auditSummary = summariseAudits(
    audits.map((a) => ({
      title: (a.title as string | null) ?? auditKind(a.kind as string)?.label ?? (a.kind as string),
      about: ((a.client_name ?? a.subject) as string | null) ?? null,
      held_on: a.held_on as string,
      score: (a.score as number | null) ?? null,
      review_status: a.review_status as string,
    })),
    range,
    due.map((d) => ({
      title: d.form.label,
      count: d.form.scope === "client" ? dueCounts(d.clients).late : d.status === "overdue" || d.status === "never" ? 1 : 0,
    })),
  );
  auditSummary.waitingReview += waitingQas;

  let concerns: GovernanceReport["concerns"] = null;
  if (enabled.complaints) {
    const [rows, compliments] = await Promise.all([
      page((f, t) => supabase.from("complaints").select("id, kind, reported_on, closed_on, status").eq("organisation_id", org).order("id").range(f, t)),
      page((f, t) => supabase.from("compliments").select("id, received_on").eq("organisation_id", org).order("id").range(f, t)),
    ]);
    concerns = summariseConcerns(
      rows.map((c) => ({
        kind: c.kind as string,
        kindLabel: kindLabel(c.kind as string),
        reported_on: c.reported_on as string,
        closed_on: (c.closed_on as string | null) ?? null,
        status: c.status as string,
      })),
      compliments.map((c) => ({ received_on: c.received_on as string })),
      range,
    );
  }

  let staffAudits: StaffAuditSummary | null = null;
  if (enabled.supervisions || enabled.spotChecks) {
    const [people, supervisions, spots] = await Promise.all([
      page((f, t) =>
        supabase.from("users").select("id, full_name, email, role").eq("organisation_id", org).in("role", STAFF_ROLES).eq("status", "active").order("id").range(f, t),
      ),
      enabled.supervisions
        ? page((f, t) =>
            supabase.from("supervisions").select("id, user_id, kind, held_on, next_due").eq("organisation_id", org).in("kind", ["supervision", "appraisal"]).order("id").range(f, t),
          )
        : Promise.resolve([] as Row[]),
      enabled.spotChecks
        ? page((f, t) => supabase.from("spot_checks").select("id, user_id, checked_on, outcome, next_due").eq("organisation_id", org).order("id").range(f, t))
        : Promise.resolve([] as Row[]),
    ]);
    const now = new Date();
    const everyone = people.map((p) => ({ id: p.id as string, name: (p.full_name as string | null) || (p.email as string) }));
    const carers = everyone.filter((p) => people.find((u) => u.id === p.id)?.role === "learner");
    const inMonth = (d: unknown) => typeof d === "string" && d >= range.start && d <= range.end;
    const late = (rows: { status: string }[]) => rows.filter((r) => r.status === "overdue" || r.status === "never").length;
    staffAudits = {
      supervisions: supervisions.filter((s) => s.kind === "supervision" && inMonth(s.held_on)).length,
      appraisals: supervisions.filter((s) => s.kind === "appraisal" && inMonth(s.held_on)).length,
      spotChecks: spots.filter((s) => inMonth(s.checked_on)).length,
      spotChecksShort: spots.filter((s) => inMonth(s.checked_on) && s.outcome !== "met").length,
      supervisionsBehind: enabled.supervisions
        ? late(
            buildDueRows(
              everyone,
              supervisions
                .filter((s) => s.kind === "supervision")
                .map((s) => ({ userId: s.user_id as string, heldOn: s.held_on as string, nextDue: (s.next_due as string | null) ?? null })),
              now,
            ),
          )
        : 0,
      spotChecksBehind: enabled.spotChecks
        ? late(
            buildDueRows(
              carers,
              spots.map((s) => ({ userId: s.user_id as string, heldOn: s.checked_on as string, nextDue: (s.next_due as string | null) ?? null })),
              now,
            ),
          )
        : 0,
    };
  }

  const tally = autoTally(training);
  return {
    organisationName: (organisation?.name as string | undefined) ?? "Your company",
    range,
    reviewBelow,
    summary: (saved?.summary as string | undefined) ?? "",
    audits: auditSummary,
    qas: summariseQas(
      qas.map((q) => ({
        client_name: q.client_name as string,
        held_on: q.held_on as string,
        completed: !!q.completed,
        score: (q.score as number | null) ?? null,
        safe: q.safe as number | null,
        effective: q.effective as number | null,
        caring: q.caring as number | null,
        responsive: q.responsive as number | null,
        well_led: q.well_led as number | null,
      })),
      range,
      reviewBelow,
    ),
    actions: summariseActions(
      actions.map((a) => {
        const owner = one(a.owner as { full_name?: string | null; email?: string | null } | null);
        return {
          title: a.title as string,
          owner: owner?.full_name || owner?.email || "—",
          due_date: (a.due_date as string | null) ?? null,
          source_type: a.source_type as string,
          created_at: a.created_at as string,
          completed_at: (a.completed_at as string | null) ?? null,
        };
      }),
      range,
    ),
    concerns,
    staffAudits,
    training: {
      compliance: trainingCompliance(training.summary),
      people: training.people.length,
      upToDate: tally.pass,
      behind: autoFindings(training).map((f) => ({ name: f.person.name, detail: f.person.checks.training.detail })),
    },
  };
}
