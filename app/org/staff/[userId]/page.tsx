import { isStaff } from "@/lib/roles";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Clock, CheckCircle2, AlertTriangle, Download, FileArchive } from "lucide-react";
import { requireConsole, roleLabel } from "@/lib/auth";
import { enabledMap } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  ProgressRing,
  StatTile,
  StatusPill,
  TopicBadge,
  type StatusVariant,
} from "@/components/learner-ui";
import { learnerStats } from "@/lib/learner-stats";
import { NudgeButton } from "../../nudge-button";
import { UnassignButton } from "../../unassign-button";
import { AssignToPerson } from "./assign-to-person";
import { buildPersonTasks, loadPersonActions } from "@/lib/person-tasks";
import { loadAssignmentsForPerson } from "@/lib/form-library";
import { loadCompetencyChecks } from "@/lib/competency";
import {
  loadIncidentTraining,
  loadIncidentsForPerson,
  suggestionsFor,
  type Suggestion,
} from "@/lib/incidents";
import { loadBookings, loadSupervisions } from "@/lib/supervisions";
import { SectionPanel } from "./section-panel";
import { SectionRail, SectionTabs, SectionTabsAfter, type SectionCount } from "./section-tabs";
import { sectionByKey, sectionState } from "./sections";
import { CompetencyList } from "./competency-list";
import { EvidencePackButton } from "./evidence-pack-button";
import { IncidentList } from "./incident-list";
import { SupervisionList } from "./supervision-list";
import { StaffDocuments, type ApplicationDoc } from "./staff-documents";
import { staffDocTasks, type StaffDoc } from "@/lib/staff-documents";
import { docLabel } from "@/lib/recruitment";
import { TaskList } from "./task-list";
import { endOfMonthISO } from "@/lib/assign";
import { isOverdue, isAssessmentDue, expiryFlag } from "@/lib/engine-logic";
import {
  loadOrgLearnerTraining,
  formatDuration,
  type OrgEnrolment,
} from "@/lib/org-learner";
import { formatDate } from "@/lib/dates";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return formatDate(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusVariant(e: OrgEnrolment, now: Date): StatusVariant {
  if (isOverdue(e.due_date, e.status, now)) return "overdue";
  if (e.status === "completed") return "completed";
  if (e.status === "expired") return "retake";
  // Overdue still wins above — for a manager that is the compliance fact —
  // but below it, "read it all, hasn't sat the test" beats a bare
  // "In progress" sitting next to 100%.
  if (isAssessmentDue(e.status, e.progress)) return "assessment_due";
  if (e.status === "in_progress") return "in_progress";
  return "assigned";
}

/** Sections this page renders itself; the rest get a panel. */
const INLINE_SECTIONS = new Set([
  "training",
  "recruitment",
  "certificates",
  "actions",
  "supervisions",
  "competency",
  "complaints",
  "forms",
]);

/** Which courses the list below shows — the tiles switch between these. */
type Show = "all" | "in_progress" | "completed" | "overdue";
const SHOWS: Show[] = ["all", "in_progress", "completed", "overdue"];

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ show?: string; section?: string }>;
}) {
  const context = await requireConsole();
  const { userId } = await params;
  const { show: showParam, section: sectionParam } = await searchParams;
  const show: Show = SHOWS.includes(showParam as Show) ? (showParam as Show) : "all";

  // Which part of the file is open. An unknown key falls back to Training
  // rather than 404ing: these links are pasted into emails.
  const section = sectionByKey(sectionParam);
  const supabase = await createClient();

  // Everything this tab needs, started together. These were one await after
  // another — entitlements, then the training record, then the library, then
  // the tab's own records — so each page paid four round trips to Frankfurt
  // end to end. The tab's records still wait for the entitlement answer
  // (a locked section must run no query), but not for the training record.
  const enabledRead = enabledMap(context);
  const tabRead = enabledRead.then(async (enabled) => {
    const state = sectionState(section, enabled);
    // Locked sections run no query — CARER-FILE.md §3. The organisation may
    // still have rows from before a downgrade, and fetching them to grey them
    // out would be a way to read what they stopped paying for.
    const wantsTasks = section.key === "actions" || section.key === "forms";
    const recruitmentOpen = section.key === "recruitment" && state === "open";
    // Their compliance documents feed the task list as well as their own
    // section, so the Actions tab reads them too (ROADMAP §3).
    const wantsStaffDocs = recruitmentOpen || (wantsTasks && enabled["recruitment.tracker"]);
    const supervisionsOpen = section.key === "supervisions" && state === "open";
    const [supervisions, bookings, holders, competencyChecks, actionRows, formAsks, staffDocs, applicationDocs] = await Promise.all([
      supervisionsOpen ? loadSupervisions(supabase, userId) : Promise.resolve([]),
      supervisionsOpen ? loadBookings(supabase, userId) : Promise.resolve([]),
      // Who can hold one: anyone with console access (STAFF-AUDITS.md).
      supervisionsOpen
        ? supabase
            .from("users")
            .select("id, full_name, email")
            .eq("organisation_id", context.organisationId!)
            .in("role", ["org_admin", "org_office"])
            .eq("status", "active")
            .order("full_name")
            .limit(200)
            .then((r) =>
              (r.data ?? []).map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) })),
            )
        : Promise.resolve([] as { id: string; name: string }[]),
      section.key === "competency" && state === "open"
        ? loadCompetencyChecks(supabase, userId)
        : Promise.resolve([]),
      // The written-down half of the task list, on the tab that shows it. The
      // derived half comes from the training record.
      wantsTasks ? loadPersonActions(supabase, userId) : Promise.resolve([]),
      wantsTasks && enabled["forms.builder"]
        ? loadAssignmentsForPerson(supabase, userId)
        : Promise.resolve([]),
      wantsStaffDocs
        ? supabase
            .from("staff_documents")
            .select("id, doc_type, file_name, file_path, expires_at, not_required, not_required_reason")
            .eq("user_id", userId)
            .then((r) => (r.data ?? []) as StaffDoc[])
        : Promise.resolve([] as StaffDoc[]),
      recruitmentOpen ? loadApplicationDocs(supabase, userId) : Promise.resolve([] as ApplicationDoc[]),
    ]);
    return { enabled, state, supervisions, bookings, holders, competencyChecks, actionRows, formAsks, staffDocs, applicationDocs };
  });
  const [
    { profile, enrolments, certificates, assessments },
    { enabled, state, supervisions, bookings, holders, competencyChecks, actionRows, formAsks, staffDocs, applicationDocs },
    { data: libraryRows },
    { data: classroomRows },
  ] = await Promise.all([
    loadOrgLearnerTraining(supabase, userId),
    tabRead,
    // Everything in the library, flagged with what they already have, so a
    // manager can give this carer one more course without leaving the page.
    // Only the Training section offers it, so the other sections don't pay.
    section.key === "training"
      ? supabase.from("courses").select("id, title").order("title")
      : Promise.resolve({ data: null }),
    // Face-to-face sessions they attended (ROADMAP §4), on the Training tab.
    section.key === "training"
      ? supabase
          .from("classroom_attendance")
          .select("certificate_id, session:classroom_sessions (title, held_on, trainer_name, duration_minutes)")
          .eq("user_id", userId)
          .limit(200)
      : Promise.resolve({ data: null }),
  ]);
  if (!profile) notFound();
  const classroom = (classroomRows ?? [])
    .map((r) => {
      const s = (Array.isArray(r.session) ? r.session[0] : r.session) as
        | { title: string; held_on: string; trainer_name: string | null; duration_minutes: number | null }
        | null;
      return s ? { ...s, certified: !!r.certificate_id } : null;
    })
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => b.held_on.localeCompare(a.held_on));

  const now = new Date();
  const stats = learnerStats(enrolments, certificates, now);
  const name = profile.full_name ?? profile.email ?? "Learner";
  // Latest reminder across their enrolments — the same figure the learners
  // list shows under its Remind button.
  const lastRemindedAt = enrolments.reduce<string | null>(
    (latest, e) =>
      e.last_reminder_at && (!latest || e.last_reminder_at > latest)
        ? e.last_reminder_at
        : latest,
    null,
  );
  const canRemind =
    profile.status !== "deactivated" &&
    (!profile.last_seen_at || stats.completed < stats.assigned);

  // The tiles are links: clicking "Overdue" shows only the overdue courses
  // rather than leaving the manager to find them among twenty (Saj, 7 Oct).
  const shownEnrolments = enrolments.filter((e) => {
    switch (show) {
      case "overdue":
        return isOverdue(e.due_date, e.status, now);
      case "completed":
        return e.status === "completed";
      case "in_progress":
        return e.status === "in_progress" || isAssessmentDue(e.status, e.progress);
      default:
        return true;
    }
  });
  const SHOW_LABEL: Record<Show, string> = {
    all: "Courses",
    in_progress: "In progress",
    completed: "Completed",
    overdue: "Overdue",
  };

  const assignedIds = new Set(enrolments.map((e) => e.course_id));
  const library = (libraryRows ?? []).map((c) => ({
    id: c.id as string,
    title: c.title as string,
    already: assignedIds.has(c.id as string),
  }));

  const tasks = buildPersonTasks({
    enrolments,
    certificates,
    actions: actionRows,
    forms: formAsks.map((a) => ({
      id: a.id,
      title: a.template_title,
      due_date: a.due_date,
      completed_at: a.completed_at,
    })),
    documents: staffDocTasks(staffDocs, now),
    now,
  });
  const doneActions = actionRows.filter((a) => a.completed_at);

  // Complaints this person is named in, and what each one suggests. The
  // suggestion needs the catalogue and what has already been assigned off
  // that record — both only on this tab, and only when entitled.
  const incidents =
    section.key === "complaints" && state === "open"
      ? await loadIncidentsForPerson(supabase, userId)
      : [];
  const suggestions: Record<string, Suggestion[]> = {};
  if (incidents.length) {
    const [{ data: courseRows }, assignedByIncident] = await Promise.all([
      supabase.from("courses").select("id, slug, title").order("title"),
      loadIncidentTraining(
        supabase,
        incidents.map((i) => i.id),
        userId,
      ),
    ]);
    const catalogue = (courseRows ?? []).map((c) => ({
      id: c.id as string,
      slug: c.slug as string,
      title: c.title as string,
    }));
    for (const incident of incidents) {
      suggestions[incident.id] = suggestionsFor({
        category: incident.category,
        courses: catalogue,
        assigned: assignedByIncident.get(incident.id) ?? new Map(),
      });
    }
  }

  // Newest certificate per course (list is already issued_at desc).
  const certByCourse = new Map<string, (typeof certificates)[number]>();
  for (const c of certificates) if (!certByCourse.has(c.course_id)) certByCourse.set(c.course_id, c);

  // What is outstanding, on the section list, so a manager sees where the
  // problems are without opening every section. Only what this page has
  // already read on every section: training and certificates.
  const counts: Record<string, SectionCount> = {};
  if (stats.overdue > 0) counts.training = { text: `${stats.overdue} overdue`, tone: "danger" };
  if (certificates.length > 0) counts.certificates = { text: String(certificates.length), tone: "muted" };

  return (
    <DashboardShell title={name} context={context} back={{ href: "/org/learners#learners", label: "All learners" }}>
      <div className="md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-8">
        {/* The person, and every section of their file, down the left. Across
            the top as tabs, most sections were off the edge and it was not
            apparent there was more than Training (Saj, 27 Oct 2026). */}
        <aside className="space-y-4 md:sticky md:top-28">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-4 md:flex-col md:items-start">
                <ProgressRing value={stats.overallPct} size={72} stroke={8}>
                  <span className="text-lg font-semibold">{stats.overallPct}%</span>
                </ProgressRing>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                      {roleLabel(profile.role)}
                    </span>
                    {profile.status === "deactivated" && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                        Deactivated
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canRemind && (
                  <NudgeButton
                    userId={userId}
                    lastRemindedAt={lastRemindedAt}
                  />
                )}
                <EvidencePackButton userId={userId} />
              </div>
            </CardContent>
          </Card>

          <SectionRail userId={userId} active={section.key} enabled={enabled} counts={counts} />
        </aside>

        <div className="mt-6 min-w-0 space-y-6 md:mt-0">
        <SectionTabs userId={userId} active={section.key} enabled={enabled} />

        {/* A section shown as a panel carries its own title. */}
        {INLINE_SECTIONS.has(section.key) && state === "open" && (
          <h2 className="hidden text-lg font-semibold md:block">{section.label}</h2>
        )}

        {section.key === "training" && (
          <>
            {/* At-a-glance tiles */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile
                label="Assigned"
                value={stats.assigned}
                icon={BookOpen}
                color="#6366f1"
                href={`/org/staff/${userId}#courses`}
                hint={show === "all" ? "Showing all" : "Show all"}
              />
              <StatTile
                label="In progress"
                value={stats.inProgress}
                icon={Clock}
                color="#f59e0b"
                href={`/org/staff/${userId}?show=in_progress#courses`}
                hint={show === "in_progress" ? "Showing these" : undefined}
              />
              <StatTile
                label="Completed"
                value={stats.completed}
                icon={CheckCircle2}
                color="#10b981"
                href={`/org/staff/${userId}?show=completed#courses`}
                hint={show === "completed" ? "Showing these" : undefined}
              />
              <StatTile
                label="Overdue"
                value={stats.overdue}
                icon={AlertTriangle}
                color="#ef4444"
                href={`/org/staff/${userId}?show=overdue#courses`}
                hint={show === "overdue" ? "Showing these" : undefined}
              />
            </div>

            {certificates.length > 0 && (
              <a
                href={`/org/certificates/pack?userId=${userId}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors hover:bg-accent sm:min-h-9"
              >
                <FileArchive className="size-4" />
                Download all {certificates.length} certificates (ZIP)
              </a>
            )}

            {isStaff(profile.role as string) && profile.status !== "deactivated" && (
              <AssignToPerson
                userId={userId}
                name={name}
                courses={library}
                defaultDueDate={endOfMonthISO()}
              />
            )}

            {/* Per-course breakdown */}
            <div id="courses" className="scroll-mt-24 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {SHOW_LABEL[show]} ({shownEnrolments.length}
                  {show === "all" ? "" : ` of ${enrolments.length}`})
                </h3>
                {show !== "all" && (
                  <Link
                    href={`/org/staff/${userId}#courses`}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline sm:min-h-0"
                  >
                    Show all courses
                  </Link>
                )}
              </div>
              {shownEnrolments.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    {show === "all"
                      ? "No training assigned to this person yet."
                      : `Nothing ${SHOW_LABEL[show].toLowerCase()} for this person.`}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {shownEnrolments.map((e) => {
                    const a = assessments.get(e.course_id);
                    const cert = certByCourse.get(e.course_id);
                    const pct = e.status === "completed" ? 100 : e.progress;
                    const certFlag = cert
                      ? expiryFlag(cert.expires_at ? new Date(cert.expires_at) : null, now)
                      : "none";
                    return (
                      <Card key={e.id}>
                        <CardContent className="space-y-3 pt-6">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="space-y-1">
                              <p className="font-medium">{e.title}</p>
                              <TopicBadge topic={e.topic} />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusPill variant={statusVariant(e, now)} />
                              {/* Completed and expired training is a record, not
                                  an assignment — no way to delete it from here. */}
                              {(e.status === "not_started" ||
                                e.status === "in_progress") && (
                                <UnassignButton
                                  userId={userId}
                                  courseId={e.course_id}
                                  course={e.title}
                                  learner={name}
                                  inProgress={e.status === "in_progress"}
                                />
                              )}
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="space-y-1">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-teal-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>{pct}% content</span>
                              <span>Time spent: {formatDuration(e.time_spent)}</span>
                              <span>Assigned {fmtDate(e.assigned_at)}</span>
                              {e.due_date && <span>Due {fmtDate(e.due_date)}</span>}
                            </div>
                          </div>

                          {/* Assessment history */}
                          {a && a.attempts > 0 ? (
                            <div className="rounded-lg border bg-muted/30 p-3">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                <span className="font-medium">Assessment</span>
                                <span className="text-muted-foreground">
                                  {a.attempts} attempt{a.attempts === 1 ? "" : "s"}
                                </span>
                                <span className="text-muted-foreground">
                                  Best {a.best ?? 0}%
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                    a.passed
                                      ? "bg-green-100 text-green-700"
                                      : "bg-rose-100 text-rose-700"
                                  }`}
                                >
                                  {a.passed ? "Passed" : "Not yet passed"}
                                </span>
                              </div>
                              <ul className="mt-2 space-y-1">
                                {a.history.map((h, i) => (
                                  <li
                                    key={i}
                                    className="flex items-center justify-between text-xs text-muted-foreground"
                                  >
                                    <span>{fmtDate(h.submitted_at)}</span>
                                    <span className="flex items-center gap-2">
                                      <span className="font-medium text-foreground">
                                        {h.score}%
                                      </span>
                                      <span
                                        className={
                                          h.passed ? "text-green-600" : "text-rose-600"
                                        }
                                      >
                                        {h.passed ? "Pass" : "Fail"}
                                      </span>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No assessment attempts yet.
                            </p>
                          )}

                          {/* Certificate */}
                          {cert && (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                              <span className="font-medium">Certificate</span>
                              <span className="font-mono text-muted-foreground">
                                {cert.number}
                              </span>
                              <span className="text-muted-foreground">
                                · issued {fmtDate(cert.issued_at)}
                              </span>
                              <span
                                className={
                                  certFlag === "red"
                                    ? "text-rose-600"
                                    : certFlag === "amber"
                                      ? "text-amber-700"
                                      : "text-muted-foreground"
                                }
                              >
                                ·{" "}
                                {cert.expires_at
                                  ? `expires ${fmtDate(cert.expires_at)}`
                                  : "no expiry"}
                              </span>
                              <a
                                href={`/org/certificates/${cert.id}/download`}
                                className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline sm:min-h-0"
                              >
                                <Download className="size-3.5" />
                                Download PDF
                              </a>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
            {classroom.length > 0 && (
              <Card>
                <CardContent className="space-y-2 pt-6">
                  <p className="text-sm font-semibold">Classroom sessions</p>
                  <ul className="divide-y text-sm">
                    {classroom.map((c, n) => (
                      <li key={n} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <span>
                          {c.title}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {[c.trainer_name, c.duration_minutes ? `${c.duration_minutes} min` : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {fmtDate(c.held_on)}
                          {c.certified ? " · certificate issued" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {section.key === "certificates" && (
          <div id="certificates" className="scroll-mt-24 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Certificates ({certificates.length})
              </h3>
              {certificates.length > 0 && (
                <a
                  href={`/org/certificates/pack?userId=${userId}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors hover:bg-accent sm:min-h-9"
                >
                  <FileArchive className="size-4" />
                  Download all {certificates.length} (ZIP)
                </a>
              )}
            </div>
            {certificates.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No certificates yet — they are issued as courses are completed.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {certificates.map((c) => {
                  const flag = expiryFlag(
                    c.expires_at ? new Date(c.expires_at) : null,
                    now,
                  );
                  return (
                    <Card key={c.id}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-6">
                        <div className="space-y-1">
                          <p className="font-medium">
                            {c.title}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {c.number}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="text-muted-foreground">
                            Issued {fmtDate(c.issued_at)}
                          </span>
                          <span
                            className={
                              flag === "red"
                                ? "text-rose-600"
                                : flag === "amber"
                                  ? "text-amber-700"
                                  : "text-muted-foreground"
                            }
                          >
                            {c.expires_at
                              ? `Expires ${fmtDate(c.expires_at)}`
                              : "No expiry"}
                          </span>
                          <a
                            href={`/org/certificates/${c.id}/download`}
                            className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline sm:min-h-0"
                          >
                            <Download className="size-3.5" />
                            PDF
                          </a>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {section.key === "actions" && (
          <div id="actions" className="scroll-mt-24 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Outstanding ({tasks.length})
            </h3>
            <TaskList userId={userId} tasks={tasks} completed={doneActions} />
          </div>
        )}

        {section.key === "recruitment" && state === "open" && (
          <StaffDocuments userId={userId} docs={staffDocs} applicationDocs={applicationDocs} />
        )}

        {section.key === "supervisions" && state === "open" && (
          <div id="supervisions" className="scroll-mt-24 space-y-2">
            <SupervisionList
              userId={userId}
              carerName={name}
              supervisions={supervisions}
              bookings={bookings}
              holders={holders}
              meId={context.userId}
            />
          </div>
        )}

        {section.key === "competency" && state === "open" && (
          <div id="competency" className="scroll-mt-24 space-y-2">
            <CompetencyList userId={userId} checks={competencyChecks} />
          </div>
        )}

        {section.key === "complaints" && state === "open" && (
          <div id="complaints" className="scroll-mt-24 space-y-2">
            <IncidentList
              userId={userId}
              incidents={incidents}
              suggestions={suggestions}
            />
          </div>
        )}

        {section.key === "forms" && state === "open" && (
          <div id="forms" className="scroll-mt-24 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Forms ({formAsks.length})
              </h3>
              <Link href="/org/forms" className="text-sm font-medium text-primary hover:underline">
                Ask them to complete a form →
              </Link>
            </div>
            {formAsks.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No forms asked of this person yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {formAsks.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-6">
                      <div>
                        <Link href={`/org/forms/library/${a.template_code}`} className="font-medium hover:underline">
                          {a.template_title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {a.completed_at
                            ? `Completed ${fmtDate(a.completed_at)}`
                            : a.due_date
                              ? `Due ${fmtDate(a.due_date)}`
                              : "No date"}
                        </p>
                      </div>
                      <span className="flex items-center gap-2">
                        {a.completed_at && (
                          <Link
                            href={`/org/forms/library/${encodeURIComponent(a.template_code)}/responses/${a.id}`}
                            className="text-xs text-indigo-700 hover:underline"
                          >
                            View answers
                          </Link>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            a.completed_at ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {a.completed_at ? "Completed" : "Open"}
                        </span>
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {(!INLINE_SECTIONS.has(section.key) || state !== "open") && (
          <SectionPanel
            section={section}
            state={state}
            href={
              section.key === "care-certificate"
                ? `/org/observations/${userId}`
                : section.href
            }
          />
        )}

        <SectionTabsAfter userId={userId} active={section.key} enabled={enabled} />
        </div>
      </div>
    </DashboardShell>
  );
}

/**
 * The documents collected when this person applied: the recruitment record
 * they were hired from, matched by email within the organisation (hiring
 * creates the account from the candidate's email). Read under RLS.
 */
async function loadApplicationDocs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ApplicationDoc[]> {
  const { data: person } = await supabase.from("users").select("email, organisation_id").eq("id", userId).maybeSingle();
  if (!person?.email) return [];
  const { data: cands } = await supabase
    .from("candidates")
    .select("id")
    .eq("organisation_id", person.organisation_id as string)
    .ilike("email", person.email as string);
  const ids = (cands ?? []).map((c) => c.id as string);
  if (ids.length === 0) return [];
  const { data: docs } = await supabase
    .from("candidate_documents")
    .select("doc_type, file_path, expires_at")
    .in("candidate_id", ids)
    .not("file_path", "is", null);
  return (docs ?? []).map((d) => ({
    label: docLabel(d.doc_type as string),
    file_path: d.file_path as string,
    expires_at: (d.expires_at as string | null) ?? null,
  }));
}
