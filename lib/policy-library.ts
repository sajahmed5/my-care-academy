/**
 * The policies an organisation can see, and what they read.
 *
 * One combined pack since 31 Oct 2026 (POLICIES.md, "Clean-up"): the CQC
 * basics, full and add-on packs repeated the same titles, so they were merged
 * and the duplicates retired. A policy is read and accepted, and the
 * acceptance is the evidence. The forms and logs that shared this table are
 * drafts on their way to Forms (FORMS.md) and are never shown here.
 *
 * Everything here is a template: it carries {{organisation}} where the
 * provider's name goes, and guidance in square brackets that the provider is
 * meant to complete. Both survive to the screen — the name is substituted, the
 * guidance is shown as guidance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";

export type PolicyKind = "policy" | "form" | "log";

export interface PolicyBlock {
  type: "heading" | "paragraph" | "bullet" | "guidance";
  text: string;
  level?: number;
}

export interface PolicySummary {
  id: string;
  code: string;
  title: string;
  category: string;
  kind: PolicyKind;
  service_types: string[] | null;
  version: number | null;
  /** The version this reader has accepted, if any. */
  acknowledgedVersion?: number | null;
}

export interface PolicyDocument extends PolicySummary {
  blocks: PolicyBlock[];
}

/**
 * Put the organisation's name into a template.
 *
 * White-label is the whole reason the library is stored as text: a provider
 * reading "{{organisation}} will arrange for the prevention of infection" sees
 * their own name, not ours and certainly not another provider's.
 */
export function render(blocks: PolicyBlock[], organisationName: string): PolicyBlock[] {
  return blocks.map((b) => ({
    ...b,
    text: b.text.replaceAll("{{organisation}}", organisationName),
  }));
}

/**
 * Does a policy's version suit this organisation's service?
 *
 * Domiciliary and residential versions of the same title sit side by side,
 * and a company sees the one for its service type. One that has not said is
 * a homecare company — that is who the site is for — and sees the
 * domiciliary versions rather than every title twice. "Both" sees both.
 */
export function appliesTo(serviceTypes: string[] | null, orgServiceType: string | null): boolean {
  if (!serviceTypes || serviceTypes.length === 0) return true;
  if (orgServiceType === "both") return true;
  return serviceTypes.includes(orgServiceType ?? "homecare");
}

/** "Domiciliary" or "Residential", for a company that runs both. */
export function serviceLabel(serviceTypes: string[] | null): string | null {
  if (!serviceTypes || serviceTypes.length !== 1) return null;
  return serviceTypes[0] === "care_home" ? "Residential" : "Domiciliary";
}

export async function loadLibrary(
  supabase: SupabaseClient,
  {
    serviceType,
    userId,
  }: {
    serviceType: string | null;
    userId: string;
  },
): Promise<PolicySummary[]> {
  const [{ data: rows }, { data: acks }] = await Promise.all([
    supabase
      .from("policy_documents")
      .select("id, code, title, category, kind, service_types, version")
      .eq("status", "published")
      .eq("kind", "policy")
      .order("category")
      .order("sort_order")
      .order("title")
      .limit(500),
    supabase
      .from("policy_acknowledgements")
      .select("policy_id, version")
      .eq("user_id", userId),
  ]);

  const ackOf = new Map((acks ?? []).map((a) => [a.policy_id as string, a.version as number]));

  return (rows ?? [])
    .filter((r) => appliesTo(r.service_types as string[] | null, serviceType))
    .map((r) => ({
      id: r.id as string,
      code: r.code as string,
      title: r.title as string,
      category: r.category as string,
      kind: r.kind as PolicyKind,
      service_types: (r.service_types as string[] | null) ?? null,
      version: (r.version as number | null) ?? null,
      acknowledgedVersion: ackOf.get(r.id as string) ?? null,
    }));
}

export async function loadPolicy(
  supabase: SupabaseClient,
  code: string,
  userId: string,
): Promise<PolicyDocument | null> {
  const [{ data: row }, { data: acks }] = await Promise.all([
    supabase
      .from("policy_documents")
      .select("id, code, title, category, kind, service_types, version, blocks")
      .eq("code", code)
      .maybeSingle(),
    supabase.from("policy_acknowledgements").select("policy_id, version").eq("user_id", userId),
  ]);
  if (!row) return null;

  const ack = (acks ?? []).find((a) => a.policy_id === row.id);
  return {
    id: row.id as string,
    code: row.code as string,
    title: row.title as string,
    category: row.category as string,
    kind: row.kind as PolicyKind,
    service_types: (row.service_types as string[] | null) ?? null,
    version: (row.version as number | null) ?? null,
    blocks: (row.blocks as PolicyBlock[]) ?? [],
    acknowledgedVersion: (ack?.version as number | undefined) ?? null,
  };
}

/**
 * The library's topics, in the order a manager thinks of them: the care
 * itself first, the paperwork of running a company last. A topic not listed
 * here goes at the end rather than nowhere.
 */
export const POLICY_CATEGORIES = [
  "Care and support",
  "Safeguarding and concerns",
  "Medicines and health",
  "Health and safety",
  "Staff and employment",
  "Information and records",
  "Governance and quality",
] as const;

/** Group a list for display: topics in their order, each keeping the library's. */
export function byCategory<T extends { category: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  const rank = (c: string) => {
    const i = (POLICY_CATEGORIES as readonly string[]).indexOf(c);
    return i === -1 ? POLICY_CATEGORIES.length : i;
  };
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b));
}

// ---------------------------------------------------------------------------
// Who has accepted what — the manager's side of the acknowledgement.
// ---------------------------------------------------------------------------

export interface Acceptance {
  user_id: string;
  name: string;
  role: string;
  /** The version they accepted, or null if they never have. */
  version: number | null;
  acknowledged_at: string | null;
}

export interface AcceptanceSummary {
  /** Active staff who have accepted the current version. */
  accepted: Acceptance[];
  /** Active staff who have not, or who accepted an older version. */
  outstanding: Acceptance[];
  total: number;
}

/**
 * Every active member of the organisation against one policy: who has
 * accepted the current version, and who has not.
 *
 * "Accepted an older version" counts as outstanding. A revision is a new
 * document as far as the reader is concerned, and the old acceptance stays on
 * the row as the truth about the old text — which is exactly why the version
 * is stored there rather than looked up.
 *
 * RLS scopes the acknowledgements: an org admin reads their own
 * organisation's, and the users read is the same org_admin_reads_org_users
 * the rest of the console relies on.
 */
export async function loadAcceptance(
  supabase: SupabaseClient,
  policyId: string,
  currentVersion: number,
  organisationId?: string | null,
  /** The organisation's copy: only acceptances of that copy count. */
  copyId?: string | null,
): Promise<AcceptanceSummary> {
  let staffQ = supabase
    .from("users")
    .select("id, full_name, email, role")
    .in("role", ["learner", "org_admin", "org_office"])
    .eq("status", "active");
  let acksQ = supabase
    .from("policy_acknowledgements")
    .select("user_id, version, acknowledged_at")
    .eq("policy_id", policyId);
  acksQ = copyId ? acksQ.eq("organisation_policy_id", copyId) : acksQ.is("organisation_policy_id", null);
  // (organisation_id, policy_id) is the acknowledgements' index.
  if (organisationId) {
    staffQ = staffQ.eq("organisation_id", organisationId);
    acksQ = acksQ.eq("organisation_id", organisationId);
  }
  const [{ data: staff }, { data: acks }] = await Promise.all([
    staffQ.order("full_name").limit(1000),
    acksQ.limit(1000),
  ]);

  // Latest acceptance per person: the highest version they have signed.
  const latest = new Map<string, { version: number; at: string }>();
  for (const a of acks ?? []) {
    const prev = latest.get(a.user_id as string);
    if (!prev || (a.version as number) > prev.version) {
      latest.set(a.user_id as string, {
        version: a.version as number,
        at: a.acknowledged_at as string,
      });
    }
  }

  const accepted: Acceptance[] = [];
  const outstanding: Acceptance[] = [];
  for (const u of staff ?? []) {
    const ack = latest.get(u.id as string);
    const row: Acceptance = {
      user_id: u.id as string,
      name: (u.full_name as string | null) ?? (u.email as string) ?? "Unnamed",
      role: u.role as string,
      version: ack?.version ?? null,
      acknowledged_at: ack?.at ?? null,
    };
    (ack && ack.version >= currentVersion ? accepted : outstanding).push(row);
  }

  return { accepted, outstanding, total: accepted.length + outstanding.length };
}

/**
 * Accepted-count per policy for a list of ids, for the list's "12 of 40".
 *
 * Read by organisation and paged. It used to send every policy id in the URL
 * with `.limit(5000)` — but the server caps a read at 1,000 rows whatever the
 * limit says, so past 1,000 acceptances (25 policies × 40 staff) the counts
 * quietly came up short. Acceptances for policies not on the list are skipped.
 */
export async function loadAcceptanceCounts(
  supabase: SupabaseClient,
  /** copyId: count acceptances of the organisation's copy, at its version. */
  policies: { id: string; version: number | null; copyId?: string | null }[],
  organisationId?: string | null,
): Promise<{ counts: Map<string, number>; staff: number }> {
  const counts = new Map<string, number>();
  if (policies.length === 0) return { counts, staff: 0 };

  let staffQ = supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .in("role", ["learner", "org_admin", "org_office"])
    .eq("status", "active");
  if (organisationId) staffQ = staffQ.eq("organisation_id", organisationId);

  const [{ count: staff }, acks] = await Promise.all([
    staffQ,
    fetchAll<{ policy_id: string; user_id: string; version: number; organisation_policy_id: string | null }>((from, to) => {
      let q = supabase.from("policy_acknowledgements").select("policy_id, user_id, version, organisation_policy_id");
      q = organisationId
        ? q.eq("organisation_id", organisationId)
        : q.in(
            "policy_id",
            policies.map((p) => p.id),
          );
      return q.order("id").range(from, to);
    }),
  ]);

  const currentOf = new Map(policies.map((p) => [p.id, p.version ?? 1]));
  const copyOf = new Map(policies.map((p) => [p.id, p.copyId ?? null]));
  const seen = new Set<string>();
  for (const a of acks) {
    const current = currentOf.get(a.policy_id);
    if (current === undefined) continue;
    // An acceptance counts only for the text it was given against: the
    // organisation's copy, or the template where there is no copy.
    if ((a.organisation_policy_id ?? null) !== copyOf.get(a.policy_id)) continue;
    const key = `${a.policy_id}|${a.user_id}`;
    if (seen.has(key)) continue;
    if (a.version >= current) {
      seen.add(key);
      counts.set(a.policy_id, (counts.get(a.policy_id) ?? 0) + 1);
    }
  }
  return { counts, staff: staff ?? 0 };
}

// ---------------------------------------------------------------------------
// The organisation's own copies (ROADMAP §1): adopted from a template,
// completed, and published to staff, who accept that version.
// ---------------------------------------------------------------------------

export interface OrgPolicyCopy {
  id: string;
  policy_id: string;
  status: "draft" | "published";
  /** 0 until first published. */
  version: number;
  template_version: number | null;
  published_at: string | null;
  /** What staff read; empty until first published. */
  blocks: PolicyBlock[];
  /** The manager's working copy, when there are changes not yet published. */
  draft_blocks: PolicyBlock[] | null;
}

const COPY_COLUMNS = "id, policy_id, status, version, template_version, published_at, blocks, draft_blocks";

function toCopy(r: Record<string, unknown>): OrgPolicyCopy {
  return {
    id: r.id as string,
    policy_id: r.policy_id as string,
    status: r.status as OrgPolicyCopy["status"],
    version: (r.version as number) ?? 0,
    template_version: (r.template_version as number | null) ?? null,
    published_at: (r.published_at as string | null) ?? null,
    blocks: (r.blocks as PolicyBlock[] | null) ?? [],
    draft_blocks: (r.draft_blocks as PolicyBlock[] | null) ?? null,
  };
}

/** Every copy this organisation has, by template id. RLS: staff see only published ones. */
export async function loadCopies(supabase: SupabaseClient, organisationId: string): Promise<Map<string, OrgPolicyCopy>> {
  const { data } = await supabase
    .from("organisation_policies")
    .select(COPY_COLUMNS)
    .eq("organisation_id", organisationId)
    .limit(500);
  return new Map((data ?? []).map((r) => [r.policy_id as string, toCopy(r)]));
}

export async function loadCopy(
  supabase: SupabaseClient,
  organisationId: string,
  policyId: string,
): Promise<OrgPolicyCopy | null> {
  const { data } = await supabase
    .from("organisation_policies")
    .select(COPY_COLUMNS)
    .eq("organisation_id", organisationId)
    .eq("policy_id", policyId)
    .maybeSingle();
  return data ? toCopy(data) : null;
}

/**
 * What is still to write before a copy can go to staff: every guidance block
 * left in, and every bracketed fill-in inside the text ("Version: [X.X]").
 * Publishing waits for zero — a carer accepting "[insert your arrangements]"
 * is accepting nothing.
 */
export function stillToWrite(blocks: PolicyBlock[]): { guidance: number; fillIns: number } {
  let guidance = 0;
  let fillIns = 0;
  for (const b of blocks) {
    if (b.type === "guidance") guidance++;
    else fillIns += (b.text.match(/\[[^\]]+\]/g) ?? []).length;
  }
  return { guidance, fillIns };
}

/** A block list as sent from the editor, kept to the shapes the renderer knows. */
export function cleanBlocks(raw: unknown): PolicyBlock[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PolicyBlock[] = [];
  for (const b of raw) {
    if (!b || typeof b !== "object") return null;
    const { type, text, level } = b as Record<string, unknown>;
    if (!["heading", "paragraph", "bullet", "guidance"].includes(String(type))) return null;
    const t = String(text ?? "").slice(0, 20000);
    if (!t.trim()) continue;
    out.push({ type: type as PolicyBlock["type"], text: t, ...(typeof level === "number" ? { level } : {}) });
  }
  return out.length > 2000 ? null : out;
}
