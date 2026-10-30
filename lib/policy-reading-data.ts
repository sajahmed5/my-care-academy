/**
 * Reading the rows buildReading() works from, through the caller's own
 * (RLS-scoped) client: a console user gets the whole organisation, anyone
 * else only themselves — the same rows decide the same answer either way.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { ukToday } from "./policy-library";
import {
  DEFAULT_ACCEPT_DAYS,
  buildReading,
  isAudience,
  type ReadingCopy,
  type ReadingEntry,
  type ReadingPerson,
} from "./policy-reading";

export interface Reading {
  copies: ReadingCopy[];
  people: ReadingPerson[];
  entries: ReadingEntry[];
  companyDays: number;
}

export async function loadReading(
  supabase: SupabaseClient,
  organisationId: string,
  /** Just this person (their own page, or one carer's file). */
  only?: { userId: string },
): Promise<Reading> {
  // Everyone, a page at a time: one read returns at most 1,000 rows.
  const peoplePage = (from: number, to: number) => {
    let q = supabase
      .from("users")
      .select("id, full_name, email, role")
      .eq("organisation_id", organisationId)
      .in("role", ["learner", "org_admin", "org_office"])
      .eq("status", "active");
    if (only) q = q.eq("id", only.userId);
    return q.order("full_name").order("id").range(from, to);
  };

  const [{ data: copyRows }, users, acks, started, { data: settings }] = await Promise.all([
    supabase
      .from("organisation_policies")
      .select("id, policy_id, version, published_at, audience, accept_within_days, policy_documents(code, title)")
      .eq("organisation_id", organisationId)
      .eq("status", "published")
      .gt("version", 0)
      .limit(500),
    fetchAll<{ id: string; full_name: string | null; email: string | null; role: string }>(peoplePage),
    fetchAll<{ user_id: string; organisation_policy_id: string; version: number; acknowledged_at: string }>((from, to) => {
      let q = supabase
        .from("policy_acknowledgements")
        .select("user_id, organisation_policy_id, version, acknowledged_at")
        .eq("organisation_id", organisationId)
        .not("organisation_policy_id", "is", null);
      if (only) q = q.eq("user_id", only.userId);
      return q.order("id").range(from, to);
    }),
    // The RPC is capped at 1,000 rows like any read, so paged the same way.
    fetchAll<{ user_id: string; started_at: string }>((from, to) =>
      supabase.rpc("staff_started_at").order("user_id").range(from, to),
    ),
    supabase.from("organisation_policy_settings").select("accept_within_days").eq("organisation_id", organisationId).maybeSingle(),
  ]);

  const copies: ReadingCopy[] = (copyRows ?? []).flatMap((c) => {
    const doc = (Array.isArray(c.policy_documents) ? c.policy_documents[0] : c.policy_documents) as
      | { code: string; title: string }
      | null;
    if (!c.published_at) return [];
    return [
      {
        copyId: c.id as string,
        policyId: c.policy_id as string,
        title: doc?.title ?? "Policy",
        code: doc?.code ?? "",
        version: c.version as number,
        publishedAt: c.published_at as string,
        audience: isAudience(c.audience) ? c.audience : "everyone",
        acceptWithinDays: (c.accept_within_days as number | null) ?? null,
      },
    ];
  });
  const startOf = new Map(started.map((s) => [s.user_id, s.started_at]));
  const people: ReadingPerson[] = users.map((u) => ({
    id: u.id,
    name: (u.full_name ?? u.email) || "Unnamed",
    role: u.role,
    startedAt: startOf.get(u.id) ?? null,
  }));
  const companyDays = (settings?.accept_within_days as number | undefined) ?? DEFAULT_ACCEPT_DAYS;
  const entries = buildReading({
    copies,
    people,
    acks: acks.map((a) => ({ userId: a.user_id, copyId: a.organisation_policy_id, version: a.version, at: a.acknowledged_at })),
    companyDays,
    today: ukToday(),
  });
  return { copies, people, entries, companyDays };
}

/**
 * The same, for many organisations at once, as the service role — for the
 * weekly email and the daily reminders, which run with no organisation of
 * their own (so staff_started_at() has nobody to answer for, and the start
 * dates are worked out here the same way). Callers pass only organisations
 * entitled to the policies.
 */
export async function loadReadingForOrgs(
  admin: SupabaseClient,
  orgIds: string[],
  today: string,
): Promise<Map<string, Reading & { emails: Map<string, string> }>> {
  const out = new Map<string, Reading & { emails: Map<string, string> }>();
  if (orgIds.length === 0) return out;
  // The organisation ids travel in the URL, which fails somewhere past ~390
  // of them: read 100 organisations at a time.
  const copyRows: Record<string, unknown>[] = [];
  const users: Record<string, unknown>[] = [];
  const acks: Record<string, unknown>[] = [];
  const hires: Record<string, unknown>[] = [];
  const settings: Record<string, unknown>[] = [];
  for (let i = 0; i < orgIds.length; i += ORGS_PER_REQUEST) {
    const part = orgIds.slice(i, i + ORGS_PER_REQUEST);
    const loaded = await loadOrgsPart(admin, part);
    copyRows.push(...loaded[0]);
    users.push(...loaded[1]);
    acks.push(...loaded[2]);
    hires.push(...loaded[3]);
    settings.push(...loaded[4]);
  }

  const hiredAt = new Map<string, string>();
  for (const h of hires) {
    const prev = hiredAt.get(h.user_id as string);
    if (!prev || (h.hired_at as string) > prev) hiredAt.set(h.user_id as string, h.hired_at as string);
  }
  for (const orgId of orgIds) {
    const copies: ReadingCopy[] = copyRows
      .filter((c) => c.organisation_id === orgId && c.published_at)
      .map((c) => {
        const doc = (Array.isArray(c.policy_documents) ? c.policy_documents[0] : c.policy_documents) as
          | { code: string; title: string }
          | null;
        return {
          copyId: c.id as string,
          policyId: c.policy_id as string,
          title: doc?.title ?? "Policy",
          code: doc?.code ?? "",
          version: c.version as number,
          publishedAt: c.published_at as string,
          audience: isAudience(c.audience) ? c.audience : "everyone",
          acceptWithinDays: (c.accept_within_days as number | null) ?? null,
        };
      });
    if (copies.length === 0) continue;
    const mine = users.filter((u) => u.organisation_id === orgId);
    const people: ReadingPerson[] = mine.map((u) => {
      const created = u.created_at as string;
      const hired = hiredAt.get(u.id as string);
      return {
        id: u.id as string,
        name: ((u.full_name as string | null) ?? (u.email as string | null)) || "Unnamed",
        role: u.role as string,
        startedAt: hired && hired > created ? hired : created,
      };
    });
    const companyDays =
      (settings.find((s) => s.organisation_id === orgId)?.accept_within_days as number | undefined) ?? DEFAULT_ACCEPT_DAYS;
    const entries = buildReading({
      copies,
      people,
      acks: acks
        .filter((a) => a.organisation_id === orgId)
        .map((a) => ({
          userId: a.user_id as string,
          copyId: a.organisation_policy_id as string,
          version: a.version as number,
          at: a.acknowledged_at as string,
        })),
      companyDays,
      today,
    });
    out.set(orgId, {
      copies,
      people,
      entries,
      companyDays,
      emails: new Map(mine.filter((u) => u.email).map((u) => [u.id as string, u.email as string])),
    });
  }
  return out;
}

const ORGS_PER_REQUEST = 100;

type Row = Record<string, unknown>;

/** One batch of organisations' rows for loadReadingForOrgs. */
function loadOrgsPart(admin: SupabaseClient, ids: string[]): Promise<[Row[], Row[], Row[], Row[], Row[]]> {
  return Promise.all([
    fetchAll((f, t) =>
      admin
        .from("organisation_policies")
        .select("id, organisation_id, policy_id, version, published_at, audience, accept_within_days, policy_documents(code, title)")
        .in("organisation_id", ids)
        .eq("status", "published")
        .gt("version", 0)
        .order("id")
        .range(f, t),
    ),
    fetchAll((f, t) =>
      admin
        .from("users")
        .select("id, organisation_id, full_name, email, role, created_at")
        .in("organisation_id", ids)
        .in("role", ["learner", "org_admin", "org_office"])
        .eq("status", "active")
        .order("id")
        .range(f, t),
    ),
    fetchAll((f, t) =>
      admin
        .from("policy_acknowledgements")
        .select("user_id, organisation_id, organisation_policy_id, version, acknowledged_at")
        .in("organisation_id", ids)
        .not("organisation_policy_id", "is", null)
        .order("id")
        .range(f, t),
    ),
    fetchAll((f, t) =>
      admin
        .from("candidates")
        .select("id, user_id, organisation_id, hired_at")
        .in("organisation_id", ids)
        .not("hired_at", "is", null)
        .not("user_id", "is", null)
        .order("id")
        .range(f, t),
    ),
    fetchAll((f, t) =>
      admin
        .from("organisation_policy_settings")
        .select("organisation_id, accept_within_days")
        .in("organisation_id", ids)
        .order("organisation_id")
        .range(f, t),
    ),
  ]);
}
