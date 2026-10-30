/**
 * HR letters (HR-PACK.md): every letter is a template the company can edit,
 * merged with the facts of the case, checked and edited by a person, then
 * emailed to the member of staff and kept as a PDF with the company's name at
 * the top and My Care Academy in the footer. AI can draft (optional); a
 * manager always checks and sends.
 *
 * ACAS: a company can edit its letters but can't remove the right to be
 * accompanied or the right to appeal. Those paragraphs are fixed per letter
 * (`fixed`) and always added after the company's wording; they aren't part
 * of what the company edits.
 *
 * Pure: the editor, the preview and what is sent all use these.
 */

export interface LetterTemplate {
  kind: string;
  /** What the office picks or sees. */
  label: string;
  /** Which part of the HR pack it belongs to, for grouping in Settings. */
  group: "Probation" | "Absence" | "Holidays" | "Disciplinary" | "Grievance" | "Leavers";
  subject: string;
  body: string;
  /** Paragraphs the company cannot edit away (ACAS). */
  fixed?: string[];
}

/** Merge fields every letter can use. */
export const LETTER_FIELDS: Array<{ field: string; meaning: string }> = [
  { field: "firstName", meaning: "Their first name" },
  { field: "fullName", meaning: "Their full name" },
  { field: "companyName", meaning: "Your company's name" },
  { field: "jobTitle", meaning: "Their job title" },
  { field: "startDate", meaning: "When they started" },
  { field: "date", meaning: "A date that belongs to this letter (the review, the meeting, the new end)" },
  { field: "time", meaning: "A time, for a meeting" },
  { field: "place", meaning: "Where a meeting is held" },
  { field: "months", meaning: "A length of time in months, such as \"3 months\" (an extension, a warning)" },
  { field: "reason", meaning: "The reason, as written on the record" },
  { field: "details", meaning: "The details: allegations, outcome, actions" },
  { field: "deadline", meaning: "A deadline: to appeal, to reply" },
  { field: "managerName", meaning: "Who is dealing with it" },
  { field: "process", meaning: "\"disciplinary\" or \"capability\"" },
];

const ACCOMPANIED =
  "You have the right to be accompanied at the meeting by a work colleague or a trade union representative. Please let us know beforehand who you would like to bring. If they can't make the date, you can suggest another within five working days.";
const APPEAL =
  "You have the right to appeal against this decision. To appeal, write to us by {{deadline}}, saying why you think the decision is wrong. Your appeal will be heard by a manager who has not been involved so far, wherever possible.";

export const LETTER_TEMPLATES: LetterTemplate[] = [
  {
    kind: "probation_passed",
    label: "Probation passed",
    group: "Probation",
    subject: "Your probation with {{companyName}}",
    body: `I'm pleased to confirm that you have successfully completed your probation as {{jobTitle}}, with effect from {{date}}.

Thank you for the work you have put in since you joined us on {{startDate}}. Your employment now continues on the terms of your contract.

{{details}}`,
  },
  {
    kind: "probation_extended",
    label: "Probation extended",
    group: "Probation",
    subject: "Your probation is being extended",
    body: `Following your probation review, we have decided to extend your probation by {{months}}, to {{date}}.

The reason is: {{reason}}

During the extension we will support you with: {{details}}

We will review your progress again before the new end date. If you have any questions, please speak to {{managerName}}.`,
  },
  {
    kind: "probation_not_passed",
    label: "Probation not passed",
    group: "Probation",
    subject: "The outcome of your probation",
    body: `Following your end of probation review on {{date}}, I'm sorry to tell you that you have not passed your probation.

The reason is: {{reason}}

{{details}}

Your employment will end in line with the notice set out in your contract. We will write to you separately about your final pay and returning company property.`,
    fixed: [APPEAL],
  },

  // ── Disciplinary and capability (ACAS) ──
  {
    kind: "case_suspension",
    label: "Suspension",
    group: "Disciplinary",
    subject: "Your suspension on full pay",
    body: `I'm writing to confirm that you are suspended from work on full pay from {{date}}, while we look into the following: {{details}}

Suspension is a precaution so the matter can be looked into fairly. It is not a punishment, and it does not mean any decision has been made.

While you are suspended, please don't come to work or contact the people we support, and keep yourself available during your normal working hours. We will review the suspension regularly and keep it as short as we can.

If you have any questions, please speak to {{managerName}}.`,
  },
  {
    kind: "case_hearing_invite",
    label: "Invitation to a hearing",
    group: "Disciplinary",
    subject: "Invitation to a {{process}} hearing",
    body: `I'm writing to ask you to attend a {{process}} hearing on {{date}} at {{time}}, at {{place}}.

The hearing is to consider the following: {{details}}

The evidence we will be relying on is enclosed or will be shared with you before the hearing. You will have the chance to answer it, ask questions, present your own evidence and call witnesses.

A possible outcome of the hearing is {{reason}}.

The hearing will be held by {{managerName}}. If you can't attend, please let us know as soon as possible.`,
    fixed: [ACCOMPANIED],
  },
  {
    kind: "case_outcome_warning",
    label: "Outcome: written warning",
    group: "Disciplinary",
    subject: "The outcome of your {{process}} hearing",
    body: `Thank you for attending the {{process}} hearing on {{date}}. Having considered everything said and the evidence, I have decided to give you a {{reason}}.

The reasons are: {{details}}

This warning will stay active on your file for {{months}}. If there is no further cause for concern in that time, it will no longer be taken into account, though it stays on record.`,
    fixed: [APPEAL],
  },
  {
    kind: "case_outcome_dismissal",
    label: "Outcome: dismissal",
    group: "Disciplinary",
    subject: "The outcome of your {{process}} hearing",
    body: `Thank you for attending the {{process}} hearing on {{date}}. Having considered everything said and the evidence, I have decided to dismiss you.

The reasons are: {{details}}

We will write to you separately about your final pay, your notice and returning company property.`,
    fixed: [APPEAL],
  },
  {
    kind: "case_outcome_no_action",
    label: "Outcome: no action",
    group: "Disciplinary",
    subject: "The outcome of your {{process}} hearing",
    body: `Thank you for attending the {{process}} hearing on {{date}}. I have decided to take no formal action.

{{details}}`,
  },
  {
    kind: "case_appeal_invite",
    label: "Invitation to an appeal hearing",
    group: "Disciplinary",
    subject: "Your appeal hearing",
    body: `Thank you for your appeal. I'm writing to ask you to attend an appeal hearing on {{date}} at {{time}}, at {{place}}.

The appeal will be heard by {{managerName}}, who has not been involved so far. You will have the chance to explain your grounds of appeal: {{details}}`,
    fixed: [ACCOMPANIED],
  },
  {
    kind: "case_appeal_outcome",
    label: "Appeal outcome",
    group: "Disciplinary",
    subject: "The outcome of your appeal",
    body: `Thank you for attending your appeal hearing. Having considered your grounds of appeal and everything said, my decision is that {{reason}}.

{{details}}

This decision is final.`,
  },

  // ── Grievance (ACAS) ──
  {
    kind: "grievance_ack",
    label: "Grievance received",
    group: "Grievance",
    subject: "We've received your grievance",
    body: `Thank you for raising your grievance with us on {{date}}. We take it seriously.

We will invite you to a meeting to talk it through, where you can explain your grievance and how you think it should be settled. {{details}}

If you have any questions in the meantime, please speak to {{managerName}}.`,
  },
  {
    kind: "grievance_meeting_invite",
    label: "Invitation to a grievance meeting",
    group: "Grievance",
    subject: "Invitation to a grievance meeting",
    body: `I'm writing to ask you to a meeting about your grievance on {{date}} at {{time}}, at {{place}}.

The meeting is to talk about: {{details}}

It will be held by {{managerName}}. Please bring anything you'd like us to see.`,
    fixed: [ACCOMPANIED],
  },
  {
    kind: "grievance_outcome",
    label: "Grievance outcome",
    group: "Grievance",
    subject: "The outcome of your grievance",
    body: `Thank you for meeting with us about your grievance. Having looked into it, your grievance is {{reason}}.

{{details}}`,
    fixed: [APPEAL],
  },
  {
    kind: "grievance_appeal_outcome",
    label: "Grievance appeal outcome",
    group: "Grievance",
    subject: "The outcome of your grievance appeal",
    body: `Thank you for your appeal. Having considered your grounds and everything said, my decision is that {{reason}}.

{{details}}

This decision is final.`,
  },
];

/** "1 month", "3 months". */
export const monthsText = (n: number) => `${n} month${n === 1 ? "" : "s"}`;

export function templateFor(kind: string): LetterTemplate | undefined {
  return LETTER_TEMPLATES.find((t) => t.kind === kind);
}

export interface TemplateOverride {
  subject?: string;
  body?: string;
}

/** The company's wording where it has its own, ours where it hasn't. Fixed paragraphs always stay. */
export function templateInForce(kind: string, overrides: Record<string, TemplateOverride> | null | undefined): LetterTemplate | undefined {
  const base = templateFor(kind);
  if (!base) return undefined;
  const o = overrides?.[kind];
  return { ...base, subject: o?.subject?.trim() || base.subject, body: o?.body?.trim() || base.body };
}

export function sanitiseOverrides(raw: unknown): Record<string, TemplateOverride> {
  const out: Record<string, TemplateOverride> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!templateFor(k) || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const subject = typeof o.subject === "string" ? o.subject.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const body = typeof o.body === "string" ? o.body.replace(/\r/g, "").trim().slice(0, 8000) : "";
    if (subject || body) out[k] = { ...(subject ? { subject } : {}), ...(body ? { body } : {}) };
  }
  return out;
}

export type LetterValues = Partial<Record<(typeof LETTER_FIELDS)[number]["field"], string>>;

const FIELD = /\{\{\s*(\w+)\s*\}\}/g;

/** Fill in the merge fields. A field with no value is left blank, and a paragraph left empty is dropped. */
export function merge(text: string, values: LetterValues): string {
  return text
    .replace(FIELD, (_, k: string) => (values as Record<string, string | undefined>)[k]?.trim() ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** A new draft: the template in force, filled in, with the fixed paragraphs after. */
export function draftLetter(t: LetterTemplate, values: LetterValues): { subject: string; body: string; fixed: string[] } {
  return {
    subject: merge(t.subject, values),
    body: merge(t.body, values),
    fixed: (t.fixed ?? []).map((p) => merge(p, values)),
  };
}

/** Fields left unfilled in an edited body, by name, so a letter is never sent with {{reason}} in it. */
export function unfilled(text: string): string[] {
  return [...new Set([...text.matchAll(FIELD)].map((m) => m[1]))];
}

export interface Signer {
  name: string;
  title: string;
}

/** The letter as the person reads it, in an email. Company name at the top; My Care Academy in the footer. */
export function hrLetterHtml(args: { company: string; date: string; greeting: string; body: string; fixed: string[]; signer: Signer }): string {
  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
  const p = (t: string) => `<p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 14px;white-space:pre-line">${esc(t)}</p>`;
  const paras = [...args.body.split(/\n{2,}/), ...args.fixed].map((x) => x.trim()).filter(Boolean).map(p).join("");
  const sign = args.signer.name
    ? `<p style="color:#1e293b;font-size:15px;line-height:1.5;margin:18px 0 0"><strong>${esc(args.signer.name)}</strong>${args.signer.title ? `<br>${esc(args.signer.title)}` : ""}${args.company ? `<br>${esc(args.company)}` : ""}</p>`
    : "";
  return `<div style="background:#f8fafc;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
    <div style="border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:20px"><h1 style="color:#1e293b;margin:0;font-size:22px">${esc(args.company || "Your employer")}</h1></div>
    <p style="color:#475569;font-size:14px;margin:0 0 16px">${esc(args.date)}</p>
    ${p(args.greeting)}${paras}
    ${p("Yours sincerely,")}${sign}
  </div>
  <p style="max-width:600px;margin:12px auto 0;color:#64748b;font-size:12px;text-align:center">Sent for ${esc(args.company || "your employer")} by My Care Academy. A copy is kept on your file, and you can read it when you sign in.</p>
</div>`;
}

/** What the AI is asked for when drafting a letter. */
export const LETTER_DRAFT_SCHEMA = {
  type: "object",
  properties: { subject: { type: "string" }, paragraphs: { type: "array", items: { type: "string" } } },
  required: ["subject", "paragraphs"],
  additionalProperties: false,
} as const;

export function letterPrompt(args: { company: string; label: string; template: string; current: string; notes: string; fixed: string[] }): string {
  return `You are drafting a letter from a UK home-care company, ${args.company || "the employer"}, to a member of its staff. The letter is "${args.label}".

Write plainly and kindly, in British English, as an employer who follows the ACAS Code of Practice. Keep to the facts given; never invent dates, allegations, outcomes or names. Don't add a greeting, sign-off or the company name: those are added for you. Don't repeat these paragraphs, which are added after yours and must not be changed: ${args.fixed.length ? args.fixed.map((f) => `"${f}"`).join(" ") : "(none)"}.

The company's template for this letter:
"""
${args.template}
"""

The draft so far:
"""
${args.current}
"""

The manager's notes for this letter:
"""
${args.notes || "(none)"}
"""

Return JSON: { "subject": "…", "paragraphs": ["…", "…"] }.`;
}
