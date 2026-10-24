/**
 * What an enquiry is about. One list, shared by the form, the server action
 * and both emails, so a CTA that arrives as ?topic=mock-inspection is labelled
 * the same way in Saj's inbox as it was on the button the visitor pressed.
 *
 * The keys are part of the marketing URLs (/contact?topic=demo) — rename one
 * and the CTA that links to it falls back to the default, so change both.
 */
export const TOPICS = {
  demo: "Book a demo",
  access: "Get started / request access",
  pricing: "Pricing and plans",
  // Reached from the Account page, where a manager is told that plan changes
  // and payment details are handled by us — so the link has to land on
  // something truer than "Book a demo", which is where an unknown topic goes.
  billing: "Billing and payment details",
  "mock-inspection": "Mock CQC inspection",
  "care-certificate": "Care Certificate",
  "management-support": "Management support",
  other: "Something else",
} as const;

export type EnquiryTopic = keyof typeof TOPICS;

export const TOPIC_KEYS = Object.keys(TOPICS) as EnquiryTopic[];

/** The topic a CTA-less visitor lands on, and the fallback for an unknown one. */
export const DEFAULT_TOPIC: EnquiryTopic = "demo";

export function isTopic(value: unknown): value is EnquiryTopic {
  return typeof value === "string" && value in TOPICS;
}

/** A ?topic= value from a link, narrowed to something we actually offer. */
export function toTopic(value: unknown): EnquiryTopic {
  return isTopic(value) ? value : DEFAULT_TOPIC;
}

/**
 * Rough size of the service, asked because it decides the plan and how long a
 * demo needs. Optional on the form — nobody is made to disclose it.
 */
export const TEAM_SIZES = [
  "1–10 staff",
  "11–25 staff",
  "26–50 staff",
  "51–100 staff",
  "More than 100 staff",
] as const;

export type TeamSize = (typeof TEAM_SIZES)[number];

export function isTeamSize(value: unknown): value is TeamSize {
  return typeof value === "string" && (TEAM_SIZES as readonly string[]).includes(value);
}
