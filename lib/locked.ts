import type { FeatureKey } from "@/lib/features";

/**
 * What the locked page says about each paid feature (PACKAGES.md, 29 Oct 2026):
 * the menu area it sits under, where it lives once it's on, and what it does
 * in plain words. It describes only what is built — a locked page promising a
 * feature still being written would be selling it before it exists.
 */
export interface LockedCopy {
  /** The page title, the menu area it belongs to. */
  area: string;
  /** Where the feature lives once the package includes it. */
  home: string;
  heading: string;
  bullets: string[];
}

export const LOCKED_COPY: Partial<Record<FeatureKey, LockedCopy>> = {
  "recruitment.tracker": {
    area: "HR pack",
    home: "/org/recruitment",
    heading: "Employ someone, from application to leaving",
    bullets: [
      "Each candidate's progress, from applied to hired",
      "Hired candidates become staff with a login, ready for their training",
      "Every carer's documents on their file, with expiry reminders",
      "Everything from their recruitment kept on their file",
      "Probation reviews, with the letters written for you to check and send",
      "Sickness absence, return-to-work interviews and Bradford Factor triggers",
      "Holidays: allowances, requests, approvals and a calendar of who's off",
      "Disciplinary and grievance cases that follow the ACAS Code, with every letter",
    ],
  },
  "people.supervisions": {
    area: "Supervisions",
    home: "/org/due/supervisions",
    heading: "Supervisions and appraisals, on every staff file",
    bullets: [
      "Real questions for each one, with last time's actions reviewed",
      "Booked ahead: the carer is emailed the date and who with",
      "A short self-assessment the carer fills in before their appraisal",
      "Signed by both of you in the room; what was agreed goes on their task list",
      "Who's due next, across carers and office staff",
    ],
  },
  "people.competency": {
    area: "Spot checks",
    home: "/org/due/spot-checks",
    heading: "Spot checks and competency, done on your phone",
    bullets: [
      "Unannounced spot checks in the client's home, the client picked from your list",
      "Medication, hoist, moving and handling and more, each against its own criteria",
      "The carer signs on your phone; anything short suggests training for you to confirm",
      "Who's due next, per skill, across the whole team",
    ],
  },
  "people.performance_plans": {
    area: "Performance plans",
    home: "/org/pips",
    heading: "Performance plans, raised when an audit isn't met",
    bullets: [
      "Raised from a supervision, spot check or competency, and linked back to it",
      "What is wrong, what good looks like and how it is measured",
      "Weekly reviews against the plan, with the support offered",
      "Signed by the carer and the manager, as a PDF for their file",
    ],
  },
  "clients.list": {
    area: "Clients",
    home: "/org/clients",
    heading: "Your clients, in one list",
    bullets: [
      "Uploaded from a spreadsheet, or added one by one",
      "Who funds each client, and whether you help with their medication",
      "Linked to the spot checks, QAs and concerns about them",
    ],
  },
  "complaints.register": {
    area: "Complaints & safeguarding",
    home: "/org/complaints",
    heading: "Every concern through one front door",
    bullets: [
      "Raised once, then triaged: complaint, safeguarding, issue, accident or near miss",
      "A step-by-step complaint process, with the 3-day and 28-day deadlines kept",
      "Accidents and near misses with actions, and the staff involved named with suggested training",
      "Performance plans for staff who need support",
    ],
  },
  "quality.audits": {
    area: "Audits",
    home: "/org/audits",
    heading: "Audit your service on a schedule",
    bullets: [
      "Medication, care plan and infection control audits",
      "A score for each, with what needs doing",
      "Anything that fails becomes an action with an owner and a date",
      "The next audit due, worked out for you",
    ],
  },
  "quality.feedback": {
    area: "Feedback",
    home: "/org/feedback",
    heading: "Hear from clients, families and staff",
    bullets: [
      "Survey links for families, service users and staff",
      "Answers come back anonymously",
      "Scores averaged, so you can see what's improving",
    ],
  },
  "forms.builder": {
    area: "Forms",
    home: "/org/forms",
    heading: "Forms your staff fill in on the site",
    bullets: [
      "A library of care forms, ready to use",
      "Ask a carer, or the whole team, to fill one in by a date",
      "Every answer kept on the carer's file and in their evidence pack",
    ],
  },
  "documents.library": {
    area: "Policies",
    home: "/org/policies",
    heading: "CQC policies and procedures, and who has read them",
    bullets: [
      "Policy templates you complete with your own details",
      "Staff read and accept each one on their own login",
      "See who has accepted each version, and who hasn't",
    ],
  },
  "documents.compliance_pack": {
    area: "Policies",
    home: "/org/policies",
    heading: "CQC policies and procedures, and who has read them",
    bullets: [
      "Policy templates you complete with your own details",
      "Staff read and accept each one on their own login",
      "See who has accepted each version, and who hasn't",
    ],
  },
  "training.observations": {
    area: "Care Certificate",
    home: "/org/observations",
    heading: "Sign off the Care Certificate in the workplace",
    bullets: [
      "All 16 standards observed and recorded",
      "Observations by your own assessors or ours",
      "The award signed off by you, the employer",
    ],
  },
  "training.classroom": {
    area: "Classroom sessions",
    home: "/org/classroom",
    heading: "Record your own classroom training",
    bullets: [
      "Each session: what, when, who ran it and who came",
      "People sign in by scanning a QR code on the trainer's screen",
      "A practical result for each person, and a certificate when they pass one of our courses",
      "On the same training matrix as the online courses",
    ],
  },
  "training.face_to_face": {
    area: "Face-to-face training",
    home: "/org/face-to-face",
    heading: "Book your staff onto our training in Stockport",
    bullets: [
      "Sessions for every course in our library, plus induction and annual refresher training",
      "At our training office in Stockport, included in the price with no limit on places",
      "Each person gets a confirmation email and a reminder the day before",
      "A practical assessment on the day, and a certificate on the same training matrix",
    ],
  },
  "platform.white_label": {
    area: "Account",
    home: "/org/billing",
    heading: "Your own logo on everything",
    bullets: [
      "Your logo on certificates, the menu, your policies and your surveys",
    ],
  },
  "platform.portal_api": {
    area: "Account",
    home: "/org/billing",
    heading: "Connect your rostering system",
    bullets: [
      "Your carers sent across from MyRoster automatically",
      "Training assigned and records read from inside MyRoster",
    ],
  },
};
