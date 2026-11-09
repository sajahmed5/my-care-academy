import { memberStatus, requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { SameTeam } from "@/components/same-team";
import { isActiveLearner, isNeverActive, loadOrgLearners, type OrgLearnerRow } from "@/lib/org-learners";
import { enabledMap } from "@/lib/entitlements";
import { loadOrgTodo, type TodoLine } from "@/lib/org-todo";
import { isHiddenPath } from "@/lib/office-access";
import { hiddenAreasFor } from "@/lib/office-access-server";
import { isLate, loadStaffChecks, type StaffChecks } from "@/lib/staff-checks";
import { loadServiceDue } from "@/lib/service-audits-due";
import { dueCounts } from "@/lib/service-audits";
import { runHref } from "@/lib/client-qa";
import { formatDate, UK_TIME_ZONE } from "@/lib/dates";
import { trialState } from "@/lib/trial";
import { gettingStarted, shouldOfferTour, todayChecklist, type TaskFacts } from "@/lib/walkthrough";
import { loadEnrolments } from "@/lib/learner-data";
import { GettingStarted } from "@/components/walkthrough/getting-started";
import { Walkthrough } from "@/components/walkthrough/walkthrough";
import { codeOf, complianceChecks, readiness, rowFromLine, sortRows, type AttentionRow } from "@/lib/today";
import { AttentionList, FigureCard, OwnTraining, ReadinessCard, SetupChecklist, TeamTraining, type SetupStep } from "./today/cards";
import { isOverdue } from "@/lib/engine-logic";
import { WhosOffWeek } from "./today/whos-off-week";

const NAME_CAP = 4;
const nameList = (rows: OrgLearnerRow[]) => {
  const names = rows.map((r) => r.name);
  if (names.length <= NAME_CAP) return names.join(", ");
  return `${names.slice(0, NAME_CAP).join(", ")} and ${names.length - NAME_CAP} more`;
};
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const day = (d: string) => formatDate(d, { day: "numeric", month: "short" });

/** "Good morning" by the clock in the UK, whatever the server's zone. */
function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/**
 * A person's supervisions and appraisals as lines: one per person while
 * three or fewer are late (the mockup's "Saj Ahmed has never had a
 * supervision", with Book going straight to the form), one line for the
 * lot beyond that.
 */
function checkRows(kind: "supervision" | "appraisal", checks: StaffChecks): AttentionRow[] {
  const plural_ = kind === "supervision" ? "Supervisions" : "Appraisals";
  const check = kind === "supervision" ? "supervisions" : "appraisals";
  const code = codeOf(check);
  const all = [...checks.entries()].map(([id, c]) => ({ id, row: c[kind] }));
  const late = all.filter((x) => isLate(x.row));
  const soon = all.filter((x) => x.row.status === "due_soon" && !x.row.booked);
  const rows: AttentionRow[] = [];
  if (late.length > 0 && late.length <= 3) {
    for (const { id, row } of late) {
      const never = row.status === "never";
      rows.push({
        key: `${kind}:${id}`,
        code,
        title: never ? `${row.person.name} has never had ${kind === "appraisal" ? "an" : "a"} ${kind}` : `${row.person.name}'s ${kind} is overdue`,
        meta: never ? plural_ : `Last ${kind} ${day(row.last!)} · was due ${day(row.next!)}`,
        pill: { label: never ? "Never had one" : "Overdue", tone: "danger" },
        href: `/org/staff/${id}/supervisions/new?kind=${kind}`,
        action: "Book",
        check,
        tone: "alert",
      });
    }
  } else if (late.length > 3) {
    const overdue = late.filter((x) => x.row.status === "overdue").length;
    const never = late.length - overdue;
    rows.push({
      key: `${kind}:late`,
      code,
      title: plural_,
      meta: [overdue && `${overdue} overdue`, never && `${plural(never, "person has", "people have")} never had one`].filter(Boolean).join(" · "),
      pill: { label: "Overdue", tone: "danger" },
      href: `/org/due/${kind}s`,
      action: "See who",
      check,
      tone: "alert",
    });
  }
  if (soon.length > 0) {
    rows.push({
      key: `${kind}:soon`,
      code,
      title: plural_,
      meta: `${soon.length} due in the next 30 days`,
      pill: { label: "Due soon", tone: "warn" },
      href: `/org/due/${kind}s`,
      action: "See who",
      check,
      tone: "warn",
    });
  }
  return rows;
}

/**
 * The counts behind the Getting started list that the page does not read
 * anyway: the signed-in person's own courses, supervisions held or booked,
 * audits carried out, and evidence packs exported (from the audit trail,
 * where every export is written). Head counts only.
 */
async function loadTaskFacts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string,
  enabled: Partial<Record<string, boolean>>,
): Promise<TaskFacts> {
  const head = { count: "exact" as const, head: true };
  const n = (p: PromiseLike<{ count: number | null }>) => Promise.resolve(p).then((r) => r.count ?? 0, () => 0);
  const [own, supervisions, bookings, audits, qas, packs] = await Promise.all([
    loadEnrolments(userId),
    enabled["people.supervisions"] ? n(supabase.from("supervisions").select("id", head).eq("organisation_id", orgId)) : 0,
    enabled["people.supervisions"] ? n(supabase.from("staff_audit_bookings").select("id", head).eq("organisation_id", orgId)) : 0,
    enabled["quality.audits"] ? n(supabase.from("audits").select("id", head).eq("organisation_id", orgId)) : 0,
    enabled["quality.audits"] ? n(supabase.from("client_qas").select("id", head).eq("organisation_id", orgId)) : 0,
    n(supabase.from("audit_logs").select("id", head).eq("organisation_id", orgId).eq("action", "evidence_pack.exported")),
  ]);
  return {
    staff: 0,
    staffSignedIn: 0,
    assigned: 0,
    clients: 0,
    ownAssigned: own.length,
    ownCompleted: own.filter((e) => e.status === "completed" || e.completion_count > 0).length,
    supervisions: supervisions + bookings,
    audits: audits + qas,
    evidencePacks: packs,
  };
}

export default async function OrgDashboard() {
  const context = await requireConsole();
  const orgId = context.organisationId!;
  const supabase = await createClient();
  const now = new Date();

  // All reads go through RLS — a console user only ever sees their own org.
  // The explicit organisation filter is for the planner, not for security.
  const [{ data: organisation }, allLearners, enabled, member, ownCourses] = await Promise.all([
    supabase.from("organisations").select("name, package_tier").eq("id", orgId).single(),
    loadOrgLearners(supabase, orgId),
    enabledMap(context),
    memberStatus(context.userId, orgId),
    // Their own training, for the card on the right: a manager or office
    // worker has courses too, and nothing else in the console says so.
    loadEnrolments(context.userId),
  ]);
  const ownOpen = ownCourses.filter((e) => e.status !== "completed");
  const ownOverdue = ownOpen.filter((e) => isOverdue(e.due_date, e.status, now)).length;
  // Headline numbers count active staff only; deactivated stay in the matrix.
  const learners = allLearners.filter(isActiveLearner);
  const people = learners.map((r) => ({ id: r.id, name: r.name }));

  const trial = trialState(member.trialEndsAt, now);

  const [checks, serviceDue, todoLines, clients, facts] = await Promise.all([
    enabled["people.supervisions"] ? loadStaffChecks(supabase, orgId, people, now) : null,
    enabled["quality.audits"] ? loadServiceDue(supabase, orgId, now) : null,
    loadOrgTodo(supabase, context, enabled),
    enabled["clients.list"]
      ? supabase.from("clients").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).then((r) => r.count ?? 0)
      : Promise.resolve<number | null>(null),
    // What the Getting started list ticks off (lib/walkthrough.ts): small
    // counts, read only while the company is on a trial, since that is the
    // only time the list shows. Each table's RLS scopes it to this company;
    // the filter is for the planner.
    trial.kind === "active" ? loadTaskFacts(supabase, context.userId, orgId, enabled) : Promise.resolve<TaskFacts | null>(null),
  ]);

  const totals = learners.reduce(
    (t, r) => ({
      assigned: t.assigned + r.stats.assigned,
      completed: t.completed + r.stats.completed,
      expired: t.expired + r.stats.expired,
      overdue: t.overdue + r.stats.overdue,
      expiring: t.expiring + r.stats.expiring,
      certificates: t.certificates + r.stats.certificates,
    }),
    { assigned: 0, completed: 0, expired: 0, overdue: 0, expiring: 0, certificates: 0 },
  );
  const overallPct = totals.assigned > 0 ? Math.round((totals.completed / totals.assigned) * 100) : 0;

  // --- Needs your attention -------------------------------------------------
  // Training's lines link to the filtered list rather than a one-tap "remind
  // everyone": some people should not be chased, for reasons the system
  // cannot know (issue #27). Names, not headcounts (issue #29).
  const overdueRows = learners.filter((r) => r.stats.overdue > 0);
  const neverRows = learners.filter(isNeverActive);
  const dueSoonRows = learners.filter((r) => r.stats.dueSoon > 0);
  const training: TodoLine[] = [
    overdueRows.length > 0 && { key: "overdue", tone: "alert" as const, text: `Overdue training: ${nameList(overdueRows)}`, href: "/org/learners?filter=overdue", action: "Pick who to remind" },
    neverRows.length > 0 && { key: "never", tone: "alert" as const, text: `Never signed in: ${nameList(neverRows)}`, href: "/org/learners?filter=never", action: "Pick who to remind" },
    dueSoonRows.length > 0 && { key: "due_soon", tone: "warn" as const, text: `Training due in the next 60 days: ${nameList(dueSoonRows)}`, href: "/org/learners?filter=due_soon", action: "Pick who to remind" },
    totals.expiring > 0 && { key: "expiring", tone: "warn" as const, text: `Certificates expiring: ${plural(totals.expiring, "certificate")} soon or already expired`, href: "/org/certificates", action: "See which" },
  ].filter((r): r is TodoLine => !!r);

  // Supervisions, appraisals and service audits are drawn here from the rows
  // the cards read anyway, person by person and audit by audit; the to-do
  // list's own lines for them step aside.
  const own = new Set(["/org/due/supervisions", "/org/due/appraisals", "service-audits"]);
  const rows: AttentionRow[] = [
    ...training.map((l) => rowFromLine(l)),
    ...(checks ? [...checkRows("supervision", checks), ...checkRows("appraisal", checks)] : []),
    ...(serviceDue ?? []).flatMap((d): AttentionRow[] => {
      const code = codeOf("audits", d.form.label);
      if (d.form.scope === "service") {
        if (d.status === "overdue" || d.status === "never") {
          return [{
            key: `audit:${d.form.key}`,
            code,
            title: d.form.label,
            meta: d.status === "never" ? "Service audit · never carried out" : `Service audit · last done ${day(d.last!)}, due ${day(d.next!)}`,
            pill: { label: "Due now", tone: "warn" },
            href: runHref(d.form.key),
            action: "Start",
            check: "audits",
            tone: "alert",
          }];
        }
        if (d.status === "due_soon") {
          return [{ key: `audit:${d.form.key}`, code, title: d.form.label, meta: `Service audit · due ${day(d.next!)}`, pill: { label: "Due soon", tone: "warn" }, href: runHref(d.form.key), action: "Start", check: "audits", tone: "warn" }];
        }
        return [];
      }
      const c = dueCounts(d.clients);
      const out: AttentionRow[] = [];
      if (c.late > 0) out.push({ key: `audit:${d.form.key}:late`, code, title: d.form.label, meta: `${plural(c.late, "client")} due now`, pill: { label: "Due now", tone: "warn" }, href: "/org/due/audits", action: "See which", check: "audits", tone: "alert" });
      if (c.soon > 0) out.push({ key: `audit:${d.form.key}:soon`, code, title: d.form.label, meta: `${plural(c.soon, "client")} due in the next 30 days`, pill: { label: "Due soon", tone: "warn" }, href: "/org/due/audits", action: "See which", check: "audits", tone: "warn" });
      return out;
    }),
    ...todoLines.filter((l) => !own.has(l.key)).map((l) => rowFromLine(l)),
  ];
  // Who can see what: an office worker's list leaves out the areas a manager switched off.
  const hidden = await hiddenAreasFor(context);
  const sorted = sortRows(rows).filter((r) => !isHiddenPath(r.href, hidden));
  const ready = readiness(complianceChecks(enabled), rows);
  const SHOWN = 8;

  // --- The four cards -------------------------------------------------------
  const supervisionsUpToDate = checks ? [...checks.values()].filter((c) => !isLate(c.supervision)).length : 0;
  const supervisionsSoon = checks ? [...checks.values()].filter((c) => c.supervision.status === "due_soon").length : 0;
  const serviceForms = (serviceDue ?? []).filter((d) => d.form.scope === "service");
  const auditsLate = (serviceDue ?? []).reduce((n, d) => n + (d.form.scope === "service" ? (d.status === "overdue" || d.status === "never" ? 1 : 0) : dueCounts(d.clients).late), 0);
  const auditsSoon = (serviceDue ?? []).reduce((n, d) => n + (d.form.scope === "service" ? (d.status === "due_soon" ? 1 : 0) : dueCounts(d.clients).soon), 0);
  const auditsNever = serviceForms.length > 0 && serviceForms.every((d) => d.status === "never");

  // --- Finish setting up, or Getting started on a trial ---------------------
  const tasks = facts
    ? gettingStarted({ ...facts, staff: allLearners.length, staffSignedIn: allLearners.filter((r) => !!r.lastSeenAt).length, assigned: totals.assigned, clients: clients ?? 0 }, enabled, context.userId)
    : [];
  const checklist = todayChecklist(trial, member.walkthrough, tasks);
  const steps: SetupStep[] = [
    { key: "org", label: "Create your organisation", done: true, href: "/org/settings" },
    { key: "manager", label: "Add yourself as manager", done: true, href: "/org/settings" },
    { key: "staff", label: "Invite your staff", done: allLearners.length > 1, href: "/org/learners/admin?section=invite" },
    { key: "training", label: "Assign mandatory training", done: totals.assigned > 0, href: "/org/courses/admin" },
    ...(clients !== null ? [{ key: "clients", label: "Add your clients", done: clients > 0, href: "/org/clients/new" }] : []),
  ];

  // --- Training across the team --------------------------------------------
  const open = Math.max(0, totals.assigned - totals.completed - totals.expired);
  const onTime = Math.max(0, open - totals.overdue);
  const segments = [
    { key: "completed", label: "completed", count: totals.completed, className: "bg-primary", dot: "bg-primary" },
    { key: "open", label: "in progress or not started", count: onTime, className: "bg-chart-2", dot: "bg-chart-2" },
    { key: "overdue", label: "overdue", count: Math.min(totals.overdue, open), className: "bg-amber-500", dot: "bg-amber-500" },
    ...(totals.expired > 0 ? [{ key: "expired", label: "to retake", count: totals.expired, className: "bg-danger-foreground", dot: "bg-danger-foreground" }] : []),
  ];

  const firstName = (member?.fullName ?? "").trim().split(/\s+/)[0] || null;
  const today = formatDate(now.toISOString(), { weekday: "long", day: "numeric", month: "long" });

  // --- The trial walkthrough (lib/walkthrough.ts) --------------------------
  // The welcome and tour open by themselves once, on a console user's first
  // sign-in while the company is on a trial; Help replays them.
  const walkthrough = trial.kind === "active" && (
    <Walkthrough
      autoStart={shouldOfferTour(context.role, trial, member.walkthrough)}
      enabled={enabled}
      firstName={firstName}
      orgName={organisation?.name ?? null}
      daysLeft={trial.daysLeft}
      endsOn={formatDate(trial.endsAt.toISOString(), { weekday: "long", day: "numeric", month: "long" })}
    />
  );

  return (
    <DashboardShell
      title="Today"
      context={context}
      header={
        <div className="mb-6">
          <p className="text-[15px] text-muted-foreground">
            {today}
            {organisation?.name ? ` · ${organisation.name}` : ""}
          </p>
          <h1 className="mt-0.5 text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
            {greeting(now)}
            {firstName ? `, ${firstName}` : ""}
          </h1>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <div className="col-span-2 xl:col-span-1">
            <ReadinessCard r={ready} />
          </div>
          <FigureCard
            label="Training complete"
            value={`${overallPct}%`}
            pct={overallPct}
            href="/org/learners/statistics"
            note={totals.assigned === 0 ? "Nothing assigned yet" : totals.overdue > 0 ? `${plural(totals.overdue, "course")} overdue` : "All assigned training on time"}
            noteTone={totals.overdue > 0 ? "danger" : "muted"}
          />
          {checks ? (
            <FigureCard
              label="Supervisions up to date"
              value={supervisionsUpToDate}
              of={`/ ${people.length}`}
              pct={people.length ? (supervisionsUpToDate / people.length) * 100 : 0}
              href="/org/due/supervisions"
              note={supervisionsSoon > 0 ? `${supervisionsSoon} due this month` : supervisionsUpToDate === people.length ? "Everyone is up to date" : `${people.length - supervisionsUpToDate} overdue or never held`}
              noteTone={supervisionsSoon > 0 ? "warn" : supervisionsUpToDate === people.length ? "muted" : "danger"}
            />
          ) : (
            <FigureCard
              label="Certificates"
              value={totals.certificates}
              pct={totals.certificates ? 100 : 0}
              href="/org/certificates"
              note={totals.expiring > 0 ? `${plural(totals.expiring, "certificate")} expiring soon` : "None expiring soon"}
              noteTone={totals.expiring > 0 ? "warn" : "muted"}
            />
          )}
          {serviceDue ? (
            <FigureCard
              label="Service audits"
              value={auditsLate}
              of="due"
              pct={serviceForms.length ? ((serviceForms.length - serviceForms.filter((d) => d.status === "overdue" || d.status === "never").length) / serviceForms.length) * 100 : 0}
              barTone={auditsLate > 0 ? "warn" : "primary"}
              href="/org/due/audits"
              note={auditsNever ? "Never carried out" : auditsLate > 0 ? `${auditsSoon > 0 ? `${auditsSoon} more due in the next 30 days` : "Due now"}` : auditsSoon > 0 ? `${auditsSoon} due in the next 30 days` : "All up to date"}
              noteTone={auditsNever ? "danger" : auditsLate + auditsSoon > 0 ? "warn" : "muted"}
            />
          ) : (
            <FigureCard
              label="Signed in"
              value={learners.length - neverRows.length}
              of={`/ ${learners.length}`}
              pct={learners.length ? ((learners.length - neverRows.length) / learners.length) * 100 : 0}
              href="/org/learners?filter=never"
              note={neverRows.length > 0 ? `${plural(neverRows.length, "person has", "people have")} never signed in` : "Everyone has signed in"}
              noteTone={neverRows.length > 0 ? "danger" : "muted"}
            />
          )}
        </div>

        {/* The right column is 440px (board 4 of the walkthrough mock-ups), so
            the Getting started list's routes read on one or two lines. */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px] xl:items-start">
          <AttentionList rows={sorted.slice(0, SHOWN)} allCount={sorted.length} allHref={enabled["people.supervisions"] ? "/org/due" : "/org/learners?filter=overdue"} />
          <div className="space-y-6">
            <OwnTraining open={ownOpen.length} overdue={ownOverdue} />
            {checklist === "getting-started" ? <GettingStarted tasks={tasks} /> : checklist === "setup" ? <SetupChecklist steps={steps} /> : null}
            {enabled["recruitment.tracker"] && <WhosOffWeek context={context} />}
            {/* "You may also be interested in" (TRIAL.md). */}
            <SameTeam context={context} />
          </div>
        </div>

        <TeamTraining segments={segments} href="/org/learners/statistics" />
      </div>
      {walkthrough}
    </DashboardShell>
  );
}
