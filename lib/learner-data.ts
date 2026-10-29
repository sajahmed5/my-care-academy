import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Certificate, Enrolment } from "@/lib/learner-stats";
import { computeStarTotal } from "@/lib/stars";
import type { BookingInput } from "@/lib/notifications";

interface JoinedCourse {
  title?: string;
  slug?: string;
  topics?: { title?: string } | null;
}

function pickCourse(row: { courses?: unknown }): JoinedCourse {
  return (row.courses as JoinedCourse) ?? {};
}

/*
 * The learner's own rows, read once per request.
 *
 * React `cache` memoises per render pass, so the shell (badge, star bank) and
 * the page share one read instead of each running their own. Every read also
 * filters by user_id explicitly: RLS would scope it anyway, but without the
 * filter Postgres scans the whole table and runs the policy on every row; with
 * it, it walks the user_id index. RLS stays the security layer.
 */

/** Every enrolment, newest-assigned first. */
export const loadEnrolments = cache(
  async (userId: string): Promise<Enrolment[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("enrolments")
      .select(
        "id, course_id, status, progress, due_date, assigned_at, attempt_count, completion_count, courses(title, slug, topics(title))",
      )
      .eq("user_id", userId)
      .order("assigned_at", { ascending: false });
    return (data ?? []).map((e) => {
      const c = pickCourse(e);
      return {
        id: e.id,
        course_id: e.course_id,
        status: e.status,
        progress: e.progress,
        due_date: e.due_date,
        assigned_at: e.assigned_at,
        attempt_count: e.attempt_count ?? 0,
        completion_count: e.completion_count ?? 0,
        title: c.title ?? "Course",
        topic: c.topics?.title ?? null,
        slug: c.slug ?? null,
      };
    });
  },
);

/** Every certificate, newest-issued first. */
export const loadCertificates = cache(
  async (userId: string): Promise<Certificate[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("certificates")
      .select(
        "id, course_id, certificate_number, issued_at, expires_at, courses(title, topics(title))",
      )
      .eq("user_id", userId)
      .order("issued_at", { ascending: false });
    return (data ?? []).map((c) => {
      const co = pickCourse(c);
      return {
        id: c.id,
        course_id: c.course_id,
        number: c.certificate_number,
        issued_at: c.issued_at,
        expires_at: c.expires_at,
        title: co.title ?? "Course",
        topic: co.topics?.title ?? null,
      };
    });
  },
);

export interface LearnerProfile {
  fullName: string | null;
  email: string | null;
  readAt: string | null;
}

/** The learner's own users row — an id lookup, not an RLS scan. */
export const loadProfile = cache(
  async (userId: string): Promise<LearnerProfile> => {
    const supabase = await createClient();
    const { data: me } = await supabase
      .from("users")
      .select("full_name, email, notifications_read_at")
      .eq("id", userId)
      .maybeSingle();
    return {
      fullName: me?.full_name ?? null,
      email: me?.email ?? null,
      readAt: me?.notifications_read_at ?? null,
    };
  },
);

/**
 * Days with activity, for the dashboard streak: submitted assessments (the
 * latest 300 — far more than any streak needs) plus certificate issue dates.
 * Only the dashboard shows a streak, so only the dashboard pays for this.
 */
export async function loadActivityDates(userId: string): Promise<Date[]> {
  const supabase = await createClient();
  const [{ data: attempts }, certificates] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("submitted_at")
      .eq("user_id", userId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(300),
    loadCertificates(userId),
  ]);
  return [
    ...(attempts ?? []).map((a) => new Date(a.submitted_at)),
    ...certificates.map((c) => new Date(c.issued_at)),
  ];
}

/**
 * The learner's star-bank total: assessment stars (best per course, capped at
 * 20, derived from quiz_attempts) plus in-content stars (one row per earned
 * question in content_question_stars). Runs on every learner page via the
 * shell, so it reads only what the maths needs: no zero-score attempts (they
 * can never be a best), and the certificate expiries come from the shared
 * per-request certificate read. Resilient — any error yields 0 rather than
 * breaking the shell.
 */
export async function loadStarTotal(userId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const [{ data: attempts }, certs, { count }] = await Promise.all([
      supabase
        .from("quiz_attempts")
        .select("course_id, score, question_ids, submitted_at")
        .eq("user_id", userId)
        .not("submitted_at", "is", null)
        .gt("score", 0),
      // Certificate expiries bound the compliance cycles; a renewal after expiry
      // earns a fresh pool of assessment stars.
      loadCertificates(userId),
      supabase
        .from("content_question_stars")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);
    const assessmentStars = computeStarTotal(attempts ?? [], certs);
    return assessmentStars + (count ?? 0);
  } catch {
    return 0;
  }
}

/** Minimal shapes the notifications badge needs (see lib/notifications.ts). */
export interface BadgeData {
  enrolments: { course_id: string; status: string; assigned_at: string; title: string }[];
  certificates: {
    id: string;
    course_id: string;
    issued_at: string;
    expires_at: string | null;
    title: string;
  }[];
  readAt: string | null;
  /** Booked supervisions and appraisals (STAFF-AUDITS.md). */
  bookings: BookingInput[];
}

/**
 * Their booked supervisions and appraisals still to come. Empty without
 * Staff Audits: the own-read policy checks the feature, so nothing comes back.
 * Bookings made, not the record — a carer never reads a supervision.
 */
export const loadMyBookings = cache(async (userId: string): Promise<BookingInput[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_audit_bookings")
    .select("id, kind, booked_on, booked_time, created_at")
    .eq("user_id", userId)
    .eq("status", "booked")
    .gte("booked_on", new Date().toISOString().slice(0, 10))
    .limit(10);
  return (data ?? []).map((b) => ({
    id: b.id as string,
    kind: b.kind as string,
    booked_on: b.booked_on as string,
    booked_time: (b.booked_time as string | null) ?? null,
    created_at: b.created_at as string,
  }));
});

/**
 * The menu's unread-notifications badge, and the notifications page. Runs on
 * EVERY learner page (via DashboardShell), built from the shared per-request
 * reads so a page that also lists enrolments or certificates costs nothing
 * extra.
 */
export async function loadBadgeData(userId: string): Promise<BadgeData> {
  const [enrolments, certificates, me, bookings] = await Promise.all([
    loadEnrolments(userId),
    loadCertificates(userId),
    loadProfile(userId),
    loadMyBookings(userId),
  ]);
  return { enrolments, certificates, readAt: me.readAt, bookings };
}

export { learnerStats, type Certificate, type Enrolment, type LearnerStats } from "@/lib/learner-stats";
