/**
 * The client list (PACKAGES.md, Clients, 29 Oct 2026): the people the service
 * cares for, so spot checks, client QAs, audits and concerns link to the same
 * person. Not a care-planning system — a name, a few facts, who pays.
 *
 * Pure: the upload page parses and checks a spreadsheet with this in the
 * browser, and the server action checks every row again with the same code.
 */

export const FUNDER_TYPES = [
  { value: "council", label: "Council" },
  { value: "self", label: "Self-funded" },
  { value: "nhs", label: "NHS continuing healthcare" },
  { value: "other", label: "Other" },
] as const;

export type FunderType = (typeof FUNDER_TYPES)[number]["value"];

export function funderLabel(type: string, name?: string | null): string {
  if (type === "council" && name) return name;
  if (type === "other" && name) return name;
  return FUNDER_TYPES.find((f) => f.value === type)?.label ?? type;
}

export interface ClientInput {
  fullName: string;
  dateOfBirth: string | null;
  region: string | null;
  postcode: string | null;
  funderType: FunderType;
  funderName: string | null;
  medicationSupport: boolean;
  startDate: string | null;
  status: "active" | "ended";
}

/** dd/mm/yyyy (how a UK spreadsheet writes it), d/m/yy, or yyyy-mm-dd → yyyy-mm-dd. */
export function parseUkDate(raw: string): string | null | "invalid" {
  const s = raw.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (uk) {
    [d, m, y] = [Number(uk[1]), Number(uk[2]), Number(uk[3])];
    if (y < 100) y += y > 30 ? 1900 : 2000;
  } else {
    return "invalid";
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "invalid";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function yes(raw: string): boolean {
  return /^(y|yes|true|1|x)$/i.test(raw.trim());
}

/** What a funder cell says: a council's name, "self", "NHS"/"CHC", or something else. */
export function parseFunder(raw: string): { type: FunderType; name: string | null } {
  const s = raw.trim();
  if (!s) return { type: "council", name: null };
  if (/^(self|self[- ]?fund(ed|ing)?|private)$/i.test(s)) return { type: "self", name: null };
  if (/\b(nhs|chc|icb|continuing health ?care)\b/i.test(s)) return { type: "nhs", name: null };
  if (/council|borough|county|city|adults|social care|\bla\b/i.test(s)) return { type: "council", name: s };
  return { type: "other", name: s };
}

/** Check one client before it's saved: what's wrong with it, or nothing. */
export function clientProblems(c: ClientInput): string[] {
  const problems: string[] = [];
  if (!c.fullName.trim()) problems.push("No name");
  if (c.fullName.length > 200) problems.push("Name is too long");
  return problems;
}

const HEADERS: Record<string, string[]> = {
  name: ["name", "full name", "client", "client name", "service user"],
  dob: ["date of birth", "dob", "birth date"],
  region: ["region", "area", "patch", "branch"],
  postcode: ["postcode", "post code", "postal code"],
  funder: ["funder", "funded by", "council", "local authority", "who pays"],
  medication: ["medication", "medication support", "meds", "helps with medication"],
  start: ["start date", "started", "start", "care started"],
  status: ["status", "active"],
};

export function splitCsvLine(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export interface ParsedClientRow {
  line: number;
  client: ClientInput;
  problems: string[];
}

/**
 * A spreadsheet saved as CSV, one client a row, with a header row naming the
 * columns (the template's, or close to it). Only the name is required.
 */
export function parseClientsCsv(text: string): { rows: ParsedClientRow[]; problem?: string } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], problem: "The file needs a header row and at least one client." };
  const delim = lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const head = splitCsvLine(lines[0], delim).map((h) => h.toLowerCase().replace(/[*:]/g, "").trim());
  const col = (key: string) => head.findIndex((h) => HEADERS[key].includes(h));
  const idx = Object.fromEntries(Object.keys(HEADERS).map((k) => [k, col(k)])) as Record<string, number>;
  if (idx.name < 0) return { rows: [], problem: "Couldn't find a Name column. Start from the template." };

  const rows: ParsedClientRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim);
    const cell = (k: string) => (idx[k] >= 0 ? (cells[idx[k]] ?? "") : "");
    const problems: string[] = [];
    const dob = parseUkDate(cell("dob"));
    const start = parseUkDate(cell("start"));
    if (dob === "invalid") problems.push(`Date of birth "${cell("dob")}" isn't a date`);
    if (start === "invalid") problems.push(`Start date "${cell("start")}" isn't a date`);
    const funder = parseFunder(cell("funder"));
    const status = /^(ended|left|inactive|no|false|0)$/i.test(cell("status").trim()) ? "ended" : "active";
    const client: ClientInput = {
      fullName: cell("name").replace(/\s+/g, " ").trim(),
      dateOfBirth: dob === "invalid" ? null : dob,
      region: cell("region") || null,
      postcode: cell("postcode").toUpperCase() || null,
      funderType: funder.type,
      funderName: funder.name,
      medicationSupport: yes(cell("medication")),
      startDate: start === "invalid" ? null : start,
      status,
    };
    problems.push(...clientProblems(client));
    rows.push({ line: i + 1, client, problems });
  }
  return { rows };
}

export const CLIENT_TEMPLATE_CSV =
  "Name,Date of birth,Region,Postcode,Funder,Medication support,Start date,Status\r\n" +
  "[CLIENT NAME],01/02/1940,[YOUR REGION],[POSTCODE],[COUNCIL NAME or Self-funded or NHS],Yes,01/09/2025,Active\r\n";
