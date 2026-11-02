/**
 * Every static page and who its guard admits, generated from app/** guards
 * (docs/QA-REPORT.md §4); the five whose guard sits in a shared component or
 * which only redirect were set by hand. Dynamic routes: cross-org.spec.ts.
 */
export type Who = "public" | "any" | "platform" | "manager" | "console" | "staff" | "candidate";
export interface RouteRule { path: string; who: Who; feature: string | null }
export const ROUTES: RouteRule[] = [
  {
    path: "/care-training-manchester-stockport",
    who: "public",
    feature: null
  },
  {
    path: "/contact",
    who: "public",
    feature: null
  },
  {
    path: "/developers",
    who: "public",
    feature: null
  },
  {
    path: "/",
    who: "public",
    feature: null
  },
  {
    path: "/privacy",
    who: "public",
    feature: null
  },
  {
    path: "/training/care-certificate",
    who: "public",
    feature: null
  },
  {
    path: "/training/courses",
    who: "public",
    feature: null
  },
  {
    path: "/training/cqc-compliance",
    who: "public",
    feature: null
  },
  {
    path: "/training/mandatory-training",
    who: "public",
    feature: null
  },
  {
    path: "/training",
    who: "public",
    feature: null
  },
  {
    path: "/training/pricing",
    who: "public",
    feature: null
  },
  {
    path: "/verify",
    who: "public",
    feature: null
  },
  {
    path: "/account",
    who: "any",
    feature: null
  },
  {
    path: "/apply/form",
    who: "public",
    feature: null
  },
  {
    path: "/apply/test",
    who: "public",
    feature: null
  },
  {
    path: "/auth/set-password",
    who: "public",
    feature: null
  },
  {
    path: "/dashboard",
    who: "any",
    feature: null
  },
  {
    path: "/exit",
    who: "public",
    feature: null
  },
  {
    path: "/forgot-password",
    who: "public",
    feature: null
  },
  {
    path: "/learn/actions",
    who: "staff",
    feature: null
  },
  {
    path: "/learn/certificates",
    who: "staff",
    feature: null
  },
  {
    path: "/learn/forms",
    who: "staff",
    feature: null
  },
  {
    path: "/learn/hr",
    who: "staff",
    feature: "recruitment.tracker"
  },
  {
    path: "/learn/modules/all",
    who: "staff",
    feature: null
  },
  {
    path: "/learn/modules/completed",
    who: "staff",
    feature: null
  },
  {
    path: "/learn/modules",
    who: "staff",
    feature: null
  },
  {
    path: "/learn/notifications",
    who: "staff",
    feature: null
  },
  {
    path: "/learn",
    who: "staff",
    feature: null
  },
  {
    path: "/learn/policies",
    who: "staff",
    feature: "documents.library"
  },
  {
    path: "/learn/profile",
    who: "staff",
    feature: null
  },
  {
    path: "/learn/reviews",
    who: "staff",
    feature: "people.supervisions"
  },
  {
    path: "/login",
    who: "public",
    feature: null
  },
  {
    path: "/mfa",
    who: "public",
    feature: null
  },
  {
    path: "/my-application",
    who: "candidate",
    feature: null
  },
  {
    path: "/org/audits/governance",
    who: "console",
    feature: "quality.audits"
  },
  {
    path: "/org/audits/new",
    who: "console",
    feature: "quality.audits"
  },
  {
    path: "/org/audits",
    who: "console",
    feature: "quality.audits"
  },
  {
    path: "/org/audits/qa/new",
    who: "console",
    feature: "quality.audits"
  },
  {
    path: "/org/billing",
    who: "manager",
    feature: null
  },
  {
    path: "/org/certificates",
    who: "console",
    feature: null
  },
  {
    path: "/org/classroom",
    who: "console",
    feature: "training.classroom"
  },
  {
    path: "/org/clients/import",
    who: "console",
    feature: "clients.list"
  },
  {
    path: "/org/clients/new",
    who: "console",
    feature: "clients.list"
  },
  {
    path: "/org/clients",
    who: "console",
    feature: "clients.list"
  },
  {
    path: "/org/complaints/compliments",
    who: "console",
    feature: "complaints.register"
  },
  {
    path: "/org/complaints/new",
    who: "console",
    feature: "complaints.register"
  },
  {
    path: "/org/complaints",
    who: "console",
    feature: "complaints.register"
  },
  {
    path: "/org/complaints/trends",
    who: "console",
    feature: "complaints.register"
  },
  {
    path: "/org/courses/admin",
    who: "console",
    feature: null
  },
  {
    path: "/org/courses",
    who: "console",
    feature: null
  },
  {
    path: "/org/courses/statistics",
    who: "console",
    feature: null
  },
  { path: "/org/due/appraisals", who: "console", feature: "people.supervisions" },
  {
    path: "/org/due/audits",
    who: "console",
    feature: "quality.audits"
  },
  {
    path: "/org/due/competency",
    who: "console",
    feature: "people.competency"
  },
  {
    path: "/org/due/forms",
    who: "console",
    feature: "forms.builder"
  },
  {
    path: "/org/due",
    who: "console",
    feature: null
  },
  {
    path: "/org/due/policies",
    who: "console",
    feature: "documents.library"
  },
  {
    path: "/org/due/spot-checks",
    who: "console",
    feature: "people.competency"
  },
  { path: "/org/due/supervisions", who: "console", feature: "people.supervisions" },
  {
    path: "/org/face-to-face",
    who: "console",
    feature: "training.face_to_face"
  },
  {
    path: "/org/feedback",
    who: "console",
    feature: "quality.feedback"
  },
  {
    path: "/org/forms/fill",
    who: "console",
    feature: null
  },
  { path: "/org/forms/own", who: "console", feature: "forms.builder" },
  {
    path: "/org/forms",
    who: "console",
    feature: "forms.builder"
  },
  {
    path: "/org/hr/absence",
    who: "console",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/hr/cases/new",
    who: "console",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/hr/cases",
    who: "console",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/hr/documents",
    who: "console",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/hr/holidays",
    who: "console",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/hr/leavers",
    who: "console",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/hr/probation",
    who: "console",
    feature: "recruitment.tracker"
  },
  { path: "/org/incidents", who: "console", feature: "complaints.register" },
  {
    path: "/org/learners/admin",
    who: "console",
    feature: null
  },
  {
    path: "/org/learners",
    who: "console",
    feature: null
  },
  {
    path: "/org/learners/stars",
    who: "console",
    feature: null
  },
  {
    path: "/org/learners/statistics",
    who: "console",
    feature: null
  },
  {
    path: "/org/observations",
    who: "console",
    feature: null
  },
  {
    path: "/org",
    who: "console",
    feature: null
  },
  {
    path: "/org/pips/new",
    who: "console",
    feature: "people.performance_plans"
  },
  {
    path: "/org/pips",
    who: "console",
    feature: "people.performance_plans"
  },
  {
    path: "/org/policies",
    who: "console",
    feature: "documents.library"
  },
  {
    path: "/org/policies/people",
    who: "console",
    feature: "documents.library"
  },
  {
    path: "/org/recruitment",
    who: "console",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/reports",
    who: "console",
    feature: null
  },
  {
    path: "/org/reports/requests/new",
    who: "manager",
    feature: "reports.bespoke"
  },
  {
    path: "/org/settings/complaints/link",
    who: "manager",
    feature: "complaints.register"
  },
  {
    path: "/org/settings/complaints/process",
    who: "manager",
    feature: "complaints.register"
  },
  {
    path: "/org/settings/forms",
    who: "manager",
    feature: "forms.builder"
  },
  {
    path: "/org/settings/forms/surveys",
    who: "manager",
    feature: "quality.feedback"
  },
  {
    path: "/org/settings/hr/absence",
    who: "manager",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/settings/hr/cases",
    who: "manager",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/settings/hr/holidays",
    who: "manager",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/settings/hr/letters",
    who: "manager",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/settings/hr",
    who: "manager",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/settings/integration/other",
    who: "manager",
    feature: "platform.portal_api"
  },
  {
    path: "/org/settings/integration",
    who: "manager",
    feature: "platform.portal_api"
  },
  {
    path: "/org/settings",
    who: "manager",
    feature: null
  },
  { path: "/org/settings/policies", who: "manager", feature: "documents.library" },
  {
    path: "/org/settings/recruitment/documents",
    who: "manager",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/settings/recruitment/forms",
    who: "manager",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/settings/recruitment",
    who: "manager",
    feature: "recruitment.tracker"
  },
  {
    path: "/org/settings/reports",
    who: "manager",
    feature: "reports.bespoke"
  },
  {
    path: "/org/settings/service-audits/edit",
    who: "manager",
    feature: "quality.audits"
  },
  {
    path: "/org/settings/service-audits",
    who: "manager",
    feature: "quality.audits"
  },
  {
    path: "/org/settings/staff-audits/edit",
    who: "manager",
    feature: null
  },
  {
    path: "/org/settings/staff-audits",
    who: "manager",
    feature: null
  },
  {
    path: "/org/settings/white-label/domain",
    who: "manager",
    feature: "platform.white_label"
  },
  {
    path: "/org/settings/white-label",
    who: "manager",
    feature: "platform.white_label"
  },
  {
    path: "/platform/analytics",
    who: "platform",
    feature: null
  },
  {
    path: "/platform/bespoke-reports",
    who: "platform",
    feature: null
  },
  {
    path: "/platform/billing",
    who: "platform",
    feature: null
  },
  {
    path: "/platform/courses",
    who: "platform",
    feature: null
  },
  {
    path: "/platform/documents",
    who: "platform",
    feature: null
  },
  {
    path: "/platform/face-to-face",
    who: "platform",
    feature: null
  },
  {
    path: "/platform/forms",
    who: "platform",
    feature: null
  },
  {
    path: "/platform/organisations",
    who: "platform",
    feature: null
  },
  {
    path: "/platform",
    who: "platform",
    feature: null
  },
  {
    path: "/platform/reports",
    who: "platform",
    feature: null
  },
  {
    path: "/platform/settings",
    who: "platform",
    feature: null
  },
  {
    path: "/platform/tiers",
    who: "platform",
    feature: null
  },
  {
    path: "/reference",
    who: "public",
    feature: null
  },
  {
    path: "/report",
    who: "any",
    feature: null
  },
  {
    path: "/statement",
    who: "public",
    feature: null
  },
  {
    path: "/suspended",
    who: "public",
    feature: null
  },
  {
    path: "/trial-ended",
    who: "public",
    feature: null
  }
];
