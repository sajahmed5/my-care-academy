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
): Promise<AcceptanceSummary> {
  const [{ data: staff }, { data: acks }] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, email, role, status")
      .in("role", ["learner", "org_admin"])
      .eq("status", "active")
      .order("full_name")
      .limit(1000),
    supabase
      .from("policy_acknowledgements")
      .select("user_id, version, acknowledged_at")
      .eq("policy_id", policyId),
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

/** Accepted-count per policy for a list of ids, for the list's "12 of 40". */
export async function loadAcceptanceCounts(
  supabase: SupabaseClient,
  policies: { id: string; version: number | null }[],
): Promise<{ counts: Map<string, number>; staff: number }> {
  const counts = new Map<string, number>();
  if (policies.length === 0) return { counts, staff: 0 };

  const [{ count: staff }, { data: acks }] = await Promise.all([
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .in("role", ["learner", "org_admin"])
      .eq("status", "active"),
    supabase
      .from("policy_acknowledgements")
      .select("policy_id, user_id, version")
      .in(
        "policy_id",
        policies.map((p) => p.id),
      )
      .limit(5000),
  ]);

  const currentOf = new Map(policies.map((p) => [p.id, p.version ?? 1]));
  const seen = new Set<string>();
  for (const a of acks ?? []) {
    const key = `${a.policy_id}|${a.user_id}`;
    if (seen.has(key)) continue;
    if ((a.version as number) >= (currentOf.get(a.policy_id as string) ?? 1)) {
      seen.add(key);
      counts.set(a.policy_id as string, (counts.get(a.policy_id as string) ?? 0) + 1);
    }
  }
  return { counts, staff: staff ?? 0 };
}
