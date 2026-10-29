import { describe, expect, it } from "vitest";
import { AI_MARKUP, attemptCostUsd, attemptsFrom, chargeFor, formatGbp } from "../lib/ai-cost";

describe("AI cost", () => {
  it("prices Opus 5.5 at $4 in and $20 out per million tokens", () => {
    expect(attemptCostUsd({ model: "claude-opus-5-5", input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(24);
    expect(attemptCostUsd({ model: "claude-opus-5-5", cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2);
    expect(attemptCostUsd({ model: "claude-opus-5-5", cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(5);
  });
  it("prices a model it doesn't know at the dearest rate, never free", () => {
    expect(attemptCostUsd({ model: "something-new", input_tokens: 1_000_000 })).toBeCloseTo(5);
  });
  it("counts every attempt when a fallback served the reply", () => {
    const attempts = attemptsFrom("claude-opus-5-5", {
      input_tokens: 10,
      output_tokens: 10,
      iterations: [
        { type: "message", input_tokens: 1000, output_tokens: 0 },
        { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 1000, output_tokens: 500 },
      ],
    });
    expect(attempts.map((a) => a.model)).toEqual(["claude-opus-5-5", "claude-opus-4-8"]);
  });
  it("uses the top-level usage when there are no iterations", () => {
    expect(attemptsFrom("claude-opus-5-5", { input_tokens: 5 })).toEqual([{ input_tokens: 5, model: "claude-opus-5-5" }]);
  });
  it("charges the company 1.5 times our cost, in pounds", () => {
    expect(AI_MARKUP).toBe(1.5);
    const { costGbp, chargeGbp } = chargeFor(1);
    expect(chargeGbp).toBeCloseTo(costGbp * 1.5);
    expect(formatGbp(0.004)).toBe("under 1p");
    expect(formatGbp(1.5)).toBe("£1.50");
  });
});
