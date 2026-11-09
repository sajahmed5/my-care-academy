import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate } from "@/lib/dates";

/**
 * The audit trail, in plain English, for the people who caused it.
 *
 * Every sensitive action has been written to audit_logs since phase 10, and
 * org admins could already read their own organisation's rows under RLS — but
 * no page in the console ever showed them. A manager who deactivated the
 * wrong carer at 4pm, or can't remember whether she assigned the moving and
 * handling refresher, had nowhere to look (usability audit, 7 Oct 2026).
 *
 * Every action the app logs has its own sentence here. The feed used to say
 * "Made a change" for anything it had no words for, which by November 2026
 * was most of the HR and recruitment trail (issue report 103, 7 Nov 2026):
 * a line that says nothing is worse than no line, so an action without words
 * is left out of the feed rather than shown. `tests/activity.test.ts` walks
 * every action key the code logs and checks it has words.
 */
export interface ActivityItem {
  id: string;
  at: string;
  /** Who did it — a name where we have one, otherwise their email. */
  who: string;
  /** One sentence, no system words. */
  text: string;
}

interface AuditRow {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const n = (v: unknown): number | null => (typeof v === "number" ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** "3 courses", "1 carer". */
const count = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/** A detail date ("2026-10-31" or a timestamp) in the app's house style. */
const day = (v: unknown): string | null => {
  const s = str(v);
  if (!s || Number.isNaN(new Date(s).getTime())) return null;
  return formatDate(s);
};

/** "a medication audit", "an infection control audit". */
const an = (phrase: string) => `${/^[aeiou]/i.test(phrase) ? "an" : "a"} ${phrase}`;

/** "2026-10" → "October 2026"; anything else as it came. */
const month = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return s;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
};

/** "first_written" → "first written": a key as words, never a key. */
const words = (v: unknown): string | null => str(v)?.replace(/[_-]+/g, " ").trim() ?? null;

/** The documents a staff file or a candidate holds, named as the pages do. */
const DOC_WORDS: Record<string, string> = {
  dbs: "the DBS certificate",
  right_to_work: "the right-to-work check",
  insurance: "the insurance certificate",
  contract: "the contract",
  role_acceptance: "the role acceptance",
  refund_training: "the training refund agreement",
  shadowing: "the shadowing record",
  proof_address_1: "the first proof of address",
  proof_address_2: "the second proof of address",
};
const doc = (v: unknown): string => {
  const key = str(v);
  if (!key) return "a document";
  return DOC_WORDS[key] ?? `the ${words(key)} document`;
};

const ROLE_WORDS: Record<string, string> = {
  org_admin: "a manager",
  org_office: "an office worker",
  learner: "a carer",
  candidate: "a candidate",
};
const role = (v: unknown): string => ROLE_WORDS[str(v) ?? ""] ?? "a member of staff";

const PRODUCT_WORDS: Record<string, string> = { myroster: "MyRoster", yellowloaf: "Yellowloaf" };

const CONCERN_WORDS: Record<string, string> = {
  complaint: "a complaint",
  concern: "a concern",
  safeguarding: "a safeguarding concern",
  accident: "an accident",
  near_miss: "a near miss",
  issue: "an issue",
  incident: "an incident",
};
const concern = (v: unknown): string => CONCERN_WORDS[str(v) ?? ""] ?? `a ${words(v) ?? "concern"}`;

/**
 * Actions whose sentence needs nothing from the detail. Kept as a table so
 * the test can walk them; the switch below handles the ones that do.
 */
const PLAIN: Record<string, string> = {
  // Accounts and access
  "account.self_deleted": "Deleted their own account",
  "user.temporary_password_replaced": "Chose their own password",
  "org.office_access_saved": "Changed what office workers can see",
  // Training
  "course.restored": "A retired course was brought back",
  "face_to_face.booking_cancelled": "Cancelled a face-to-face booking",
  "face_to_face.session_created": "Set up a face-to-face session",
  "face_to_face.session_updated": "Changed a face-to-face session",
  "face_to_face.register_taken": "Took the register for a face-to-face session",
  // Records on a person
  "action.completed": "Marked an action as done",
  "action.reopened": "Reopened an action",
  // HR
  "hr.grievance_raised": "Raised a grievance",
  "hr.case_closed": "Closed a disciplinary or grievance case",
  "hr.case_file_downloaded": "Downloaded a case file",
  "hr.settings_saved": "Changed the probation settings",
  "hr.letterhead_saved": "Saved the letterhead",
  "hr.absence_settings_saved": "Changed the absence settings",
  "hr.holiday_settings_saved": "Changed the holiday settings",
  "hr.case_settings_saved": "Changed the disciplinary and grievance settings",
  // Recruitment
  "candidate.login_sent": "Sent a candidate their login",
  "candidate.application_sent": "Sent a candidate the application form",
  "candidate.starter_form_viewed": "Opened a candidate's starter form",
  "candidate.offer_drafted_ai": "Drafted an offer letter with AI",
  "candidate.reopened": "Reopened a candidate who had been turned down",
  "candidate.dbs_conviction": "Recorded a candidate's DBS disclosure",
  "recruitment.settings_saved": "Changed the recruitment settings",
  "recruitment.wording_saved": "Changed the wording of a recruitment document",
  "recruitment.questions_saved": "Changed the recruitment questions",
  "recruitment.interview_questions_saved": "Changed the interview questions",
  "recruitment.literacy_saved": "Changed the literacy test settings",
  // Complaints and compliments
  "complaint.closed": "Closed a complaint",
  "complaint.training_assigned": "Assigned training because of a complaint",
  "complaint.bundle": "Downloaded a complaint bundle",
  "complaint.interim_pdf": "Downloaded an interim complaint report",
  "complaint.link_made": "Set up the concern-reporting link",
  "complaint.link_opened": "Opened the concern-reporting link",
  "complaint.link_closed": "Closed the concern-reporting link",
  "compliment.deleted": "Deleted a compliment",
  "pip.carer_signed": "Signed a performance plan",
  "pip.pdf": "Downloaded a performance plan",
  // Audits and quality
  "audit.reviewed": "Reviewed an audit",
  "client_qa.recorded": "Recorded a client quality check",
  "client_qa.reviewed": "Reviewed a client quality check",
  "client_qa.compliment": "Logged a compliment from a client quality check",
  "client_qa.concern": "Raised a concern from a client quality check",
  "governance.summary_drafted_ai": "Drafted the governance summary with AI",
  "audit_form.saved": "Changed a staff audit form",
  "audit_form.reset": "Put a staff audit form back to ours",
  "audit_form.skill_stopped": "Stopped checking a competency skill",
  "audit_form.skill_restored": "Started checking a competency skill again",
  "service_audit_form.saved": "Changed a service audit form",
  "service_audit_form.reset": "Put a service audit form back to ours",
  "service_audit_form.stopped": "Stopped a service audit",
  "service_audit_form.restored": "Started a service audit again",
  // Forms and feedback
  "form.unassigned": "Took a form back from someone",
  "form.pdf": "Downloaded a completed form",
  "form.switched_on": "Switched a form on",
  "form.switched_off": "Switched a form off",
  "feedback.survey_opened": "Opened a feedback survey",
  "feedback.survey_closed": "Closed a feedback survey",
  "feedback.concern_raised": "Raised a concern from feedback",
  "feedback.compliment_logged": "Logged a compliment from feedback",
  "feedback.questions_reset": "Put the feedback questions back to ours",
  "form_template.created": "Added a form to the library",
  "form_template.saved": "Changed a library form",
  "form_template.status": "Changed a library form's status",
  // Policies
  "policy.adopted": "Adopted a policy",
  "policy.reading_settings": "Changed who must read which policies",
  // Company settings
  "organisation.logo_set": "Uploaded the company logo",
  "organisation.logo_removed": "Removed the company logo",
  "organisation.colour_set": "Changed the company colour",
  "organisation.colour_removed": "Removed the company colour",
  "organisation.domain_switched_off": "Switched the company's own web address off",
  "organisation.updated": "The company's details were updated",
  "organisation.invited": "The company was set up",
  "organisation.signed_up": "The company signed up for a free trial",
  "organisation.trial_started": "The free trial started",
  "organisation.trial_converted": "The free trial became a paid subscription",
  "organisation.removed": "The company was removed",
  "organisation.feature_override": "A feature was switched on or off for the company",
  "organisation.demo_booked": "A demo was booked",
  "integration_key.revoked": "Revoked an integration key",
  "alert_endpoint.paused": "Paused an alert endpoint",
  "alert_endpoint.resumed": "Resumed an alert endpoint",
  "alert_endpoint.removed": "Removed an alert endpoint",
  // Reports
  "bespoke_report.created": "A bespoke report was set up",
  "bespoke_report.saved": "A bespoke report was updated",
  "bespoke_report.archived": "A bespoke report was archived",
  "bespoke_report.restored": "A bespoke report was restored",
  "bespoke_report.drafted_ai": "A bespoke report was drafted with AI",
  "report_request.created": "Asked for a bespoke report",
  "report_request.withdrawn": "Withdrew a bespoke report request",
  "report_schedule.deleted": "Stopped a scheduled report",
  "issue_report.updated": "Updated an issue report",
};

/**
 * One sentence per action, or null when there is nothing worth saying (a
 * platform-only bookkeeping row, or an action we have no words for — the
 * test keeps that set empty). `subject` is the person the action was about,
 * when we could resolve a name for them.
 */
export function describe(row: AuditRow, subject: string | null): string | null {
  const who = subject ?? "a member of staff";
  const whose = subject ? `${subject}'s` : "a member of staff's";
  const d = row.detail ?? {};
  const plain = PLAIN[row.action];
  if (plain) return plain;

  // Keys built at the call site: "<spot_check|competency>.training_assigned",
  // "<supervision|appraisal>.booked" and ".booking_cancelled".
  if (row.action.endsWith(".training_assigned")) {
    const source = row.action.startsWith("spot_check") ? "a spot check" : "a competency check";
    return `Assigned ${who} training after ${source}`;
  }
  if (row.action.endsWith(".booked") && (row.action.startsWith("supervision") || row.action.startsWith("appraisal"))) {
    const kind = row.action.split(".")[0];
    const on = day(d.bookedOn);
    const at = str(d.bookedTime);
    return `Booked ${whose} ${kind}${on ? ` for ${on}` : ""}${at ? ` at ${at}` : ""}`;
  }
  if (row.action.endsWith(".booking_cancelled") && (row.action.startsWith("supervision") || row.action.startsWith("appraisal"))) {
    return `Cancelled ${whose} ${row.action.split(".")[0]} booking`;
  }

  switch (row.action) {
    // Accounts and access
    case "user.invited":
      return `Invited ${str(d.email) ?? who}${str(d.role) === "org_admin" ? " as a manager" : str(d.role) === "org_office" ? " as an office worker" : ""}`;
    case "user.invitation_resent":
      return `Sent ${who} their invitation again`;
    case "user.password_reset_sent":
      return `Sent ${who} a password reset`;
    case "user.temporary_password_set":
      return `Gave ${str(d.email) ?? who} a temporary password`;
    case "staff.bulk_invited": {
      const made = n(d.created) ?? n(d.invited) ?? n(d.count);
      return made === null ? "Invited staff from a spreadsheet" : `Invited ${count(made, "person", "people")} from a spreadsheet`;
    }
    case "staff.deactivated":
      return `Deactivated ${who}`;
    case "staff.reactivated":
      return `Reactivated ${who}`;
    case "staff.deleted":
      return `Deleted ${str(d.email) ?? who} and their training history`;
    case "org.admin_invited":
      return `Invited ${str(d.email) ?? who} to the console as ${role(d.role)}`;
    case "org.user_role_changed":
      return `Made ${str(d.email) ?? who} ${role(d.to)} (was ${role(d.from)})`;
    case "org.user_removed":
      return `Removed ${str(d.email) ?? who} from the console`;
    case "clients.imported": {
      const added = n(d.added);
      const updated = n(d.updated);
      if (added === null) return "Imported clients from a spreadsheet";
      return `Imported ${count(added, "new client")}${updated ? ` and updated ${updated}` : ""} from a spreadsheet`;
    }
    case "same_team.interested":
      return `Asked to hear about ${PRODUCT_WORDS[str(d.product) ?? ""] ?? "another product"}`;

    // Training
    case "training.assigned": {
      const courses = n(d.courses);
      const learners = n(d.learners);
      const due = day(d.dueDate);
      if (courses === null || learners === null) return "Assigned training";
      return `Assigned ${count(courses, "course")} to ${count(learners, "carer")}${due ? `, due ${due}` : ""}`;
    }
    case "training.bulk_assigned": {
      const made = n(d.assigned) ?? n(d.count);
      return made === null ? "Assigned training from a spreadsheet" : `Assigned ${count(made, "course")} from a spreadsheet`;
    }
    case "training.unassigned": {
      const removed = n(d.removed);
      if (removed !== null) return `Unassigned ${count(removed, "course")}`;
      return `Unassigned ${str(d.course) ?? "a course"} from ${who}`;
    }
    case "training.due_date_changed": {
      const changed = n(d.changed);
      const to = day(d.dueDate);
      return `Moved the due date${to ? ` to ${to}` : ""} on ${changed === null ? "some" : changed} ${changed === 1 ? "assignment" : "assignments"}`;
    }
    case "course.retired": {
      const removed = n(d.removedAssignments) ?? n(d.removed);
      return `The course "${str(d.title) ?? "a course"}" was retired${removed ? `, taking ${count(removed, "assignment")} with it` : ""}`;
    }
    case "classroom.recorded": {
      const attended = n(d.attendees);
      const certs = n(d.certificates);
      const held = day(d.heldOn);
      return `Recorded the classroom session "${str(d.title) ?? "untitled"}"${held ? ` held ${held}` : ""}${attended !== null ? `: ${count(attended, "person", "people")} attended` : ""}${certs ? `, ${count(certs, "certificate")} issued` : ""}`;
    }
    case "classroom.sign_in_started":
      return `Opened sign-in for the classroom session "${str(d.title) ?? "untitled"}"`;
    case "face_to_face.booked": {
      const people = n(d.people);
      return people === null ? "Booked people onto a face-to-face session" : `Booked ${count(people, "person", "people")} onto a face-to-face session`;
    }
    case "face_to_face.session_cancelled": {
      const bookings = n(d.bookingsCancelled);
      return `Cancelled a face-to-face session${bookings ? `, and ${count(bookings, "booking")} with it` : ""}`;
    }
    case "face_to_face.closed_day_added":
      return `Closed ${day(d.day) ?? "a day"} for face-to-face sessions${str(d.reason) ? ` (${str(d.reason)})` : ""}`;
    case "face_to_face.closed_day_removed":
      return `Reopened ${day(d.day) ?? "a day"} for face-to-face sessions`;
    case "portal.assign_training": {
      const courses = n(d.courses);
      const learners = n(d.learners);
      const fresh = n(d.newEnrolments);
      if (courses === null || learners === null) return "Assigned training from MyRoster";
      return `Assigned ${count(courses, "course")} to ${count(learners, "person", "people")} from MyRoster${fresh !== null ? ` (${count(fresh, "new assignment")})` : ""}`;
    }
    case "portal.sync_learners": {
      const counts = (d.counts ?? {}) as Record<string, unknown>;
      const parts = Object.entries(counts)
        .filter(([, v]) => typeof v === "number" && v > 0)
        .map(([k, v]) => `${v} ${words(k)}`);
      return `Staff details came over from MyRoster${parts.length ? `: ${parts.join(", ")}` : ""}`;
    }

    // Records on a person
    case "staff_document.uploaded": {
      const expires = day(d.expiresAt);
      return `Uploaded ${doc(d.docType)} for ${who}${expires ? `, expiring ${expires}` : ""}`;
    }
    case "staff_document.not_required":
      return `Marked ${doc(d.docType)} as not needed for ${who}${str(d.reason) ? `: ${str(d.reason)}` : ""}`;
    case "staff_document.removed":
      return `Removed ${doc(d.docType)} from ${whose} file`;
    case "evidence_pack.exported":
      return `Downloaded ${whose} evidence pack`;
    case "evidence_files.exported": {
      const files = n(d.files);
      return `Downloaded ${files === null ? "the files" : count(files, "file")} from ${whose} evidence`;
    }
    case "action.added": {
      const due = day(d.dueDate);
      return `Added an action for ${who}${str(d.title) ? `: "${str(d.title)}"` : ""}${due ? `, due ${due}` : ""}`;
    }
    case "supervision.recorded": {
      const kind = str(d.kind) ?? "supervision";
      const held = day(d.heldOn);
      const actions = n(d.actions);
      return `Recorded ${whose} ${kind}${held ? ` held ${held}` : ""}${actions ? `, ${count(actions, "action")} agreed` : ""}`;
    }
    case "spot_check.recorded":
      return `Recorded a spot check on ${who}${words(d.outcome) ? `: ${words(d.outcome)}` : ""}`;
    case "competency.recorded":
      return `Recorded ${whose} ${words(d.area) ?? "competency"} check${words(d.outcome) ? `: ${words(d.outcome)}` : ""}`;

    // HR
    case "hr.absence_recorded":
      return `Recorded ${who} off sick${str(d.reason) ? `: ${str(d.reason)}` : ""}`;
    case "hr.absence_self_reported":
      return `Reported sick${day(d.start) ? ` from ${day(d.start)}` : ""}${str(d.reason) ? `: ${str(d.reason)}` : ""}`;
    case "hr.absence_updated":
      return `Changed ${whose} absence record`;
    case "hr.absence_deleted":
      return `Deleted ${whose} absence${day(d.start) ? ` from ${day(d.start)}` : ""}`;
    case "hr.fit_note_uploaded":
      return `Uploaded ${whose} GP fit note${day(d.until) ? `, running to ${day(d.until)}` : ""}`;
    case "hr.return_to_work_held":
      return `Held ${whose} return-to-work interview`;
    case "hr.welfare_meeting":
      return `Held a welfare meeting with ${who}${day(d.on) ? ` on ${day(d.on)}` : ""}`;
    case "hr.employment_saved": {
      const title = str(d.jobTitle);
      const started = day(d.startDate);
      return `Saved ${whose} employment details${title ? ` (${title}${started ? `, started ${started}` : ""})` : ""}`;
    }
    case "hr.probation_review_booked":
      return `Booked ${whose} probation review${day(d.bookedOn) ? ` for ${day(d.bookedOn)}` : ""}`;
    case "hr.probation_review_held":
      return `Held ${whose} ${d.final === true ? "final " : ""}probation review${words(d.outcome) ? `: ${words(d.outcome)}` : ""}`;
    case "hr.allowance_set": {
      const amount = n(d.amount);
      return `Set ${whose} holiday allowance${amount !== null ? ` to ${amount} ${str(d.unit) ?? "days"}` : ""}`;
    }
    case "hr.leave_added": {
      const from = day(d.start_date);
      const to = day(d.end_date);
      return `Added ${words(d.leave_type) ?? "annual"} leave for ${who}${from ? `, ${from}${to && to !== from ? ` to ${to}` : ""}` : ""}${d.approved === false ? " (awaiting approval)" : ""}`;
    }
    case "hr.leave_requested": {
      const from = day(d.start_date);
      const to = day(d.end_date);
      return `Asked for ${words(d.leave_type) ?? "annual"} leave${from ? `, ${from}${to && to !== from ? ` to ${to}` : ""}` : ""}`;
    }
    case "hr.leave_approved":
      return `Approved ${whose} leave request${d.overLimit === true ? " (over the limit for those days)" : ""}`;
    case "hr.leave_declined":
      return `Declined ${whose} leave request`;
    case "hr.leave_cancelled":
      return `Cancelled ${whose} leave`;
    case "hr.leaver_recorded":
      return `Recorded that ${who} is leaving${words(d.reason) ? ` (${words(d.reason)})` : ""}${day(d.lastDay) ? `, last day ${day(d.lastDay)}` : ""}`;
    case "hr.leaver_cancelled":
      return `Cancelled ${whose} leaving record: they are staying`;
    case "hr.training_record_emailed":
      return `Emailed ${who} their training record`;
    case "hr.leaver_login_off":
      return `Switched off ${whose} login${str(d.by) === "hand" ? "" : " after their last day"}`;
    case "hr.leaver_dbs_referral":
      return `Recorded the DBS referral for ${who} as ${words(d.status) ?? "considered"}`;
    case "hr.reference_requested":
      return `Logged a reference request for ${who}${str(d.from) ? ` from ${str(d.from)}` : ""}`;
    case "hr.reference_sent":
      return `Sent a reference for ${who}${str(d.to) ? ` to ${str(d.to)}` : ""}`;
    case "hr_letter.sent":
      return `Sent ${who} a letter${words(d.kind) ? `: ${words(d.kind)}` : ""}`;
    case "hr.letter_template_saved":
      return `Saved the ${words(d.kind) ?? "letter"} letter template${d.ours === true ? " (back to ours)" : ""}`;
    case "hr.case_opened":
      return `Opened ${str(d.kind) === "grievance" ? "grievance" : "disciplinary"} case ${str(d.ref) ?? ""}`.trim();
    case "hr.case_suspension":
      return `Recorded a suspension on a case${day(d.on) ? ` from ${day(d.on)}` : ""}`;
    case "hr.case_evidence":
      return `Added evidence to a case${str(d.file) ? `: ${str(d.file)}` : ""}`;
    case "hr.case_outcome":
      return `Recorded a case outcome${words(d.outcome) ? `: ${words(d.outcome)}` : ""}`;
    case "hr.case_legal":
      return `Noted the ${words(d.which) ?? "legal step"} on a case as ${words(d.status) ?? "done"}${day(d.on) ? ` (${day(d.on)})` : ""}`;

    // Recruitment
    case "candidate.step_confirmed":
      return `Confirmed a candidate's ${words(d.step) ?? "step"}${str(d.note) ? `: ${str(d.note)}` : ""}`;
    case "candidate.step_undone":
      return `Undid a candidate's ${words(d.step) ?? "step"}`;
    case "candidate.document_not_required":
      return `Marked ${doc(d.doc_type)} as not needed for a candidate${str(d.reason) ? `: ${str(d.reason)}` : ""}`;
    case "candidate.documents_sent": {
      const docs = list(d.docs);
      return `Sent a candidate ${docs.length ? count(docs.length, "document") : "their documents"} to sign${day(d.startDate) ? `, starting ${day(d.startDate)}` : ""}`;
    }
    case "candidate.document_countersigned":
      return `Countersigned a candidate's ${doc(d.docKey).replace(/^the /, "")}`;
    case "candidate.literacy_unlocked":
      return `Unlocked the literacy test for a candidate${d.retake === true ? " to retake" : ""}${str(d.mode) ? ` (${str(d.mode)})` : ""}`;
    case "candidate.literacy_attempt_deleted":
      return `Deleted a candidate's literacy attempt${n(d.attempt) !== null ? ` ${n(d.attempt)}` : ""}`;
    case "candidate.offer_sent":
      return `Sent a candidate an offer${str(d.position) ? ` for ${str(d.position)}` : ""}`;
    case "candidate.rejected":
      return `Turned a candidate down${str(d.reasons) ? `: ${str(d.reasons)}` : ""}${d.letter === true ? " (letter sent)" : ""}`;
    case "candidate.interviewed":
      return `Recorded a candidate's interview${str(d.outcome) ? `: ${str(d.outcome)}` : ""}${n(d.score) !== null ? `, scored ${n(d.score)}` : ""}`;
    case "candidate.reference_requested":
      return `Requested reference ${n(d.position) ?? ""} for a candidate`.replace("  ", " ");
    case "candidate.shadowing_recorded":
      return `Recorded a candidate's shadowing shift${d.recommended === true ? ": recommended" : d.recommended === false ? ": not recommended" : ""}`;
    case "candidate.dbs_risk_assessed":
      return `Completed a candidate's DBS risk assessment${words(d.decision) ? `: ${words(d.decision)}` : ""}`;
    case "candidate.deleted":
      return `Deleted the candidate ${str(d.name) ?? ""}`.trim();
    case "candidate.hired": {
      const courses = n(d.induction_courses);
      return `Hired ${str(d.name) ?? "a candidate"}${courses ? ` and assigned ${count(courses, "induction course")}` : ""}${d.login === true ? ", with a login" : ""}`;
    }

    // Complaints and compliments
    case "complaint.recorded":
      return `Recorded ${concern(d.kind)}${str(d.reference) ? `, ${str(d.reference)}` : ""}`;
    case "complaint.triaged":
      return `Reclassified ${concern(d.from)} as ${concern(d.to)}`;
    case "complaint.status":
      return `Moved a complaint to ${words(d.status) ?? "a new stage"}`;
    case "complaint.letter_saved":
      return `Saved the ${str(d.stage) ?? "complaint"} letter`;
    case "complaint.letter_sent":
      return `Sent the ${str(d.stage) ?? "complaint"} letter${day(d.sentOn) ? ` on ${day(d.sentOn)}` : ""}`;
    case "complaint.reminder_confirmed":
      return `Confirmed the ${words(d.key)?.toUpperCase() === "CQC" ? "CQC" : words(d.key) ?? ""} notification was made`.replace("  ", " ");
    case "complaint.reminder_undone":
      return `Unticked the ${words(d.key)?.toUpperCase() === "CQC" ? "CQC" : words(d.key) ?? ""} notification`.replace("  ", " ");
    case "complaint.pdf":
      return `Downloaded a complaint${str(d.stage) ? ` at the ${str(d.stage)} stage` : ""} as a PDF`;
    case "complaint.stages_seeded":
      return null; // bookkeeping the first time the complaints process is opened
    case "compliment.logged": {
      const people = n(d.people);
      return `Logged a compliment${people ? ` about ${count(people, "person", "people")}` : ""}`;
    }
    case "pip.created":
      return `Started a ${str(d.kind) === "pip" ? "performance improvement plan" : words(d.kind) ?? "plan"}${d.complaintId ? " from a complaint" : ""}`;
    case "pip.closed":
      return `Closed a performance plan${words(d.outcome) ? `: ${words(d.outcome)}` : ""}`;

    // Audits and quality
    case "audit.recorded": {
      const findings = n(d.findings);
      const score = n(d.score);
      return `Recorded ${an(words(d.kind) ? `${words(d.kind)} audit` : "audit")}${score !== null ? `, scored ${score}` : ""}${findings !== null ? `, ${count(findings, "finding")}` : ""}${d.waiting === true ? ", waiting on actions" : ""}`;
    }
    case "governance.pdf":
      return `Downloaded the governance report${month(d.month) ? ` for ${month(d.month)}` : ""}`;
    case "governance.summary_saved":
      return `Saved the governance summary${month(d.month) ? ` for ${month(d.month)}` : ""}`;
    case "service_audit.review_level":
      return `Set the service audit review level to ${words(d.level) ?? "a new level"}`;

    // Forms and feedback
    case "form.assigned": {
      const people = n(d.people);
      const due = day(d.dueDate);
      return `Assigned a form to ${d.everyone === true ? "everyone" : people === null ? "people" : count(people, "person", "people")}${due ? `, due ${due}` : ""}`;
    }
    case "form.started_own":
      return "Started a form for someone";
    case "form.completed":
      return "Completed a form";
    case "form.recorded":
      return `Recorded a ${str(d.subject) === "client" ? "client" : "staff"} form${d.reviewOf ? " as a review" : ""}${n(d.signed) ? `, ${count(n(d.signed)!, "signature")}` : ""}`;
    case "form.copied":
      return "Copied a library form to edit as their own";
    case "form.created_own":
      return `Created the form "${str(d.title) ?? "untitled"}"`;
    case "form.saved_own":
      return `Saved a form${n(d.fields) !== null ? ` with ${count(n(d.fields)!, "field")}` : ""}${d.versionBumped === true ? ", as a new version" : ""}`;
    case "form.status_own":
      return `${str(d.status) === "published" ? "Published" : str(d.status) === "draft" ? "Unpublished" : "Changed the status of"} a form`;
    case "form.review_period":
      return `Set a form's review period${n(d.months) !== null ? ` to ${count(n(d.months)!, "month")}` : ""}`;
    case "form_log.line_added":
      return `Added a line to the ${words(str(d.log)?.replace(/^MCA-LOG-/, "")?.toLowerCase()) ?? ""} log`.replace("  ", " ");
    case "form_log.line_removed":
      return `Removed a line from the ${words(str(d.log)?.replace(/^MCA-LOG-/, "")?.toLowerCase()) ?? ""} log`.replace("  ", " ");
    case "form_log.csv":
      return `Downloaded a log as a spreadsheet${n(d.lines) !== null ? ` (${count(n(d.lines)!, "line")})` : ""}`;
    case "form_log.pdf":
      return `Downloaded a log as a PDF${n(d.lines) !== null ? ` (${count(n(d.lines)!, "line")})` : ""}`;
    case "feedback.survey_created":
      return `Created a ${str(d.kind) ?? ""} feedback survey`.replace("  ", " ") + (d.named === false ? " (anonymous)" : "");
    case "feedback.invitations_sent": {
      const sent = n(d.count);
      return sent === null ? "Sent feedback invitations" : `Sent ${count(sent, "feedback invitation")}`;
    }
    case "feedback.questions_saved":
      return `Changed the ${str(d.kind) ?? ""} feedback questions`.replace("  ", " ");

    // Policies
    case "policy.accepted":
      return `Accepted a policy${n(d.version) !== null ? `, version ${n(d.version)}` : ""}`;
    case "policy.published":
      return `Published a policy${n(d.version) !== null ? `, version ${n(d.version)}` : ""}`;
    case "policy.reviewed":
      return `Reviewed a policy${day(d.next) ? `, next review ${day(d.next)}` : ""}`;
    case "policy.settings":
      return `Set the policy review period${n(d.review_months) !== null ? ` to ${count(n(d.review_months)!, "month")}` : ""}`;
    case "policy.status":
      return `A policy's status was changed${words(d.status) ? ` to ${words(d.status)}` : ""}`;

    // Company settings and billing
    case "organisation.email_sender_set":
      return `Set the email sender name${str(d.name) ? ` to ${str(d.name)}` : ""}`;
    case "organisation.domain_requested":
      return `Asked for the company's own web address${str(d.domain) ? `, ${str(d.domain)}` : ""}`;
    case "organisation.domain_removed":
      return `Removed the company's own web address${str(d.domain) ? `, ${str(d.domain)}` : ""}`;
    case "organisation.domain_live":
      return `The company's own web address${str(d.domain) ? `, ${str(d.domain)},` : ""} went live`;
    case "organisation.ai_settings_saved":
      return `${d.enabled === false ? "Switched the AI helpers off" : "Switched the AI helpers on"}${n(d.limit) !== null ? `, with a £${n(d.limit)} monthly limit` : ""}`;
    case "organisation.trial_extended":
      return `The free trial was extended${day(d.ends_at) ? ` to ${day(d.ends_at)}` : ""}`;
    case "billing.subscribed":
      return `Subscribed to the ${words(d.tier) ?? ""} package`.replace("  ", " ");
    case "integration_key.issued":
      return `Issued an integration key${str(d.label) ? ` for ${str(d.label)}` : ""}`;
    case "integration_key.replaced":
      return `Replaced the integration key${str(d.label) ? ` for ${str(d.label)}` : ""}`;
    case "alert_endpoint.added":
      return `Added an alert endpoint${str(d.label) ? `, ${str(d.label)}` : ""}`;

    // Reports
    case "bespoke_report.managers_only":
      return d.managersOnly === true ? "Made a bespoke report managers-only" : "Opened a bespoke report to office workers";
    case "bespoke_report.downloaded":
      return `Downloaded a bespoke report${str(d.format) ? ` as ${str(d.format) === "xlsx" ? "a spreadsheet" : str(d.format)?.toUpperCase()}` : ""}`;
    case "report_schedule.created":
      return `Scheduled a report${str(d.schedule) ? `: ${str(d.schedule)}` : ""}`;
    case "report_schedule.updated":
      return `Changed a report's schedule${str(d.schedule) ? ` to ${str(d.schedule)}` : ""}`;
    case "report_request.status":
      return `A bespoke report request moved to ${words(d.to) ?? "a new status"}`;
    case "issue_report.created":
      return `Reported a problem${str(d.summary) ? `: ${str(d.summary)}` : ""}`;
    case "tier.composition.updated":
      return null; // platform bookkeeping, never on a company's trail

    default:
      // No words for it: leave it out rather than say "Made a change".
      return null;
  }
}

/** Who to show when nobody signed in did it. */
function nobody(action: string): string {
  return action.startsWith("portal.") ? "MyRoster" : "My Care Academy";
}

/**
 * The most recent things people did in this organisation. Pass orgId: RLS
 * already confines the read, but with the filter Postgres reads the newest
 * rows for one organisation off its index rather than walking the whole
 * table's history newest-first and testing the policy on each row.
 */
export async function loadRecentActivity(
  supabase: SupabaseClient,
  limit = 30,
  orgId?: string | null,
): Promise<ActivityItem[]> {
  let query = supabase
    .from("audit_logs")
    .select("id, action, entity, entity_id, actor_id, actor_email, detail, created_at");
  if (orgId) query = query.eq("organisation_id", orgId);
  const { data: rows } = await query
    .order("created_at", { ascending: false })
    .limit(limit);
  const audit = (rows ?? []) as AuditRow[];
  if (audit.length === 0) return [];

  // Resolve names for both the actor and the person acted on, in one read.
  const ids = new Set<string>();
  for (const r of audit) {
    if (r.actor_id) ids.add(r.actor_id);
    if (r.entity === "user" && r.entity_id) ids.add(r.entity_id);
  }
  const names = new Map<string, string>();
  if (ids.size > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", [...ids]);
    for (const u of users ?? []) {
      names.set(u.id as string, (u.full_name as string) || (u.email as string) || "Someone");
    }
  }

  const items: ActivityItem[] = [];
  for (const r of audit) {
    const text = describe(r, r.entity === "user" && r.entity_id ? (names.get(r.entity_id) ?? null) : null);
    if (!text) continue;
    items.push({
      id: r.id,
      at: r.created_at,
      who: (r.actor_id && names.get(r.actor_id)) || r.actor_email || nobody(r.action),
      text,
    });
  }
  return items;
}
