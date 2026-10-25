/**
 * The policies and documents an organisation can see, and what they read.
 *
 * Two different things share one table and must not share one screen. A
 * **policy** is read and accepted, and the acceptance is the evidence. A
 * **document** — a MAR chart, a spot check form, a complaints log — is
 * downloaded, printed and filled in. Mixing them teaches people to scroll past
 * both, so the library has a tab each.
 *
 * Everything here is a template: it carries {{organisation}} where the
 * provider's name goes, and guidance in square brackets that the provider is
 * meant to complete. Both survive to the screen — the name is substituted, the
 * guidance is shown as guidance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import type { FeatureKey } from "./features";

export type PolicyKind = "policy" | "form" | "log";
export type PolicyPack = "basic" | "full" | "addon";

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
  pack: PolicyPack;
  collection: string | null;
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
 * Which packs an organisation sees.
 *
 * The add-on packs follow the feature they belong to rather than the tier: an
 * organisation that bought the complaints register gets the complaints pack,
 * because the pack is the paper half of the same thing.
 */
export function visiblePacks(enabled: Record<string, boolean>): {
  packs: PolicyPack[];
  collections: string[];
} {
  const packs: PolicyPack[] = [];
  if (enabled["documents.library"]) packs.push("basic");
  if (enabled["documents.compliance_pack"]) packs.push("full");

  const collections: string[] = [];
  if (enabled["complaints.register"]) collections.push("Complaints and Safeguarding Pack");
  if (enabled["recruitment.tracker"]) collections.push("Recruitment Pack");
  if (collections.length) packs.push("addon");

  return { packs, collections };
}

/** The feature that unlocks a pack, for the "not in your plan" line. */
export const PACK_FEATURE: Record<string, FeatureKey> = {
  basic: "documents.library",
  full: "documents.compliance_pack",
};

export const PACK_LABEL: Record<PolicyPack, string> = {
  basic: "CQC basics",
  full: "Full compliance pack",
  addon: "Add-on pack",
};

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

/** Does this document apply to a homecare service, a care home, or both? */
function appliesTo(serviceTypes: string[] | null, orgServiceType: string | null): boolean {
  if (!serviceTypes || serviceTypes.length === 0) return true;
  // An organisation that has not said what it is sees everything rather than
  // nothing: a blank field must never look like an empty library.
  if (!orgServiceType || orgServiceType === "both") return true;
  return serviceTypes.includes(orgServiceType);
}

export async function loadLibrary(
  supabase: SupabaseClient,
  {
    enabled,
    serviceType,
    userId,
  }: {
    enabled: Record<string, boolean>;
    serviceType: string | null;
    userId: string;
  },
): Promise<PolicySummary[]> {
  const { packs, collections } = visiblePacks(enabled);
  if (packs.length === 0) return [];

  const [{ data: rows }, { data: acks }] = await Promise.all([
    supabase
      .from("policy_documents")
      .select("id, code, title, category, pack, collection, kind, service_types, version")
      .in("pack", packs)
      .order("category")
      .order("sort_order")
      .limit(500),
    supabase
      .from("policy_acknowledgements")
      .select("policy_id, version")
      .eq("user_id", userId),
  ]);

  const ackOf = new Map((acks ?? []).map((a) => [a.policy_id as string, a.version as number]));

  return (rows ?? [])
    .filter((r) => appliesTo(r.service_types as string[] | null, serviceType))
    // An add-on pack is only visible to whoever bought that add-on.
    .filter((r) => r.pack !== "addon" || collections.includes((r.collection as string) ?? ""))
    .map((r) => ({
      id: r.id as string,
      code: r.code as string,
      title: r.title as string,
      category: r.category as string,
      pack: r.pack as PolicyPack,
      collection: (r.collection as string | null) ?? null,
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
      .select(
        "id, code, title, category, pack, collection, kind, service_types, version, blocks",
      )
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
    pack: row.pack as PolicyPack,
    collection: (row.collection as string | null) ?? null,
    kind: row.kind as PolicyKind,
    service_types: (row.service_types as string[] | null) ?? null,
    version: (row.version as number | null) ?? null,
    blocks: (row.blocks as PolicyBlock[]) ?? [],
    acknowledgedVersion: (ack?.version as number | undefined) ?? null,
  };
}

/** Group a list for display, keeping the library's own order. */
export function byCategory(items: PolicySummary[]): [string, PolicySummary[]][] {
  const groups = new Map<string, PolicySummary[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  return [...groups.entries()];
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
