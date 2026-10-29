"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { attemptForToken, finaliseAttempt } from "@/lib/literacy-attempts";
import {
  LITERACY_MAX,
  LITERACY_MINUTES,
  LITERACY_QUESTIONS,
  acceptsAnswers,
  deadlineFor,
  hasRunOut,
  publicQuestions,
  sanitiseLiteracyAnswers,
  secondsLeft,
} from "@/lib/literacy-test";

/**
 * The candidate's side of the literacy test, brought across from MyRoster's
 * /api/recruit/literacy route. No account: the QR code or link is the key,
 * and it opens this one attempt and nothing else.
 *
 * The answer key never leaves the server — the page gets publicQuestions().
 * Nor does the score: the candidate is told they've finished; the result is
 * the office's to give. The clock is the server's: deadline_at is stamped
 * when they press Begin, answers are taken until then (plus a short grace),
 * and an attempt found past its deadline is marked on what was saved.
 */

const BAD_LINK = "This test link has expired or isn't valid any more. Ask the office for a new one.";

export type LiteracyReply =
  | { status: "bad"; error: string }
  | { status: "done"; company: string; firstName: string }
  | { status: "ready"; company: string; firstName: string; minutes: number; questionCount: number; marks: number }
  | { status: "running"; company: string; firstName: string; questions: ReturnType<typeof publicQuestions>; answers: Record<string, unknown>; secondsLeft: number }
  | { status: "saved"; secondsLeft: number };

export async function literacyAction(
  token: string,
  action: "load" | "begin" | "save" | "finish" | "left",
  rawAnswers?: unknown,
): Promise<LiteracyReply> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  // Autosave runs on every tap, so the limit is generous.
  if (!rateLimit(`literacy:${ip}`, 240, 5 * 60_000)) return { status: "bad", error: "Too many requests. Wait a moment and try again." };

  const admin = createAdminClient();
  const attempt = await attemptForToken(admin, token);
  if (!attempt) return { status: "bad", error: BAD_LINK };
  const candidate = attempt.candidates as unknown as { full_name: string; status: string } | null;
  const company = (attempt.organisations as unknown as { name: string } | null)?.name ?? "";
  const firstName = String(candidate?.full_name ?? "").trim().split(/\s+/)[0] || "";
  const now = Date.now();
  const timing = { status: attempt.status as string, started_at: attempt.started_at as string | null, deadline_at: attempt.deadline_at as string | null };
  const toFinalise = {
    id: attempt.id as string,
    organisation_id: attempt.organisation_id as string,
    candidate_id: attempt.candidate_id as string,
    answers: attempt.answers,
    mode: attempt.mode as string,
    attempt_no: attempt.attempt_no as number,
  };

  if (hasRunOut(timing, now)) {
    await finaliseAttempt(admin, toFinalise, "time");
    return { status: "done", company, firstName };
  }
  if (attempt.status === "submitted") return { status: "done", company, firstName };
  if (attempt.status === "cancelled" || candidate?.status !== "candidate") return { status: "bad", error: BAD_LINK };
  const fresh = !!attempt.token_expires_at && Date.parse(attempt.token_expires_at as string) > now;
  const running = (a: typeof timing, answers: unknown): LiteracyReply => ({
    status: "running", company, firstName, questions: publicQuestions(), answers: (answers ?? {}) as Record<string, unknown>, secondsLeft: secondsLeft(a, Date.now()),
  });

  if (action === "load") {
    if (attempt.status === "in_progress") return running(timing, attempt.answers);
    if (!fresh) return { status: "bad", error: BAD_LINK };
    return { status: "ready", company, firstName, minutes: LITERACY_MINUTES, questionCount: LITERACY_QUESTIONS.length, marks: LITERACY_MAX };
  }

  if (action === "begin") {
    if (attempt.status === "in_progress") return running(timing, attempt.answers);
    if (!fresh) return { status: "bad", error: BAD_LINK };
    const startedAt = new Date(now).toISOString();
    const { data: begun } = await admin
      .from("literacy_attempts")
      .update({ status: "in_progress", started_at: startedAt, deadline_at: deadlineFor(now) })
      .eq("id", attempt.id as string)
      .eq("status", "unlocked")
      .select("status, started_at, deadline_at, answers")
      .maybeSingle();
    // Lost a race with another tab: the clock that tab started is the clock.
    const a = begun ?? (await admin.from("literacy_attempts").select("status, started_at, deadline_at, answers").eq("id", attempt.id as string).maybeSingle()).data;
    if (!a || a.status !== "in_progress") return { status: "bad", error: BAD_LINK };
    return running({ status: a.status as string, started_at: a.started_at as string, deadline_at: a.deadline_at as string }, a.answers);
  }

  if (attempt.status !== "in_progress") return { status: "bad", error: "The test hasn't been started." };

  if (action === "left") {
    await admin
      .from("literacy_attempts")
      .update({ left_page_count: ((attempt.left_page_count as number) ?? 0) + 1 })
      .eq("id", attempt.id as string)
      .eq("status", "in_progress");
    return { status: "saved", secondsLeft: secondsLeft(timing, Date.now()) };
  }

  if (acceptsAnswers(timing, now)) {
    const answers = sanitiseLiteracyAnswers(rawAnswers);
    const { data: saved } = await admin
      .from("literacy_attempts")
      .update({ answers })
      .eq("id", attempt.id as string)
      .eq("status", "in_progress")
      .select("id");
    if (saved?.length) toFinalise.answers = answers;
  }
  if (action === "save") return { status: "saved", secondsLeft: secondsLeft(timing, Date.now()) };
  await finaliseAttempt(admin, toFinalise, "candidate");
  return { status: "done", company, firstName };
}
