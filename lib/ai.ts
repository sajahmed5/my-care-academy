import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_MODEL, attemptCostUsd, attemptsFrom, chargeFor, formatGbp } from "@/lib/ai-cost";
import { trialState } from "@/lib/trial";

/**
 * Claude for a company (RECRUITMENT.md, "AI"): only when its manager has
 * switched AI on and it is under its monthly limit; every request recorded
 * against it with what it cost us and what it is charged (1.5 times). A
 * person always reads and edits what comes back — nothing here sends anything.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface AiStatus {
  /** ANTHROPIC_API_KEY is set on this deployment. */
  available: boolean;
  enabled: boolean;
  limitGbp: number | null;
  /** What the company has been charged this calendar month. */
  chargedGbp: number;
  allowed: boolean;
  reason?: string;
  /** On a free trial (TRIAL.md): AI is built in but can't be used. */
  trial: boolean;
}

function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Our own use of AI for a company — drafting its bespoke report in the
 * report builder (BESPOKE-REPORTS.md). Recorded against the company so we
 * can see what each costs us, charged at nothing, and left out of the
 * company's month: it never asked for it and doesn't see it.
 */
export const OUR_AI_FEATURE = "bespoke_report_builder";

export async function monthCharge(admin: Admin, orgId: string): Promise<{ chargedGbp: number; requests: number }> {
  const { data } = await admin
    .from("ai_usage")
    .select("charge_gbp")
    .eq("organisation_id", orgId)
    .neq("feature", OUR_AI_FEATURE)
    .gte("created_at", monthStartIso())
    .limit(5000);
  const rows = data ?? [];
  return { chargedGbp: rows.reduce((s, r) => s + Number(r.charge_gbp ?? 0), 0), requests: rows.length };
}

export async function aiStatus(admin: Admin, orgId: string): Promise<AiStatus> {
  const [{ data: settings }, { chargedGbp }, { data: org }] = await Promise.all([
    admin.from("organisation_ai_settings").select("enabled, monthly_limit_gbp").eq("organisation_id", orgId).maybeSingle(),
    monthCharge(admin, orgId),
    admin.from("organisations").select("trial_ends_at").eq("id", orgId).maybeSingle(),
  ]);
  const available = !!process.env.ANTHROPIC_API_KEY;
  const enabled = settings?.enabled === true;
  const limitGbp = settings?.monthly_limit_gbp == null ? null : Number(settings.monthly_limit_gbp);
  const trial = trialState((org?.trial_ends_at as string | null) ?? null).kind !== "none";
  const base = { available, enabled, limitGbp, chargedGbp, trial };
  // Billed at 1.5 times cost, so never on a free trial (TRIAL.md).
  if (trial) return { ...base, allowed: false, reason: "AI is built in, but it's unavailable during your free trial." };
  if (!available) return { ...base, allowed: false, reason: "AI drafting isn't available yet." };
  if (!enabled) return { ...base, allowed: false, reason: "AI is switched off for your company. A manager can switch it on under Account." };
  if (limitGbp != null && chargedGbp >= limitGbp) {
    return {
      ...base,
      allowed: false,
      reason: `Your company has reached its AI limit for this month (${formatGbp(chargedGbp)} of ${formatGbp(limitGbp)}). It starts again on the 1st.`,
    };
  }
  return { ...base, allowed: true };
}

/** What went wrong, in words an office can act on. */
function describeError(err: unknown): string {
  const e = err as { status?: number; message?: string };
  const text = (e?.message ?? "").toLowerCase();
  if (e?.status === 401) return "AI drafting isn't set up correctly. We've been told; write it yourself for now.";
  if (text.includes("credit balance") || text.includes("billing")) return "AI drafting is unavailable at the moment. Write it yourself for now.";
  if (e?.status === 429 || e?.status === 529 || text.includes("overloaded")) return "AI is busy right now. Try again in a minute.";
  return "The draft couldn't be written. Try again, or write it yourself.";
}

/**
 * One request for JSON in the given shape. Records the usage whatever the
 * outcome, once the API has answered.
 */
export async function askClaudeJson<T>(args: {
  orgId: string;
  userId: string | null;
  feature: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  /** Ours, not the company's (OUR_AI_FEATURE): no switch or limit of theirs applies, and nothing is charged. */
  ours?: boolean;
}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const admin = createAdminClient();
  if (args.ours) {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "AI isn't set up on this deployment." };
  } else {
    const status = await aiStatus(admin, args.orgId);
    if (!status.allowed) return { ok: false, error: status.reason ?? "AI isn't available." };
  }

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: args.maxTokens ?? 8000,
      // A declined request is re-run on Anthropic's recommended model,
      // inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { format: { type: "json_schema", schema: args.schema } },
      messages: [{ role: "user", content: args.prompt }],
    });
  } catch (err) {
    console.error("Claude request failed:", (err as { status?: number })?.status, (err as Error)?.message);
    return { ok: false, error: describeError(err) };
  }

  const attempts = attemptsFrom(AI_MODEL, response.usage as Parameters<typeof attemptsFrom>[1]);
  const costUsd = attempts.reduce((s, a) => s + attemptCostUsd(a), 0);
  const { costGbp, chargeGbp } = chargeFor(costUsd);
  const sum = (k: "input_tokens" | "output_tokens" | "cache_creation_input_tokens" | "cache_read_input_tokens") =>
    attempts.reduce((s, a) => s + (a[k] ?? 0), 0);
  const { error: usageError } = await admin.from("ai_usage").insert({
    organisation_id: args.orgId,
    feature: args.feature,
    model: response.model ?? AI_MODEL,
    input_tokens: sum("input_tokens"),
    output_tokens: sum("output_tokens"),
    cache_write_tokens: sum("cache_creation_input_tokens"),
    cache_read_tokens: sum("cache_read_input_tokens"),
    cost_usd: costUsd,
    cost_gbp: costGbp,
    charge_gbp: args.ours ? 0 : chargeGbp,
    user_id: args.userId,
  });
  if (usageError) console.error("AI usage not recorded:", usageError.message);

  if (response.stop_reason === "refusal") return { ok: false, error: "AI wouldn't draft this one. Write it yourself." };
  if (response.stop_reason === "max_tokens") return { ok: false, error: "The draft ran too long. Try again." };
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: "The draft came back unreadable. Try again." };
  }
}
