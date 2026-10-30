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
import { DEFAULT_ACCEPT_DAYS, isAudience, type Audience } from "./policy-reading";

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
  /** This policy's own review period; null means the company's. */
  review_months: number | null;
  /** When the next review falls; set on every publish and every review. */
  review_due_on: string | null;
  /** Who must read it (POLICIES.md, "Who must read what"). */
  audience: Audience;
  /** Days to accept; null means the company's. */
  accept_within_days: number | null;
}

const COPY_COLUMNS =
  "id, policy_id, status, version, template_version, published_at, blocks, draft_blocks, review_months, review_due_on, audience, accept_within_days";

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
    review_months: (r.review_months as number | null) ?? null,
    review_due_on: (r.review_due_on as string | null) ?? null,
    audience: isAudience(r.audience) ? r.audience : "everyone",
    accept_within_days: (r.accept_within_days as number | null) ?? null,
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

// ---------------------------------------------------------------------------
// The company's own policy settings (POLICIES.md, under /org/settings/policies):
// how often its policies are reviewed, and its details, merged into a template
// when it is adopted.
// ---------------------------------------------------------------------------

export const DEFAULT_REVIEW_MONTHS = 12;
export const REVIEW_PERIODS = [6, 12, 24, 36] as const;

/**
 * The details a policy names, written once for the company. A template
 * carries {{registered_manager}} where the name goes; a company that has not
 * given it gets "[Registered manager]" there instead — a fill-in, so the copy
 * cannot be published until someone writes it.
 */
export const COMPANY_FIELDS = [
  { key: "registered_manager", label: "Registered manager", hint: "Their full name, as registered with the CQC." },
  { key: "nominated_individual", label: "Nominated individual", hint: "The person the CQC holds responsible for the service." },
  { key: "office_address", label: "Office address", hint: "Where staff, clients and inspectors write to." },
  { key: "office_phone", label: "Office phone", hint: "The number on your letters." },
  { key: "office_email", label: "Office email", hint: "Where complaints and concerns can be sent." },
  { key: "service_area", label: "Area you cover", hint: "For example: Stockport and south Manchester." },
  { key: "cqc_provider_id", label: "CQC provider ID", hint: "From your registration certificate, e.g. 1-123456789." },
] as const;

export type CompanyFieldKey = (typeof COMPANY_FIELDS)[number]["key"];

export interface PolicySettings {
  review_months: number;
  /** Days staff have to accept a policy (POLICIES.md, "Who must read what"). */
  accept_within_days: number;
  details: Partial<Record<CompanyFieldKey, string>>;
}

export async function loadPolicySettings(supabase: SupabaseClient, organisationId: string): Promise<PolicySettings> {
  const { data } = await supabase
    .from("organisation_policy_settings")
    .select(`review_months, accept_within_days, ${COMPANY_FIELDS.map((f) => f.key).join(", ")}`)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, unknown>;
  const details: PolicySettings["details"] = {};
  for (const f of COMPANY_FIELDS) {
    const v = String(row[f.key] ?? "").trim();
    if (v) details[f.key] = v;
  }
  return {
    review_months: (row.review_months as number | undefined) ?? DEFAULT_REVIEW_MONTHS,
    accept_within_days: (row.accept_within_days as number | undefined) ?? DEFAULT_ACCEPT_DAYS,
    details,
  };
}

/**
 * The company's name and details, into a template or a copy.
 *
 * {{tokens}} become the detail, or a [fill-in] naming it when the company has
 * not given it. A [fill-in] left from an earlier merge is filled when the
 * detail has been given since — so "Fill in your details" works on a copy
 * adopted before the settings were.
 */
export function mergeDetails(
  blocks: PolicyBlock[],
  organisationName: string,
  details: PolicySettings["details"],
): PolicyBlock[] {
  return render(blocks, organisationName).map((b) => {
    let text = b.text;
    for (const f of COMPANY_FIELDS) {
      const value = details[f.key];
      text = text.replaceAll(`{{${f.key}}}`, value ?? `[${f.label}]`);
      if (value) text = text.replaceAll(`[${f.label}]`, value);
    }
    return text === b.text ? b : { ...b, text };
  });
}

/** Today in the UK, as YYYY-MM-DD: a review date is a date, not a moment. */
export function ukToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}
