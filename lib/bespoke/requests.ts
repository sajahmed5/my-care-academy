/**
 * A company's request for a bespoke report (BESPOKE-REPORTS.md): what they
 * want to know, who it's for, how often and in what format, and where it is.
 *
 * Pure: the wording, the choices and the checks, shared by both sides and by
 * the emails. The tables are report_requests and report_request_messages.
 */

import { workingDaysLeft } from "./working-days";

export const AUDIENCES = [
  { value: "cqc", label: "CQC" },
  { value: "council", label: "The council or a commissioner" },
  { value: "directors", label: "Our directors" },
  { value: "staff", label: "Our managers and staff" },
  { value: "other", label: "Someone else" },
] as const;
export type Audience = (typeof AUDIENCES)[number]["value"];

export const FREQUENCIES = [
  { value: "one_off", label: "Once" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
] as const;
export type Frequency = (typeof FREQUENCIES)[number]["value"];

export const FORMATS = [
  { value: "screen", label: "On screen" },
  { value: "pdf", label: "PDF" },
  { value: "excel", label: "Excel" },
] as const;
export type Format = (typeof FORMATS)[number]["value"];

export const REQUEST_STATUSES = [
  { value: "asked", label: "Asked", hint: "With us. We'll be in touch if anything needs clarifying." },
  { value: "building", label: "Being built", hint: "We're building it." },
  { value: "ready", label: "Ready", hint: "Ready to view under Our reports." },
  { value: "withdrawn", label: "Withdrawn", hint: "No longer wanted." },
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number]["value"];

const labelOf = (list: readonly { value: string; label: string }[], v: string) =>
  list.find((x) => x.value === v)?.label ?? v;

export const audienceLabel = (v: string, other?: string | null) =>
  v === "other" && other?.trim() ? other.trim() : labelOf(AUDIENCES, v);
export const frequencyLabel = (v: string) => labelOf(FREQUENCIES, v);
export const formatLabel = (v: string) => labelOf(FORMATS, v);
export const requestStatusLabel = (v: string) => labelOf(REQUEST_STATUSES, v);

/** Still with us: asked or being built. */
export const isOpenRequest = (status: string) => status === "asked" || status === "building";

export interface RequestInput {
  title: string;
  question: string;
  audience: Audience;
  audienceOther: string | null;
  frequency: Frequency;
  format: Format;
}

const isOne = <T extends string>(list: readonly { value: T }[], v: string): v is T =>
  list.some((x) => x.value === v);

/** Read and check the request form. A string is the error to show. */
export function readRequest(raw: Record<string, string>): RequestInput | string {
  const title = (raw.title ?? "").trim();
  const question = (raw.question ?? "").trim();
  const audience = raw.audience ?? "";
  const audienceOther = (raw.audienceOther ?? "").trim();
  const frequency = raw.frequency ?? "";
  const format = raw.format ?? "";
  if (!title) return "Give the report a name.";
  if (title.length > 150) return "Keep the name under 150 characters.";
  if (!question) return "Tell us what you want the report to show.";
  if (question.length > 4000) return "Keep what you want to know under 4,000 characters.";
  if (!isOne(AUDIENCES, audience)) return "Choose who the report is for.";
  if (audience === "other" && !audienceOther) return "Say who the report is for.";
  if (audienceOther.length > 200) return "Keep who it's for under 200 characters.";
  if (!isOne(FREQUENCIES, frequency)) return "Choose how often you need it.";
  if (!isOne(FORMATS, format)) return "Choose the format you'd like.";
  return {
    title,
    question,
    audience,
    audienceOther: audience === "other" ? audienceOther : null,
    frequency,
    format,
  };
}

/**
 * Where the promise stands, in words: "Due in 4 working days", "Due today",
 * "2 working days late". Only for a request still open.
 */
export function dueWords(today: string, dueOn: string): { text: string; late: boolean } {
  const left = workingDaysLeft(today, dueOn);
  if (left > 1) return { text: `Due in ${left} working days`, late: false };
  if (left === 1) return { text: "Due the next working day", late: false };
  if (left === 0) return { text: "Due today", late: false };
  const late = -left;
  return { text: `${late} working day${late === 1 ? "" : "s"} late`, late: true };
}
