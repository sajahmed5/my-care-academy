import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  LITERACY_MAX,
  LITERACY_QUESTIONS,
  acceptsAnswers,
  hasRunOut,
  markLiteracy,
  publicQuestions,
  sanitiseLiteracyAnswers,
} from "../lib/literacy-test";

/** Every answer right, as the candidate's page would send it. */
function perfect() {
  const out: Record<string, string | string[]> = {};
  for (const q of LITERACY_QUESTIONS) {
    if (q.type === "choice") out[q.id] = q.answer;
    else if (q.type === "tapWords") out[q.id] = q.wrong;
    else if (q.type === "spell") out[q.id] = q.words.map((w) => w.accept[0]);
    else out[q.id] = q.answer;
  }
  return out;
}

describe("the literacy test", () => {
  it("is 20 marks, and full marks pass", () => {
    expect(LITERACY_MAX).toBe(20);
    expect(markLiteracy(sanitiseLiteracyAnswers(perfect()))).toMatchObject({ score: 20, percent: 100, passed: true });
  });

  it("fails below 80%, and blank answers score nothing", () => {
    expect(markLiteracy({})).toMatchObject({ score: 0, passed: false });
    const five = Object.fromEntries(Object.entries(perfect()).slice(0, 5));
    expect(markLiteracy(sanitiseLiteracyAnswers(five)).passed).toBe(false);
  });

  it("doesn't reward tapping every word", () => {
    const q = LITERACY_QUESTIONS.find((x) => x.type === "tapWords")!;
    const all = q.type === "tapWords" ? q.text.split(/\s+/).map((t) => t.replace(/[.,!?;:"“”]/g, "")) : [];
    const r = markLiteracy(sanitiseLiteracyAnswers({ [q.id]: all }));
    expect(r.questions.find((m) => m.id === q.id)?.awarded).toBe(0);
  });

  it("sends the browser no answers", () => {
    const text = JSON.stringify(publicQuestions());
    for (const q of LITERACY_QUESTIONS) {
      if (q.type === "spell") for (const w of q.words) expect(text).not.toContain(`"${w.accept[0]}"`);
    }
    expect(text).not.toContain('"answer"');
    expect(text).not.toContain('"wrong"');
  });

  it("is never imported by browser code", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(name)) {
          const src = readFileSync(p, "utf8");
          if (/^["']use client["']/m.test(src) && /from\s+["'][^"']*lib\/literacy-test["']/.test(src)) offenders.push(p);
        }
      }
    };
    for (const d of ["app", "components", "lib"]) walk(d);
    expect(offenders).toEqual([]);
  });

  it("takes answers until the deadline and a short grace, then runs out", () => {
    const deadline = Date.parse("2026-10-29T10:20:00Z");
    const a = { status: "in_progress", started_at: "2026-10-29T10:00:00Z", deadline_at: new Date(deadline).toISOString() };
    expect(acceptsAnswers(a, deadline + 10_000)).toBe(true);
    expect(acceptsAnswers(a, deadline + 60_000)).toBe(false);
    expect(hasRunOut(a, deadline + 60_000)).toBe(true);
  });
});
