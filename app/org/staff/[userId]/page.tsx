import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Clock, CheckCircle2, AlertTriangle, Download, FileArchive } from "lucide-react";
import { requireRole } from "@/lib/auth";
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
import { learnerStats } from "@/lib/learner-data";
import { NudgeButton } from "../../nudge-button";
import { UnassignButton } from "../../unassign-button";
import { AssignToPerson } from "./assign-to-person";
import { buildPersonTasks, loadPersonActions } from "@/lib/person-tasks";
import { loadCompetencyChecks } from "@/lib/competency";
import {
  loadIncidentTraining,
  loadIncidentsForPerson,
  suggestionsFor,
  type Suggestion,
} from "@/lib/incidents";
import { loadSupervisions } from "@/lib/supervisions";
import { SectionPanel } from "./section-panel";
import { SectionTabs } from "./section-tabs";
import { sectionByKey, sectionState } from "./sections";
import { CompetencyList } from "./competency-list";
import { EvidencePackButton } from "./evidence-pack-button";
import { IncidentList } from "./incident-list";
import { SupervisionList } from "./supervision-list";
import { TaskList } from "./task-list";
import { endOfMonthISO } from "@/lib/assign";
import { isOverdue, isAssessmentDue, expiryFlag } from "@/lib/engine-logic";
import {
  loadOrgLearnerTraining,
  formatDuration,
  type OrgEnrolment,
} from "@/lib/org-learner";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
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
  "certificates",
  "actions",
  "supervisions",
  "competency",
  "complaints",
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
  const context = await requireRole("org_admin");
  const { userId } = await params;
  const { show: showParam, section: sectionParam } = await searchParams;
  const show: Show = SHOWS.includes(showParam as Show) ? (showParam as Show) : "all";

  // Which part of the file is open. An unknown key falls back to Training
  // rather than 404ing: these links are pasted into emails.
  const section = sectionByKey(sectionParam);
  const enabled = await enabledMap(context);
  const state = sectionState(section, enabled);

  const supabase = await createClient();
  const { profile, enrolments, certificates, assessments } =
    await loadOrgLearnerTraining(supabase, userId);
  if (!profile) notFound();

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

  // Everything in the library, flagged with what they already have, so a
  // manager can give this carer one more course without leaving the page.
  // Only the Training section offers it, and it reads the whole course table,
  // so the other sections do not pay for it.
  const { data: libraryRows } =
    section.key === "training"
      ? await supabase.from("courses").select("id, title").order("title")
      : { data: null };
  const assignedIds = new Set(enrolments.map((e) => e.course_id));
  const library = (libraryRows ?? []).map((c) => ({
    id: c.id as string,
    title: c.title as string,
    already: assignedIds.has(c.id as string),
  }));

  // Locked sections run no query — CARER-FILE.md §3. The organisation may
  // still have rows from before a downgrade, and fetching them to grey them
  // out would be a way to read what they stopped paying for.
  const supervisions =
    section.key === "supervisions" && state === "open"
      ? await loadSupervisions(supabase, userId)
      : [];
  const competencyChecks =
    section.key === "competency" && state === "open"
      ? await loadCompetencyChecks(supabase, userId)
      : [];

  // The written-down half of the task list, on the tab that shows it. The
  // derived half is already in hand: enrolments and certificates above.
  const actionRows =
    section.key === "actions" ? await loadPersonActions(supabase, userId) : [];
  const tasks = buildPersonTasks({
    enrolments,
    certificates,
    actions: actionRows,
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

  return (
    <DashboardShell title={name} context={context}>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          href="/org/learners#learners"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All learners
        </Link>

        {/* Learner header */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-6 pt-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{name}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                  {profile.role === "org_admin" ? "Admin" : "Learner"}
                </span>
                {profile.status === "deactivated" && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                    Deactivated
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
            </div>
            <div className="flex items-center gap-6">
              {canRemind && (
                <NudgeButton
                  userId={userId}
                  lastRemindedAt={lastRemindedAt}
                />
              )}
              <ProgressRing value={stats.overallPct} size={104} stroke={10}>
                <span className="text-2xl font-semibold">{stats.overallPct}%</span>
                <span className="text-xs text-muted-foreground">overall</span>
              </ProgressRing>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            The whole file on this person — training, records and what is
            outstanding.
          </p>
          <EvidencePackButton userId={userId} />
        </div>

        <SectionTabs userId={userId} active={section.key} enabled={enabled} />

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

            {profile.role === "learner" && profile.status !== "deactivated" && (
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
                                      ? "text-amber-600"
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
                                  ? "text-amber-600"
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

        {section.key === "supervisions" && state === "open" && (
          <div id="supervisions" className="scroll-mt-24 space-y-2">
            <SupervisionList userId={userId} supervisions={supervisions} />
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

      </div>
    </DashboardShell>
  );
}
