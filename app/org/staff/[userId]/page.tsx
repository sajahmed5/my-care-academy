import { isStaff } from "@/lib/roles";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Clock, CheckCircle2, AlertTriangle, CalendarPlus, Download, FileArchive, Plus } from "lucide-react";
import { requireConsole, roleLabel } from "@/lib/auth";
import { enabledMap } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
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
import {
  loadAuditTraining,
  loadCompetencyChecks,
  loadSpotChecks,
  suggestionsFromSlugs,
} from "@/lib/competency";
import { competencyForm, suggestedSlugs } from "@/lib/audit-forms";
import { loadAuditForms } from "@/lib/audit-forms-data";
import { suggestionsFor, type Suggestion } from "@/lib/complaints/categories";
import { loadConcernTraining, loadConcernsForPerson } from "@/lib/complaints/person";
import { loadComplimentsForPerson } from "@/lib/complaints/compliments";
import { kindLabel, loadBookings, loadSupervisions, nextDueOf } from "@/lib/supervisions";
import { SectionPanel } from "./section-panel";
import { PersonPolicies } from "./policy-list";
import { ProfileTabs, type SectionCount } from "./section-tabs";
import { PersonOverview, type ActivityLine, type OverviewCheck } from "./overview";
import { Pill } from "@/components/pill";
import { initials } from "@/lib/initials";
import { dueStatus } from "@/lib/records";
import { loadReading } from "@/lib/policy-reading-data";
import { sectionByKey, sectionState } from "./sections";
import { CompetencyList } from "./competency-list";
import { EvidencePackButton } from "./evidence-pack-button";
import { StatusToggle } from "../../status-toggle";
import { DeleteStaffButton } from "../../delete-staff-button";
import { ConcernList } from "./concern-list";
import { SupervisionList } from "./supervision-list";
import { StaffDocuments } from "./staff-documents";
import { RecruitmentRecord } from "./recruitment-record";
import { AbsencePanel, CasesPanel, HolidaysPanel, LeavingPanel, LettersPanel, ProbationPanel } from "./employment";
import { STAFF_DOCS, staffDocState, staffDocTasks, type StaffDoc } from "@/lib/staff-documents";
import { TaskList } from "./task-list";
import { SubTabs } from "./sub-tabs";
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
  "overview",
  "training",
  "documents",
  "employment",
  "certificates",
  "actions",
  "supervisions",
  "competency",
  "complaints",
  "forms",
  "policies",
]);

/** The pages of the Employment section (HR-PACK.md). */
const EMPLOYMENT_TABS = [
  { key: "", label: "Probation" },
  { key: "absence", label: "Absence" },
  { key: "holidays", label: "Holidays" },
  { key: "cases", label: "Cases" },
  { key: "leaving", label: "Leaving" },
  { key: "letters", label: "Letters" },
];

/** Which courses the list below shows — the tiles switch between these. */
type Show = "all" | "in_progress" | "completed" | "overdue";
const SHOWS: Show[] = ["all", "in_progress", "completed", "overdue"];

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ show?: string; section?: string; sub?: string }>;
}) {
  const context = await requireConsole();
  const { userId } = await params;
  const { show: showParam, section: sectionParam, sub } = await searchParams;
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
    // The Overview (redesign, 1 Nov 2026) reads a little of several
    // sections — supervisions, documents, policies — for its checklist.
    const overviewOpen = section.key === "overview";
    const documentsOpen = section.key === "documents" && state === "open" && sub !== "recruitment";
    // Their compliance documents feed the task list as well as their own
    // section, so the Actions tab reads them too (ROADMAP §3).
    const wantsStaffDocs = documentsOpen || ((wantsTasks || overviewOpen) && enabled["recruitment.tracker"]);
    const supervisionsTab = section.key === "supervisions" && state === "open";
    const supervisionsOpen = supervisionsTab || (overviewOpen && enabled["people.supervisions"]);
    const competencyOpen = section.key === "competency" && state === "open";
    const [supervisions, bookings, holders, competencyChecks, spotChecks, auditForms, auditTraining, actionRows, formAsks, staffDocs, reading, employment] = await Promise.all([
      supervisionsOpen ? loadSupervisions(supabase, userId) : Promise.resolve([]),
      supervisionsOpen ? loadBookings(supabase, userId) : Promise.resolve([]),
      // Who can hold one: anyone with console access (STAFF-AUDITS.md).
      supervisionsTab
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
      competencyOpen ? loadCompetencyChecks(supabase, userId) : Promise.resolve([]),
      competencyOpen ? loadSpotChecks(supabase, userId) : Promise.resolve([]),
      competencyOpen ? loadAuditForms(context.organisationId!) : Promise.resolve(null),
      competencyOpen ? loadAuditTraining(supabase, userId) : Promise.resolve(new Map<string, Map<string, string | null>>()),
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
      // Which policies they have read, for the Overview's checklist.
      overviewOpen && enabled["documents.library"]
        ? loadReading(supabase, context.organisationId!, { userId }).catch(() => null)
        : Promise.resolve(null),
      // Their job title and start date, for the header (HR pack).
      enabled["recruitment.tracker"]
        ? supabase
            .from("staff_employment")
            .select("job_title, start_date")
            .eq("user_id", userId)
            .maybeSingle()
            .then((r) => (r.data as { job_title: string | null; start_date: string | null } | null) ?? null)
        : Promise.resolve(null),
    ]);
    return { enabled, state, supervisions, bookings, holders, competencyChecks, spotChecks, auditForms, auditTraining, actionRows, formAsks, staffDocs, reading, employment };
  });
  const [
    { profile, enrolments, certificates, assessments },
    { enabled, state, supervisions, bookings, holders, competencyChecks, spotChecks, auditForms, auditTraining, actionRows, formAsks, staffDocs, reading, employment },
    { data: libraryRows },
    { data: classroomRows },
  ] = await Promise.all([
    loadOrgLearnerTraining(supabase, userId),
    tabRead,
    // Everything in the library, flagged with what they already have, so a
    // manager can give this carer one more course without leaving the page.
    // Only the Training section offers it, so the other sections don't pay.
    section.key === "training"
      ? supabase.from("courses").select("id, title").is("retired_at", null).order("title")
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

  // Concerns this person is named in, and what each one suggests. The
  // suggestion needs the catalogue and what has already been assigned off
  // that record — both only on this tab, and only when entitled.
  const [concerns, compliments] =
    section.key === "complaints" && state === "open"
      ? await Promise.all([loadConcernsForPerson(supabase, userId), loadComplimentsForPerson(supabase, userId)])
      : [[], []];
  const suggestions: Record<string, Suggestion[]> = {};
  if (concerns.length) {
    const [{ data: courseRows }, assignedByConcern] = await Promise.all([
      supabase.from("courses").select("id, slug, title").is("retired_at", null).order("title"),
      loadConcernTraining(
        supabase,
        concerns.map((c) => c.id),
        userId,
      ),
    ]);
    const catalogue = (courseRows ?? []).map((c) => ({
      id: c.id as string,
      slug: c.slug as string,
      title: c.title as string,
    }));
    for (const concern of concerns) {
      suggestions[concern.id] = suggestionsFor({
        category: concern.category,
        courses: catalogue,
        assigned: assignedByConcern.get(concern.id) ?? new Map(),
      });
    }
  }

  // What a spot check or competency that fell short suggests, for the
  // manager to confirm (STAFF-AUDITS.md). The catalogue is read only when
  // something did fall short.
  const auditSuggestions: Record<string, Suggestion[]> = {};
  const shortfalls = [
    ...spotChecks
      .filter((c) => c.outcome !== "met")
      .map((c) => ({ key: `spot_check:${c.id}`, slugs: auditForms ? suggestedSlugs(auditForms.spotCheck, c.outcome, c.items) : [] })),
    ...competencyChecks
      .filter((c) => c.outcome !== "met")
      .map((c) => {
        const form = auditForms ? competencyForm(c.area, auditForms.competency) : undefined;
        return { key: `competency:${c.id}`, slugs: form ? suggestedSlugs(form, c.outcome, c.criteria) : [] };
      }),
  ].filter((s) => s.slugs.length > 0);
  if (shortfalls.length) {
    const { data: courseRows } = await supabase.from("courses").select("id, slug, title").is("retired_at", null).order("title");
    const catalogue = (courseRows ?? []).map((c) => ({ id: c.id as string, slug: c.slug as string, title: c.title as string }));
    for (const s of shortfalls) {
      auditSuggestions[s.key] = suggestionsFromSlugs(s.slugs, catalogue, auditTraining.get(s.key) ?? new Map());
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

  const base = `/org/staff/${userId}`;
  const jobTitle = employment?.job_title || null;
  const startDate = employment?.start_date || null;
  const isCarer = profile.role === "learner";

  // --- The Overview's checklist (docs/redesign image 4) ----------------------
  const overviewChecks: OverviewCheck[] = [];
  if (section.key === "overview") {
    if (enabled["people.supervisions"]) {
      for (const kind of ["supervision", "appraisal"] as const) {
        const held = supervisions.filter((x) => x.kind === kind);
        const next = nextDueOf(supervisions, kind);
        const booked = bookings.find((b) => b.kind === kind);
        const due = dueStatus(next, now);
        const status =
          held.length === 0 && !booked
            ? { label: "Never had one", tone: "danger" as const }
            : due === "overdue"
              ? { label: "Overdue", tone: "danger" as const }
              : booked
                ? { label: `Booked ${fmtDate(booked.booked_on)}`, tone: "ok" as const }
                : due === "due_soon"
                  ? { label: `Due ${fmtDate(next!)}`, tone: "warn" as const }
                  : due === "scheduled"
                    ? { label: `Due ${formatDate(next!, { month: "short", year: "numeric" })}`, tone: "ok" as const }
                    : { label: "No date set", tone: "warn" as const };
        overviewChecks.push({
          key: kind,
          title: kind === "supervision" ? "Supervision" : "Appraisal",
          blurb: kind === "supervision" ? "Regular 1:1s, held question by question and signed by both." : "Yearly review of performance and goals.",
          status,
          done: held.length > 0 && due !== "overdue",
          action: { label: kind === "supervision" ? "Book supervision" : "Book appraisal", href: `${base}/supervisions/new?kind=${kind}` },
        });
      }
    }
    overviewChecks.push({
      key: "training",
      title: "Mandatory training",
      blurb: stats.assigned === 0 ? "Assign the core set so certificates start building." : `${stats.completed} of ${stats.assigned} courses complete.`,
      status:
        stats.assigned === 0
          ? { label: "Nothing assigned", tone: "warn" }
          : stats.overdue > 0
            ? { label: `${stats.overdue} overdue`, tone: "danger" }
            : stats.completed === stats.assigned
              ? { label: "Done", tone: "ok" }
              : { label: `${stats.assigned - stats.completed} to finish`, tone: "warn" },
      done: stats.assigned > 0 && stats.overdue === 0,
      action: { label: stats.assigned === 0 ? "Assign training" : stats.overdue > 0 ? "See what's overdue" : "See their training", href: stats.overdue > 0 ? `${base}?section=training&show=overdue` : `${base}?section=training` },
    });
    if (enabled["recruitment.tracker"]) {
      const byType = new Map(staffDocs.map((d) => [d.doc_type, d]));
      const states = ["right_to_work", "dbs"].map((k) => staffDocState(byType.get(k), now, STAFF_DOCS.find((d) => d.key === k)));
      const status = states.includes("expired")
        ? { label: "Expired", tone: "danger" as const }
        : states.includes("missing")
          ? { label: "Missing", tone: "warn" as const }
          : states.includes("expiring")
            ? { label: "Expiring soon", tone: "warn" as const }
            : { label: "Done", tone: "ok" as const };
      overviewChecks.push({
        key: "documents",
        title: "Right to work & DBS",
        blurb: status.tone === "ok" ? "Both on file and in date." : "Upload documents to the staff file.",
        status,
        done: status.tone === "ok",
        action: { label: status.tone === "ok" ? "View documents" : "Upload", href: `${base}?section=documents` },
      });
    }
    if (enabled["documents.library"] && reading) {
      const mine = reading.entries.filter((e) => e.userId === userId);
      const late = mine.filter((e) => e.status === "late").length;
      const outstanding = mine.filter((e) => e.status === "outstanding").length;
      overviewChecks.push({
        key: "policies",
        title: "Policies read",
        blurb: mine.length === 0 ? "No policies are published for them yet." : late + outstanding === 0 ? "All current policies signed." : `${mine.length - late - outstanding} of ${mine.length} policies read and accepted.`,
        status: late > 0 ? { label: `${late} late`, tone: "danger" } : outstanding > 0 ? { label: `${outstanding} to read`, tone: "warn" } : { label: "Done", tone: "ok" },
        done: late === 0 && outstanding === 0,
        action: { label: "View", href: `${base}?section=policies` },
      });
    }
    const detailsDone = !!profile.full_name && !!profile.email && (!enabled["recruitment.tracker"] || (!!startDate && !!jobTitle));
    overviewChecks.push({
      key: "profile",
      title: "Profile details",
      blurb: detailsDone ? "Contact and employment details complete." : enabled["recruitment.tracker"] ? "Add their job title and start date." : "Add their name and email.",
      status: detailsDone ? { label: "Done", tone: "ok" } : { label: "Incomplete", tone: "warn" },
      done: detailsDone,
      action: { label: "Edit", href: enabled["recruitment.tracker"] ? `${base}?section=employment` : "/org/learners/admin" },
    });
  }
  const activity: ActivityLine[] = [
    ...(profile.last_seen_at ? [{ key: "seen", text: "Signed in", at: profile.last_seen_at, withTime: true }] : []),
    ...certificates.slice(0, 2).map((c) => ({ key: `cert:${c.id}`, text: `Certificate: ${c.title}`, at: c.issued_at })),
    ...supervisions.slice(0, 2).map((x) => ({ key: `sup:${x.id}`, text: `${kindLabel(x.kind)} held${x.supervisor_name ? ` by ${x.supervisor_name}` : ""}`, at: x.held_on })),
    ...(startDate ? [{ key: "started", text: `Started${jobTitle ? ` as ${jobTitle}` : ""}`, at: startDate }] : []),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  return (
    <DashboardShell
      title={name}
      context={context}
      header={
        <nav aria-label="Breadcrumb" className="mb-4 text-sm">
          <Link href="/org/learners" className="font-semibold text-primary hover:underline">
            Staff
          </Link>
          <span className="mx-1.5 text-muted-foreground">/</span>
          <span className="text-muted-foreground">{name}</span>
        </nav>
      }
    >
      {/* The person, then every section of their file as tabs (docs/redesign
          image 4). It was a rail down the left until 1 Nov 2026. */}
      <div className="rounded-card border bg-card">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
          <span aria-hidden className="inline-flex size-16 shrink-0 items-center justify-center rounded-full bg-sidebar text-xl font-extrabold text-sidebar-foreground sm:size-20 sm:text-2xl">
            {initials(profile.full_name, profile.email)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">{name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[15px] text-muted-foreground">
              <Pill tone="ok">{jobTitle ?? (isCarer ? "Care worker" : roleLabel(profile.role))}</Pill>
              {profile.status === "deactivated" && <Pill tone="danger">Deactivated</Pill>}
              {profile.email && <span className="truncate">{profile.email}</span>}
              {startDate && <span>· Started {fmtDate(startDate)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canRemind && <NudgeButton userId={userId} lastRemindedAt={lastRemindedAt} />}
            <EvidencePackButton userId={userId} />
            {isStaff(profile.role as string) && profile.status !== "deactivated" && (
              <Link href={`${base}?section=training#assign`} className={buttonVariants({ variant: "outline" })}>
                <Plus className="size-4" aria-hidden />
                Assign course
              </Link>
            )}
            {enabled["people.supervisions"] && profile.status !== "deactivated" && (
              <Link href={`${base}/supervisions/new?kind=supervision`} className={buttonVariants({ variant: "default" })}>
                <CalendarPlus className="size-4" aria-hidden />
                Book supervision
              </Link>
            )}
          </div>
        </div>
        <ProfileTabs userId={userId} active={section.key} enabled={enabled} counts={counts} />
      </div>

      <div className="mt-6 min-w-0 space-y-6">
        {section.key === "overview" && (
          <PersonOverview checks={overviewChecks} activity={activity}>
            {/* Removing someone from their own page, where a manager looks
                for it (#78) — the same buttons and rule as the staff list:
                never yourself, and only a manager removes console staff. */}
            {userId !== context.userId && (isCarer || context.role === "org_admin") && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border bg-card p-5">
                <div>
                  <p className="font-bold">Account</p>
                  <p className="text-sm text-muted-foreground">
                    {profile.status === "deactivated" ? "They can't sign in. Their records are kept." : "Deactivate when they leave; their records are kept."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <StatusToggle userId={userId} status={profile.status ?? "active"} name={name} />
                  <DeleteStaffButton userId={userId} name={name} redirectTo="/org/learners" />
                </div>
              </div>
            )}
          </PersonOverview>
        )}

        {/* A section shown as a panel carries its own title. */}
        {INLINE_SECTIONS.has(section.key) && section.key !== "overview" && state === "open" && (
          <h2 className="text-lg font-extrabold tracking-tight">{section.label}</h2>
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
              <div id="assign" className="scroll-mt-28">
                <AssignToPerson
                  userId={userId}
                  name={name}
                  courses={library}
                  defaultDueDate={endOfMonthISO()}
                />
              </div>
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

        {section.key === "policies" && state === "open" && (
          <PersonPolicies organisationId={context.organisationId!} userId={userId} />
        )}

        {section.key === "documents" && state === "open" && (
          <div className="space-y-4">
            <SubTabs
              base={`/org/staff/${userId}?section=documents`}
              active={sub === "recruitment" ? "recruitment" : ""}
              tabs={[
                { key: "", label: "Documents" },
                { key: "recruitment", label: "Recruitment" },
              ]}
            />
            {sub === "recruitment" ? <RecruitmentRecord userId={userId} /> : <StaffDocuments userId={userId} docs={staffDocs} />}
          </div>
        )}

        {section.key === "employment" && state === "open" && (
          <div className="space-y-4">
            <SubTabs
              base={`/org/staff/${userId}?section=employment`}
              active={EMPLOYMENT_TABS.some((t) => t.key === sub) ? sub! : ""}
              tabs={EMPLOYMENT_TABS}
            />
            {sub === "letters" ? (
              <LettersPanel supabase={supabase} userId={userId} />
            ) : sub === "leaving" ? (
              <LeavingPanel supabase={supabase} userId={userId} context={context} />
            ) : sub === "cases" ? (
              <CasesPanel supabase={supabase} userId={userId} />
            ) : sub === "holidays" ? (
              <HolidaysPanel supabase={supabase} userId={userId} orgId={context.organisationId!} me={{ id: context.userId, role: context.role! }} />
            ) : sub === "absence" ? (
              <AbsencePanel supabase={supabase} userId={userId} orgId={context.organisationId!} />
            ) : (
              <ProbationPanel supabase={supabase} userId={userId} orgId={context.organisationId!} />
            )}
          </div>
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
              canRaisePlan={enabled["people.performance_plans"]}
            />
          </div>
        )}

        {section.key === "competency" && state === "open" && (
          <div id="competency" className="scroll-mt-24 space-y-2">
            <CompetencyList
              userId={userId}
              isCarer={profile.role === "learner"}
              checks={competencyChecks}
              spotChecks={spotChecks}
              suggestions={auditSuggestions}
              areas={(auditForms?.competency ?? []).map((f) => ({ value: f.key, label: f.label }))}
              canRaisePlan={enabled["people.performance_plans"]}
            />
          </div>
        )}

        {section.key === "complaints" && state === "open" && (
          <div id="complaints" className="scroll-mt-24 space-y-2">
            <ConcernList
              userId={userId}
              concerns={concerns}
              compliments={compliments}
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

      </div>
    </DashboardShell>
  );
}
