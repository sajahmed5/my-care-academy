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
    area: "Recruitment",
    home: "/org/recruitment",
    heading: "Track every candidate from application to hire",
    bullets: [
      "Each candidate's progress, from applied to hired",
      "A checklist of their documents, with right to work and DBS expiry dates",
      "Everything for one candidate downloaded in one go",
      "Hired candidates become carers with a login, ready for their training",
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
    heading: "Spot checks and competency, area by area",
    bullets: [
      "Medication, moving and handling, infection control and more",
      "Each result recorded, with what was seen",
      "Anything short of competent shown at the top of their file",
      "Who's due next, across the whole team",
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
    area: "Complaints",
    home: "/org/complaints",
    heading: "Complaints, safeguarding and incidents in one place",
    bullets: [
      "A step-by-step complaint process, with the 3-day and 28-day deadlines kept",
      "Accidents, near misses and safeguarding concerns recorded",
      "The staff involved named, with suggested training",
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
      "A session covering one of our courses completes it, with a certificate",
      "On the same training matrix as the online courses",
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
