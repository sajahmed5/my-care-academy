/**
 * What a Claude request costs us, and what the company is charged for it
 * (RECRUITMENT.md, "AI"). Brought across from MyRoster's aiGovernance.ts, with
 * Saj's rule of 29 Oct 2026: the company pays 1.5 times our cost.
 *
 * Pure, so the sums are tested on their own.
 */

export const AI_MODEL = "claude-opus-5-5";

/** US dollars per million tokens. An unknown model is priced at the dearest we use. */
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
};
const DEAREST = { input: 5, output: 25 };
export const CACHE_READ_MULT = 0.05; // $0.20 against $4 on Opus 5.5
export const CACHE_WRITE_MULT = 1.25;

/** Our dollars to pounds, kept on the cautious side. */
export const USD_TO_GBP = 0.8;
/** The company pays 1.5 times what the AI costs us. */
export const AI_MARKUP = 1.5;

export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** One attempt: the model that ran it and what it used. */
export interface Attempt extends TokenUsage {
  model: string;
}

export function attemptCostUsd(a: Attempt): number {
  const rate = PRICING[a.model] ?? DEAREST;
  return (
    ((a.input_tokens ?? 0) * rate.input +
      (a.output_tokens ?? 0) * rate.output +
      (a.cache_creation_input_tokens ?? 0) * rate.input * CACHE_WRITE_MULT +
      (a.cache_read_input_tokens ?? 0) * rate.input * CACHE_READ_MULT) /
    1_000_000
  );
}

/**
 * Every attempt in a response. With server-side fallbacks, usage.iterations
 * is the record of each attempt (a declined one included); a fallback entry
 * names its own model, the rest ran on the model we asked for. Without
 * iterations, the top-level usage is the whole of it.
 */
export function attemptsFrom(
  requested: string,
  usage: (TokenUsage & { iterations?: Array<TokenUsage & { type?: string; model?: string }> | null }) | null | undefined,
): Attempt[] {
  const its = usage?.iterations;
  if (its?.length) {
    return its
      .filter((i) => i.type === "message" || i.type === "fallback_message")
      .map((i) => ({ ...i, model: i.type === "fallback_message" && i.model ? i.model : requested }));
  }
  return [{ ...(usage ?? {}), model: requested }];
}

export function chargeFor(costUsd: number): { costGbp: number; chargeGbp: number } {
  const costGbp = costUsd * USD_TO_GBP;
  return { costGbp, chargeGbp: costGbp * AI_MARKUP };
}

/** Pounds for people: at least a penny once anything is spent. */
export function formatGbp(v: number): string {
  if (v > 0 && v < 0.01) return "under 1p";
  return `£${v.toFixed(2)}`;
}
