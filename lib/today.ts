import type { FeatureKey } from "./features";
import type { TodoLine } from "./org-todo";

/**
 * The Today page's arithmetic (redesign, 1 Nov 2026). Pure, so it is tested
 * rather than trusted to the page.
 */

/** One line of "Needs your attention". */
export interface AttentionRow {
  key: string;
  /** Two letters on the tile. */
  code: string;
  title: string;
  meta: string;
  pill: { label: string; tone: "danger" | "warn" };
  href: string;
  action: string;
  /** Which compliance check it counts against, for the readiness ring. */
  check: string;
  /** Late (counts as a thing to fix) or coming up. */
  tone: "alert" | "warn";
}

/**
 * The compliance checks a company is measured on, given its package. The
 * readiness ring is the share of these with nothing late behind them, so a
 * company with nothing wrong reads 100%, and one check with ten late
 * supervisions costs the same as one with one.
 */
export function complianceChecks(enabled: Partial<Record<FeatureKey, boolean>>): string[] {
  const checks = ["training"];
  if (enabled["people.supervisions"]) checks.push("supervisions", "appraisals");
  if (enabled["people.competency"]) checks.push("spot-checks", "competency");
  if (enabled["recruitment.tracker"]) checks.push("documents");
  if (enabled["quality.audits"]) checks.push("audits");
  if (enabled["documents.library"]) checks.push("policies");
  if (enabled["complaints.register"]) checks.push("complaints");
  if (enabled["forms.builder"]) checks.push("forms");
  return checks;
}

/** Which check a to-do line counts against, from where it leads. */
export function checkOf(href: string): string {
  const path = href.split(/[?#]/)[0];
  if (path.startsWith("/org/due/supervisions")) return "supervisions";
  if (path.startsWith("/org/due/appraisals")) return "appraisals";
  if (path.startsWith("/org/due/spot-checks")) return "spot-checks";
  if (path.startsWith("/org/due/competency")) return "competency";
  if (path.startsWith("/org/due/audits") || path.startsWith("/org/audits")) return "audits";
  if (path.startsWith("/org/due/policies")) return "policies";
  if (path.startsWith("/org/due/forms")) return "forms";
  if (path.startsWith("/org/complaints")) return "complaints";
  if (path.startsWith("/org/hr/documents") || path.startsWith("/org/recruitment") || path.startsWith("/org/hr")) return "documents";
  if (path.startsWith("/org/staff/")) {
    if (href.includes("kind=appraisal")) return "appraisals";
    if (href.includes("supervisions")) return "supervisions";
  }
  return "training";
}

/** The two letters on a line's tile. */
export function codeOf(check: string, label?: string): string {
  const fixed: Record<string, string> = {
    training: "TR",
    supervisions: "SV",
    appraisals: "AP",
    "spot-checks": "SC",
    competency: "CA",
    documents: "SD",
    audits: "SA",
    policies: "PO",
    forms: "FO",
    complaints: "SG",
  };
  if (label) {
    const words = label.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(and|the|for|audit)$/i.test(w));
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  }
  return fixed[check] ?? "··";
}

/** "Supervisions: 2 overdue, 1 person has never had one" → a title and a meta line. */
export function splitLine(line: TodoLine): { title: string; meta: string } {
  const i = line.text.indexOf(": ");
  if (i > 0 && i < 40) return { title: line.text.slice(0, i), meta: line.text.slice(i + 2) };
  return { title: line.text, meta: "" };
}

/** A to-do line as a row of the list. */
export function rowFromLine(line: TodoLine, metaSuffix = ""): AttentionRow {
  const check = checkOf(line.href);
  const { title, meta } = splitLine(line);
  return {
    key: line.key,
    code: codeOf(check),
    title,
    meta: [meta, metaSuffix].filter(Boolean).join(" · "),
    pill: line.tone === "alert" ? { label: "Overdue", tone: "danger" } : { label: "Due soon", tone: "warn" },
    href: line.href,
    action: line.action || "See who",
    check,
    tone: line.tone,
  };
}

export interface Readiness {
  /** 0–100: the share of checks with nothing late. */
  pct: number;
  met: number;
  total: number;
  /** Late lines, the "things to fix". */
  toFix: number;
}

export function readiness(checks: string[], rows: AttentionRow[]): Readiness {
  const failing = new Set(rows.filter((r) => r.tone === "alert").map((r) => r.check));
  const met = checks.filter((c) => !failing.has(c)).length;
  const toFix = rows.filter((r) => r.tone === "alert").length;
  return { pct: checks.length ? Math.round((met / checks.length) * 100) : 100, met, total: checks.length, toFix };
}

/** Late first; within each, the order the lines came in. */
export function sortRows(rows: AttentionRow[]): AttentionRow[] {
  return [...rows].sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "alert" ? -1 : 1));
}
