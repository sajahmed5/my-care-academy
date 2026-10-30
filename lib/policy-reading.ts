/**
 * Who must read which policy, by when, and who is late (POLICIES.md, "Who
 * must read what").
 *
 * Each published copy is set for an audience — carers, office staff,
 * managers, office staff and managers, or everyone — with a number of days to
 * accept. A person's deadline counts from whichever is later: the version they
 * are asked to accept being published, or the day they started. So a new
 * starter is never late on day one for a policy published a year ago, and a
 * new version gives everyone the full time again.
 *
 * Pure: every page, the weekly email and the daily reminders build their view
 * from buildReading(), so they never disagree about who is late.
 */

export const AUDIENCES = {
  everyone: { label: "Everyone", roles: ["learner", "org_office", "org_admin"] },
  carers: { label: "Carers", roles: ["learner"] },
  office: { label: "Office staff", roles: ["org_office"] },
  managers: { label: "Managers", roles: ["org_admin"] },
  console: { label: "Office staff and managers", roles: ["org_office", "org_admin"] },
} as const;

export type Audience = keyof typeof AUDIENCES;
export const AUDIENCE_KEYS = Object.keys(AUDIENCES) as Audience[];

export function isAudience(v: unknown): v is Audience {
  return typeof v === "string" && v in AUDIENCES;
}

export function inAudience(audience: Audience, role: string): boolean {
  return (AUDIENCES[audience]?.roles as readonly string[] | undefined)?.includes(role) ?? false;
}

export const DEFAULT_ACCEPT_DAYS = 14;
export const ACCEPT_PERIODS = [7, 14, 28] as const;

/** Days before a deadline when the "due soon" reminder goes out. */
export const DUE_SOON_DAYS = 3;

export interface ReadingCopy {
  copyId: string;
  policyId: string;
  title: string;
  code: string;
  version: number;
  /** When the current version was published. */
  publishedAt: string;
  audience: Audience;
  /** This policy's own deadline; null means the company's. */
  acceptWithinDays: number | null;
}

export interface ReadingPerson {
  id: string;
  name: string;
  role: string;
  /** When they started: hired, or their login made. */
  startedAt: string | null;
}

export interface ReadingAck {
  userId: string;
  copyId: string;
  version: number;
  at: string;
}

export type ReadingStatus = "accepted" | "outstanding" | "late";

export interface ReadingEntry {
  copyId: string;
  userId: string;
  /** YYYY-MM-DD. */
  dueOn: string;
  status: ReadingStatus;
  /** The newest version they accepted, if any (an older one leaves them outstanding). */
  acceptedVersion: number | null;
  acceptedAt: string | null;
}

/** YYYY-MM-DD, `days` after the later of the two moments. */
export function acceptBy(publishedAt: string, startedAt: string | null, days: number): string {
  const from = startedAt && startedAt > publishedAt ? startedAt : publishedAt;
  const d = new Date(`${from.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Late once the whole of the due day has passed. */
export function isLate(dueOn: string, today: string): boolean {
  return today > dueOn;
}

/** Every (policy, person) pair the policy is for, with where it stands. */
export function buildReading({
  copies,
  people,
  acks,
  companyDays,
  today,
}: {
  copies: ReadingCopy[];
  people: ReadingPerson[];
  acks: ReadingAck[];
  companyDays: number;
  /** YYYY-MM-DD, in the UK. */
  today: string;
}): ReadingEntry[] {
  const latest = new Map<string, ReadingAck>();
  for (const a of acks) {
    const key = `${a.copyId}|${a.userId}`;
    const prev = latest.get(key);
    if (!prev || a.version > prev.version) latest.set(key, a);
  }
  const out: ReadingEntry[] = [];
  for (const c of copies) {
    for (const p of people) {
      if (!inAudience(c.audience, p.role)) continue;
      const ack = latest.get(`${c.copyId}|${p.id}`);
      const dueOn = acceptBy(c.publishedAt, p.startedAt, c.acceptWithinDays ?? companyDays);
      const accepted = !!ack && ack.version >= c.version;
      out.push({
        copyId: c.copyId,
        userId: p.id,
        dueOn,
        status: accepted ? "accepted" : isLate(dueOn, today) ? "late" : "outstanding",
        acceptedVersion: ack?.version ?? null,
        acceptedAt: ack?.at ?? null,
      });
    }
  }
  return out;
}

/** Per policy: how many it is for, accepted, and late. */
export function tallyByCopy(entries: ReadingEntry[]): Map<string, { total: number; accepted: number; late: number }> {
  const out = new Map<string, { total: number; accepted: number; late: number }>();
  for (const e of entries) {
    const t = out.get(e.copyId) ?? { total: 0, accepted: 0, late: 0 };
    t.total++;
    if (e.status === "accepted") t.accepted++;
    if (e.status === "late") t.late++;
    out.set(e.copyId, t);
  }
  return out;
}

/**
 * Who gets a policy reminder today: anyone with something to accept who has
 * not been reminded since it was published to them, or who has something due
 * within DUE_SOON_DAYS or late and was last reminded `repeatDays` or more ago.
 */
export function planPolicyReminders({
  entries,
  copies,
  lastSent,
  repeatDays,
  today,
}: {
  entries: ReadingEntry[];
  copies: ReadingCopy[];
  lastSent: Map<string, string>;
  repeatDays: number;
  today: string;
}): { userId: string; copyIds: string[] }[] {
  const copyOf = new Map(copies.map((c) => [c.copyId, c]));
  const soon = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + DUE_SOON_DAYS);
    return d.toISOString().slice(0, 10);
  })();
  const byPerson = new Map<string, ReadingEntry[]>();
  for (const e of entries) {
    if (e.status === "accepted") continue;
    byPerson.set(e.userId, [...(byPerson.get(e.userId) ?? []), e]);
  }
  const plans: { userId: string; copyIds: string[] }[] = [];
  for (const [userId, open] of byPerson) {
    const last = lastSent.get(userId) ?? null;
    const newSinceLast = open.some((e) => !last || (copyOf.get(e.copyId)?.publishedAt ?? "") > last);
    const pressing = open.some((e) => e.dueOn <= soon);
    const repeatDue = !last || addDays(last.slice(0, 10), repeatDays) <= today;
    if (newSinceLast || (pressing && repeatDue)) plans.push({ userId, copyIds: open.map((e) => e.copyId) });
  }
  return plans;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
