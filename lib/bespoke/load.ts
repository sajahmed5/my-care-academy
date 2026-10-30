import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { DUE_SOON_DAYS } from "@/lib/records";
import { SOURCES, sourceDef } from "./catalogue";
import { parseDefinition, type ReportDefinition } from "./definition";
import { runSection, type Row, type SectionResult } from "./run";

/**
 * Read the rows a bespoke report needs, one company at a time
 * (BESPOKE-REPORTS.md).
 *
 * Through the service role, because a scheduled send has no signed-in user —
 * so every read here names the organisation itself, and nothing is read for a
 * source the company's package leaves out. Every table that can pass 1,000
 * rows is read with fetchAll (the silent cap, see lib/fetch-all.ts); no id
 * list ever goes in a URL — people, courses and clients are read whole for
 * the company and joined here.
 */

type Admin = SupabaseClient;

interface Person {
  name: string;
  email: string | null;
  role: string;
  status: string;
  joined: string | null;
  last_seen: string | null;
}

const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const plusDays = (today: string, n: number) =>
  new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Everything read once per run, shared by every section that needs it. */
class Reader {
  private memo = new Map<string, Promise<unknown>>();
  constructor(
    private admin: Admin,
    private orgId: string,
    private today: string,
  ) {}

  private once<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!this.memo.has(key)) this.memo.set(key, load());
    return this.memo.get(key) as Promise<T>;
  }

  /** Every row of a table for this company, a page at a time. */
  private all(table: string, columns: string): Promise<Record<string, unknown>[]> {
    return this.once(`table:${table}`, () =>
      fetchAll<Record<string, unknown>>((from, to) =>
        // The column list is built at run time, so the client can't type it.
        this.admin
          .from(table)
          .select(columns)
          .eq("organisation_id", this.orgId)
          .order("id")
          .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
      ),
    );
  }

  people(): Promise<Map<string, Person>> {
    return this.once("people", async () => {
      const rows = await this.all("users", "id, full_name, email, role, status, created_at, last_seen_at");
      return new Map(
        rows.map((u) => [
          u.id as string,
          {
            name: ((u.full_name as string | null) || (u.email as string | null) || "Unnamed") as string,
            email: (u.email as string | null) ?? null,
            role: u.role as string,
            status: (u.status as string | null) ?? "active",
            joined: day(u.created_at),
            last_seen: day(u.last_seen_at),
          },
        ]),
      );
    });
  }

  courses(): Promise<Map<string, string>> {
    return this.once("courses", async () => {
      const rows = await fetchAll<{ id: string; title: string }>((from, to) =>
        this.admin.from("courses").select("id, title").order("id").range(from, to),
      );
      return new Map(rows.map((c) => [c.id, c.title]));
    });
  }

  clients(): Promise<Map<string, string>> {
    return this.once("clients-names", async () => {
      const rows = await this.all("clients", "id, full_name, date_of_birth, region, postcode, funder_type, funder_name, medication_support, start_date, status");
      return new Map(rows.map((c) => [c.id as string, c.full_name as string]));
    });
  }

  private async withPerson(userId: unknown): Promise<Row> {
    const p = (await this.people()).get(userId as string);
    return { person: p?.name ?? "Removed", person_role: p?.role ?? null, person_status: p?.status ?? null };
  }

  private async nameOf(userId: unknown): Promise<string | null> {
    if (!userId) return null;
    return (await this.people()).get(userId as string)?.name ?? null;
  }

  private enrolments() {
    return this.all("enrolments", "id, user_id, course_id, status, progress, time_spent, due_date, completion_count, assigned_at, created_at");
  }

  private overdue(e: Record<string, unknown>): boolean {
    return e.status !== "completed" && !!e.due_date && (e.due_date as string) < this.today;
  }

  /** The rows of one source. */
  async load(source: string): Promise<Row[]> {
    const today = this.today;
    switch (source) {
      case "staff": {
        const [people, enrolments] = await Promise.all([this.people(), this.enrolments()]);
        const counts = new Map<string, { assigned: number; completed: number; overdue: number }>();
        for (const e of enrolments) {
          const c = counts.get(e.user_id as string) ?? { assigned: 0, completed: 0, overdue: 0 };
          c.assigned += 1;
          if (e.status === "completed") c.completed += 1;
          if (this.overdue(e)) c.overdue += 1;
          counts.set(e.user_id as string, c);
        }
        return [...people.entries()]
          .filter(([, p]) => ["learner", "org_office", "org_admin"].includes(p.role))
          .map(([id, p]) => {
            const c = counts.get(id) ?? { assigned: 0, completed: 0, overdue: 0 };
            return {
              person: p.name,
              email: p.email,
              person_role: p.role,
              person_status: p.status,
              joined: p.joined,
              last_seen: p.last_seen,
              assigned: c.assigned,
              completed: c.completed,
              overdue: c.overdue,
              percent_complete: c.assigned ? Math.round((c.completed / c.assigned) * 100) : null,
            };
          });
      }
      case "training": {
        const [rows, courses] = await Promise.all([this.enrolments(), this.courses()]);
        return Promise.all(
          rows.map(async (e) => ({
            ...(await this.withPerson(e.user_id)),
            course: courses.get(e.course_id as string) ?? "Removed course",
            status: e.status as string,
            overdue: this.overdue(e),
            progress: (e.progress as number | null) ?? 0,
            assigned_at: day(e.assigned_at ?? e.created_at),
            due_date: day(e.due_date),
            time_spent: e.time_spent == null ? null : Math.round((e.time_spent as number) / 60),
            completions: (e.completion_count as number | null) ?? 0,
          })),
        );
      }
      case "certificates": {
        const [rows, courses] = await Promise.all([
          this.all("certificates", "id, user_id, course_id, certificate_number, issued_at, expires_at"),
          this.courses(),
        ]);
        const latest = new Map<string, string>();
        for (const c of rows) {
          const k = `${c.user_id}:${c.course_id}`;
          if (!latest.has(k) || (c.issued_at as string) > latest.get(k)!) latest.set(k, c.issued_at as string);
        }
        const soon = plusDays(today, 60);
        return Promise.all(
          rows.map(async (c) => {
            const expires = day(c.expires_at);
            return {
              ...(await this.withPerson(c.user_id)),
              course: courses.get(c.course_id as string) ?? "Removed course",
              number: c.certificate_number as string,
              issued_at: day(c.issued_at),
              expires_at: expires,
              state: !expires ? "no_expiry" : expires < today ? "expired" : expires <= soon ? "expiring" : "valid",
              latest: latest.get(`${c.user_id}:${c.course_id}`) === c.issued_at,
            };
          }),
        );
      }
      case "classroom": {
        const [rows, sessions, courses] = await Promise.all([
          this.all("classroom_attendance", "id, user_id, session_id, practical_passed"),
          this.all("classroom_sessions", "id, title, course_id, held_on, trainer_name"),
          this.courses(),
        ]);
        const byId = new Map(sessions.map((s) => [s.id as string, s]));
        return Promise.all(
          rows.map(async (a) => {
            const s = byId.get(a.session_id as string);
            return {
              ...(await this.withPerson(a.user_id)),
              session: (s?.title as string | undefined) ?? null,
              course: s?.course_id ? (courses.get(s.course_id as string) ?? null) : null,
              held_on: day(s?.held_on),
              trainer: (s?.trainer_name as string | null) ?? null,
              practical_passed: (a.practical_passed as boolean | null) ?? null,
            };
          }),
        );
      }
      case "supervisions": {
        const rows = await this.all("supervisions", "id, user_id, supervisor_id, kind, held_on, next_due, carer_signed_at");
        return Promise.all(
          rows.map(async (s) => ({
            ...(await this.withPerson(s.user_id)),
            kind: s.kind as string,
            held_on: day(s.held_on),
            next_due: day(s.next_due),
            supervisor: await this.nameOf(s.supervisor_id),
            signed: !!s.carer_signed_at,
          })),
        );
      }
      case "spot_checks": {
        const [rows, clients] = await Promise.all([
          this.all("spot_checks", "id, user_id, client_id, client_name, checked_on, outcome, next_due, assessor_id"),
          this.clients(),
        ]);
        return Promise.all(
          rows.map(async (s) => ({
            ...(await this.withPerson(s.user_id)),
            client: (s.client_id ? clients.get(s.client_id as string) : null) ?? (s.client_name as string | null) ?? null,
            checked_on: day(s.checked_on),
            outcome: s.outcome as string,
            next_due: day(s.next_due),
            assessor: await this.nameOf(s.assessor_id),
          })),
        );
      }
      case "competency": {
        const rows = await this.all("competency_checks", "id, user_id, area, outcome, checked_on, next_due, assessor_id");
        return Promise.all(
          rows.map(async (c) => ({
            ...(await this.withPerson(c.user_id)),
            area: c.area as string,
            outcome: c.outcome as string,
            checked_on: day(c.checked_on),
            next_due: day(c.next_due),
            assessor: await this.nameOf(c.assessor_id),
          })),
        );
      }
      case "plans": {
        const rows = await this.all("pips", "id, user_id, kind, status, start_date, review_until, outcome");
        return Promise.all(
          rows.map(async (p) => ({
            ...(await this.withPerson(p.user_id)),
            kind: p.kind as string,
            status: p.status as string,
            start_date: day(p.start_date),
            review_until: day(p.review_until),
            outcome: (p.outcome as string | null) ?? null,
          })),
        );
      }
      case "audits": {
        const rows = await this.all("audits", "id, kind, subject, held_on, score, next_due, auditor_id");
        return Promise.all(
          rows.map(async (a) => ({
            kind: a.kind as string,
            subject: (a.subject as string | null) ?? null,
            held_on: day(a.held_on),
            score: (a.score as number | null) ?? null,
            next_due: day(a.next_due),
            auditor: await this.nameOf(a.auditor_id),
          })),
        );
      }
      case "concerns": {
        const [rows, clients] = await Promise.all([
          this.all(
            "complaints",
            "id, reference, kind, status, category, reported_on, occurred_on, complete_by, closed_on, about_name, raised_by_role, client_id",
          ),
          this.clients(),
        ]);
        return rows.map((c) => {
          const reported = day(c.reported_on);
          const closed = day(c.closed_on);
          return {
            reference: (c.reference as string | null) ?? null,
            kind: c.kind as string,
            status: c.status as string,
            category: (c.category as string | null) ?? null,
            reported_on: reported,
            occurred_on: day(c.occurred_on),
            complete_by: day(c.complete_by),
            closed_on: closed,
            about: (c.about_name as string | null) ?? null,
            raised_by_role: (c.raised_by_role as string | null) ?? null,
            client: c.client_id ? (clients.get(c.client_id as string) ?? null) : null,
            days_open: reported ? daysBetween(reported, closed ?? today) : null,
          };
        });
      }
      case "compliments": {
        const [rows, clients] = await Promise.all([
          this.all("compliments", "id, received_on, from_name, from_role, client_id, what_was_said"),
          this.clients(),
        ]);
        return rows.map((c) => ({
          received_on: day(c.received_on),
          from: (c.from_name as string | null) ?? null,
          from_role: (c.from_role as string | null) ?? null,
          client: c.client_id ? (clients.get(c.client_id as string) ?? null) : null,
          what_was_said: (c.what_was_said as string | null) ?? null,
        }));
      }
      case "recruitment": {
        const rows = await this.all(
          "candidates",
          "id, full_name, role_applied, source, stage, status, entry_date, hired_at, rejected_at, start_date, is_driver, created_at",
        );
        return rows.map((c) => {
          const applied = day(c.entry_date) ?? day(c.created_at);
          const hired = day(c.hired_at);
          return {
            name: c.full_name as string,
            role_applied: (c.role_applied as string | null) ?? null,
            source: (c.source as string | null) ?? null,
            stage: (c.stage as string | null) ?? null,
            status: c.status as string,
            entry_date: applied,
            hired_at: hired,
            rejected_at: day(c.rejected_at),
            start_date: day(c.start_date),
            is_driver: (c.is_driver as boolean | null) ?? null,
            days_to_hire: applied && hired ? daysBetween(applied, hired) : null,
          };
        });
      }
      case "staff_documents": {
        const rows = await this.all("staff_documents", "id, user_id, doc_type, expires_at, not_required");
        const soon = plusDays(today, DUE_SOON_DAYS);
        return Promise.all(
          rows.map(async (d) => {
            const expires = day(d.expires_at);
            return {
              ...(await this.withPerson(d.user_id)),
              document: d.doc_type as string,
              expires_at: expires,
              state: d.not_required ? "not_required" : !expires ? "held" : expires < today ? "expired" : expires <= soon ? "expiring" : "held",
            };
          }),
        );
      }
      case "clients": {
        const rows = await this.all("clients", "id, full_name, date_of_birth, region, postcode, funder_type, funder_name, medication_support, start_date, status");
        return rows.map((c) => {
          const dob = day(c.date_of_birth);
          return {
            name: c.full_name as string,
            region: (c.region as string | null) ?? null,
            postcode: (c.postcode as string | null) ?? null,
            funder_type: (c.funder_type as string | null) ?? null,
            funder_name: (c.funder_name as string | null) ?? null,
            medication_support: (c.medication_support as boolean | null) ?? null,
            start_date: day(c.start_date),
            status: c.status as string,
            age: dob ? Math.floor(daysBetween(dob, today) / 365.25) : null,
          };
        });
      }
      default:
        return [];
    }
  }
}

export interface ReportRun {
  title: string;
  description: string | null;
  sections: SectionResult[];
}

/**
 * Run a whole report for one company: each source read once, whatever
 * number of sections use it, and only if the package includes it.
 */
export async function runReport(
  admin: Admin,
  orgId: string,
  report: { title: string; description: string | null; definition: unknown },
  today: string,
  opts: { allRows?: boolean } = {},
): Promise<ReportRun> {
  const definition: ReportDefinition = parseDefinition(report.definition);
  const reader = new Reader(admin, orgId, today);
  const needed = [...new Set(definition.sections.map((s) => s.source))];

  const features = [...new Set(needed.map((k) => sourceDef(k)?.feature).filter((f) => !!f))] as NonNullable<
    (typeof SOURCES)[number]["feature"]
  >[];
  const allowed = new Map(
    await Promise.all(features.map(async (f) => [f, await hasFeatureForOrg(admin, orgId, f)] as const)),
  );
  const loaded = new Map(
    await Promise.all(
      needed.map(async (k) => {
        const f = sourceDef(k)?.feature;
        return [k, f && !allowed.get(f) ? null : await reader.load(k)] as const;
      }),
    ),
  );

  return {
    title: report.title,
    description: report.description,
    sections: definition.sections.map((s) => runSection(s, loaded.get(s.source) ?? null, today, opts)),
  };
}
