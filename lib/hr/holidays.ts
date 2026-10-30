import { addDays } from "./probation";

/**
 * Holidays (HR-PACK.md, added 29 Oct 2026): a record of leave taken against
 * an allowance, for carers and office staff alike. The office sets each
 * person's allowance in days or hours; there are no accrual sums (12.07% of
 * hours worked needs the hours, which only a rota has). The company sets when
 * its leave year starts and whether bank holidays come out of the allowance.
 *
 * Pure: the person's page, their file, the approvals list and the calendar
 * all count from here.
 */

export interface LeaveType {
  key: string;
  label: string;
  /** Takes from the allowance. */
  fromAllowance: boolean;
  /** One of ours (can't be removed), or the company's own. */
  ours?: boolean;
}

export const OUR_LEAVE_TYPES: LeaveType[] = [
  { key: "annual", label: "Annual leave", fromAllowance: true, ours: true },
  { key: "unpaid", label: "Unpaid leave", fromAllowance: false, ours: true },
  { key: "compassionate", label: "Compassionate leave", fromAllowance: false, ours: true },
  { key: "parental", label: "Maternity, paternity or adoption leave", fromAllowance: false, ours: true },
  { key: "toil", label: "Time off in lieu", fromAllowance: false, ours: true },
];

export function sanitiseLeaveTypes(raw: unknown): LeaveType[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: LeaveType[] = [];
  for (const item of list.slice(0, 12)) {
    const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    const key = typeof r.key === "string" && /^own_[a-z0-9]{4,12}$/.test(r.key) ? r.key : null;
    if (!label || !key || out.some((t) => t.key === key)) continue;
    out.push({ key, label, fromAllowance: r.fromAllowance === true });
  }
  return out;
}

export const leaveTypesFor = (own: LeaveType[]) => [...OUR_LEAVE_TYPES, ...own];
export const leaveTypeLabel = (key: string, own: LeaveType[] = []) => leaveTypesFor(own).find((t) => t.key === key)?.label ?? key;

/**
 * England and Wales bank holidays (gov.uk), 2026 to 2028. A company in
 * Scotland or Northern Ireland sets amounts by hand; the list only
 * suggests.
 */
export const BANK_HOLIDAYS = new Set([
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
  "2028-01-03", "2028-04-14", "2028-04-17", "2028-05-01", "2028-05-29", "2028-08-28", "2028-12-25", "2028-12-26",
]);

export interface HolidaySettings {
  /** "MM-DD". */
  yearStart: string;
  bankHolidaysFromAllowance: boolean;
  maxOffAtOnce: number | null;
  own: LeaveType[];
}

export function holidaySettingsFromRow(row: Record<string, unknown> | null | undefined): HolidaySettings {
  const ys = typeof row?.leave_year_start === "string" && /^\d{2}-\d{2}$/.test(row.leave_year_start) ? row.leave_year_start : "01-01";
  return {
    yearStart: ys,
    bankHolidaysFromAllowance: row?.bank_holidays_from_allowance !== false,
    maxOffAtOnce: typeof row?.max_off_at_once === "number" ? row.max_off_at_once : null,
    own: sanitiseLeaveTypes(row?.leave_types),
  };
}

/** The leave year a date falls in: its first day and its last. */
export function leaveYear(dateIso: string, yearStart: string): { start: string; end: string } {
  const y = Number(dateIso.slice(0, 4));
  let start = `${y}-${yearStart}`;
  if (start > dateIso) start = `${y - 1}-${yearStart}`;
  const next = `${Number(start.slice(0, 4)) + 1}-${yearStart}`;
  return { start, end: addDays(next, -1) };
}

/**
 * The suggested amount for a stretch of leave, in days: weekdays, leaving
 * out bank holidays unless they come out of the allowance. Only a suggestion:
 * a carer on weekends changes it, as does anyone counting in hours.
 */
export function suggestDays(startIso: string, endIso: string, bankHolidaysFromAllowance: boolean): number {
  let n = 0;
  for (let d = startIso; d <= endIso; d = addDays(d, 1)) {
    const day = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (day === 0 || day === 6) continue;
    if (!bankHolidaysFromAllowance && BANK_HOLIDAYS.has(d)) continue;
    n++;
  }
  return n;
}

export interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  amount: number;
  unit: string;
  status: string;
}

/** Within a leave year: the allowance, what's taken or booked, and what's left. */
export function balance(
  allowance: { amount: number; unit: string } | null,
  requests: LeaveRequest[],
  year: { start: string; end: string },
  types: LeaveType[],
  todayIso: string,
): { allowance: number | null; unit: string; taken: number; booked: number; pending: number; left: number | null } {
  const counts = requests.filter(
    (r) => r.start_date >= year.start && r.start_date <= year.end && types.find((t) => t.key === r.leave_type)?.fromAllowance,
  );
  const sum = (list: LeaveRequest[]) => list.reduce((n, r) => n + Number(r.amount || 0), 0);
  const approved = counts.filter((r) => r.status === "approved");
  const taken = sum(approved.filter((r) => r.start_date <= todayIso));
  const booked = sum(approved.filter((r) => r.start_date > todayIso));
  const pending = sum(counts.filter((r) => r.status === "requested"));
  const total = allowance ? Number(allowance.amount) : null;
  return { allowance: total, unit: allowance?.unit ?? "days", taken, booked, pending, left: total === null ? null : round(total - taken - booked) };
}

const round = (n: number) => Math.round(n * 100) / 100;

export const overlaps = (r: Pick<LeaveRequest, "start_date" | "end_date">, from: string, to: string) => r.start_date <= to && r.end_date >= from;

/** Who else is off (approved) on any day of this request, and the busiest day's count including them. */
export function clashes(
  request: Pick<LeaveRequest, "id" | "user_id" | "start_date" | "end_date">,
  approved: LeaveRequest[],
): { others: string[]; busiest: number } {
  const others = approved.filter((r) => r.id !== request.id && r.user_id !== request.user_id && r.status === "approved" && overlaps(r, request.start_date, request.end_date));
  let busiest = 1;
  for (let d = request.start_date; d <= request.end_date; d = addDays(d, 1)) {
    const off = new Set(others.filter((r) => overlaps(r, d, d)).map((r) => r.user_id));
    busiest = Math.max(busiest, off.size + 1);
  }
  return { others: [...new Set(others.map((r) => r.user_id))], busiest };
}

/**
 * Who may approve whose leave (HR-PACK.md): managers and office approve
 * carers'; only managers approve office staff's and managers'; nobody
 * approves their own.
 */
export function canApprove(approver: { id: string; role: string }, person: { id: string; role: string }): boolean {
  if (approver.id === person.id) return false;
  if (approver.role === "org_admin") return true;
  if (approver.role === "org_office") return person.role === "learner";
  return false;
}

export const STATUS_LABEL: Record<string, string> = {
  requested: "Waiting",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};

export const amountText = (n: number, unit: string) => `${round(Number(n))} ${unit === "hours" ? (Number(n) === 1 ? "hour" : "hours") : Number(n) === 1 ? "day" : "days"}`;
