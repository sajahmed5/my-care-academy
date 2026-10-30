/**
 * The company's letterhead on HR letters, and one shape for a letter that the
 * PDF and the Word download both print from (issue #89: "downloaded, ideally
 * in Word or PDF, with the company letterhead and logo").
 *
 * The letterhead is the company's name, its logo with white label, and what
 * a manager sets under Settings → HR → Letters: address, phone and email.
 *
 * Pure: no I/O.
 */

import { LETTER_FIELDS, merge, type LetterTemplate, type LetterValues, type Signer } from "./letters";

export interface Letterhead {
  address: string;
  phone: string;
  email: string;
}

export const EMPTY_LETTERHEAD: Letterhead = { address: "", phone: "", email: "" };

const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function sanitiseLetterhead(raw: unknown): Letterhead {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const email = line(r.email, 120);
  return {
    address: line(r.address, 200),
    phone: line(r.phone, 40),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
  };
}

/** What prints under the company's name: the address, then phone and email on one line. Empty lines left out. */
export function letterheadLines(l: Letterhead): string[] {
  return [l.address, [l.phone, l.email].filter(Boolean).join(" · ")].filter(Boolean);
}

/** One letter, ready to print as a PDF or a Word document. */
export interface LetterDoc {
  company: string;
  letterhead: string[];
  /** Who it's to, when it's a real letter. */
  recipient?: string;
  /** "30 October 2026", or a blank to write on for a template. */
  date: string;
  subject: string;
  greeting: string;
  paragraphs: string[];
  signer: Signer;
}

/** A sent or drafted letter, in the shape both downloads print. */
export function letterDoc(args: { company: string; letterhead: Letterhead; recipient?: string; date: string; subject: string; greeting: string; body: string; fixed: string[]; signer: Signer }): LetterDoc {
  return {
    company: args.company,
    letterhead: letterheadLines(args.letterhead),
    recipient: args.recipient,
    date: args.date,
    subject: args.subject,
    greeting: args.greeting,
    paragraphs: [...args.body.split(/\n{2,}/), ...args.fixed].map((p) => p.trim()).filter(Boolean),
    signer: args.signer,
  };
}

/**
 * A template to print and fill in by hand or in Word: the company's name and
 * main job title filled in, everything else a [bracketed] gap saying what goes
 * there, such as "[their first name]".
 */
export function templateDoc(t: LetterTemplate, own: { subject?: string; body?: string } | null, args: { company: string; letterhead: Letterhead; signer: Signer }): LetterDoc {
  const gaps: LetterValues = Object.fromEntries(
    LETTER_FIELDS.map((f) => [f.field, f.field === "companyName" ? args.company : `[${gapWords(f.field, f.meaning)}]`]),
  );
  return letterDoc({
    company: args.company,
    letterhead: args.letterhead,
    date: "[date]",
    subject: merge(own?.subject || t.subject, gaps),
    greeting: `Dear ${gaps.firstName},`,
    body: merge(own?.body || t.body, gaps),
    fixed: (t.fixed ?? []).map((p) => merge(p, gaps)),
    signer: args.signer,
  });
}

/** "Their first name" → "their first name"; the long explanations get a short gap. */
function gapWords(field: string, meaning: string): string {
  const short: Record<string, string> = {
    date: "date",
    time: "time",
    place: "place",
    months: "number of months",
    reason: "reason",
    details: "details",
    deadline: "deadline",
    managerName: "manager's name",
    process: "disciplinary or capability",
  };
  return short[field] ?? meaning.charAt(0).toLowerCase() + meaning.slice(1);
}

/** A file name for a download: the subject, safe for every system. */
export const letterFileName = (subject: string) => subject.replace(/[^\w .,()-]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "Letter";
