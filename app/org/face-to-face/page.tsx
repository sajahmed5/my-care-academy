import Link from "next/link";
import { MapPin } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OFFICE_ADDRESS, canCancelBooking, sessionTitle, sessionWhen } from "@/lib/face-to-face";
import { BookSession } from "./book-session";
import { CancelBooking } from "./cancel-booking";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

interface Session {
  id: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  trainer_name: string | null;
  places: number;
  notes: string | null;
  course: unknown;
}

interface Booking {
  id: string;
  session_id: string;
  user_id: string;
  status: string;
  practical_passed: boolean | null;
  certificate_id: string | null;
  person: unknown;
}

/** How one person's place stands, once the register is taken. */
function resultLabel(b: { status: string; practical_passed: boolean | null; certificate_id: string | null }): string {
  if (b.status === "cancelled") return "Cancelled";
  if (b.status === "no_show") return "Didn't come";
  if (b.status !== "attended") return "Booked";
  if (b.practical_passed === false) return "Came, practical not passed: book them again";
  return b.certificate_id ? "Came and passed, certificate issued" : "Came and passed";
}

/**
 * Face-to-face training at our office (FACE-TO-FACE.md, 29 Oct 2026): the
 * sessions coming up, booking named staff onto them, and the company's own
 * bookings. Included in Enterprise, with no limit on places beyond each
 * session's own.
 */
export default async function FaceToFaceBookingPage() {
  const context = await requireConsole();
  await requireFeature(context, "training.face_to_face");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const today = new Date();
  const now = today.toISOString();
  const since = new Date(today.getTime() - 180 * 86400_000).toISOString();

  const [{ data: sessions }, { data: taken }, { data: bookings }, { data: staff }] = await Promise.all([
    supabase
      .from("face_to_face_sessions")
      .select("id, kind, starts_at, ends_at, trainer_name, places, notes, course:courses (title)")
      .is("cancelled_at", null)
      .gt("starts_at", now)
      .order("starts_at")
      .limit(300),
    supabase.rpc("face_to_face_places_taken", { p_from: now }),
    supabase
      .from("face_to_face_bookings")
      .select(
        "id, session_id, user_id, status, practical_passed, certificate_id, person:users!face_to_face_bookings_user_id_fkey (full_name, email), session:face_to_face_sessions (id, kind, starts_at, ends_at, trainer_name, places, notes, cancelled_at, course:courses (title))",
      )
      .eq("organisation_id", orgId)
      .order("created_at")
      .limit(2000),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .in("role", ["learner", "org_admin", "org_office"])
      .order("full_name")
      .limit(1000),
  ]);

  const takenBy = new Map(((taken ?? []) as { session_id: string; taken: number }[]).map((t) => [t.session_id, t.taken]));
  const staffList = (staff ?? []).map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) }));
  const nameOf = (b: Booking) => {
    const p = one(b.person as { full_name: string | null; email: string | null } | null);
    return p?.full_name || p?.email || "Someone no longer on the system";
  };

  // The company's bookings, grouped by session: those still to come, and
  // the last six months' worth gone by.
  const bySession = new Map<string, { session: Session & { cancelled_at: string | null }; rows: Booking[] }>();
  for (const b of (bookings ?? []) as (Booking & { session: unknown })[]) {
    const s = one(b.session as (Session & { cancelled_at: string | null }) | null);
    if (!s) continue;
    const entry = bySession.get(s.id) ?? { session: s, rows: [] };
    entry.rows.push(b);
    bySession.set(s.id, entry);
  }
  const groups = [...bySession.values()].sort((a, b) => a.session.starts_at.localeCompare(b.session.starts_at));
  const upcomingMine = groups.filter((g) => g.session.starts_at > now && !g.session.cancelled_at && g.rows.some((r) => r.status === "booked"));
  const pastMine = groups
    .filter((g) => (g.session.starts_at <= now || g.session.cancelled_at) && g.session.starts_at >= since)
    .reverse();
  const bookedOn = (sessionId: string) =>
    new Set((bySession.get(sessionId)?.rows ?? []).filter((r) => r.status !== "cancelled").map((r) => r.user_id));

  return (
    <DashboardShell title="Face-to-face training" context={context}>
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Training sessions run by our trainers, included in your package with no limit on places. Book named staff
            onto a session; each person gets a confirmation email and a reminder the day before. Online and face to face
            are separate, so nobody needs to finish the online course first.
          </p>
          <div className="flex items-start gap-3 rounded-xl border bg-accent/40 p-4 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p>
              Sessions are at our training office in Stockport: <strong>{OFFICE_ADDRESS}</strong>. Need training
              somewhere else, or a course that isn&apos;t listed?{" "}
              <Link href="/contact?topic=face-to-face" className="font-medium text-primary underline-offset-4 hover:underline">
                Ask us
              </Link>
              .
            </p>
          </div>
        </div>

        {upcomingMine.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Your bookings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {upcomingMine.map(({ session: s, rows }) => (
                <div key={s.id} className="space-y-2">
                  <div>
                    <p className="font-medium">{sessionTitle(s.kind, one(s.course as { title: string } | null)?.title)}</p>
                    <p className="text-xs text-muted-foreground">{sessionWhen(s.starts_at, s.ends_at)}</p>
                  </div>
                  <ul className="divide-y rounded-lg border text-sm">
                    {rows
                      .filter((r) => r.status === "booked")
                      .map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <span>{nameOf(r)}</span>
                          {canCancelBooking(s.starts_at) ? (
                            <CancelBooking id={r.id} name={nameOf(r)} />
                          ) : (
                            <span className="text-xs text-muted-foreground">Under 48 hours to go: can&apos;t be cancelled</span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Cancel a place up to 48 hours before. After that, someone who doesn&apos;t come is recorded as a no-show.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Sessions coming up</CardTitle>
          </CardHeader>
          <CardContent>
            {(sessions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sessions are open for booking just now.{" "}
                <Link href="/contact?topic=face-to-face" className="text-primary underline-offset-4 hover:underline">
                  Ask us
                </Link>{" "}
                what&apos;s coming.
              </p>
            ) : (
              <ul className="divide-y">
                {((sessions ?? []) as Session[]).map((s) => {
                  const left = Math.max(0, s.places - (takenBy.get(s.id) ?? 0));
                  const mine = bookedOn(s.id);
                  return (
                    <li key={s.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <p className="font-medium">{sessionTitle(s.kind, one(s.course as { title: string } | null)?.title)}</p>
                          <p className="text-xs text-muted-foreground">
                            {[sessionWhen(s.starts_at, s.ends_at), s.trainer_name ? `Trainer: ${s.trainer_name}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {s.notes && <p className="mt-1 text-xs text-muted-foreground">{s.notes}</p>}
                        </div>
                        <span className={left === 0 ? "text-xs font-medium text-rose-700" : "text-xs text-muted-foreground"}>
                          {left === 0 ? "Full" : `${left} place${left === 1 ? "" : "s"} left`}
                          {mine.size > 0 && ` · ${mine.size} of yours booked`}
                        </span>
                      </div>
                      {left > 0 && (
                        <BookSession
                          sessionId={s.id}
                          left={left}
                          staff={staffList.filter((p) => !mine.has(p.id))}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {pastMine.length > 0 && (
          <details className="rounded-xl border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">Past and cancelled sessions</summary>
            <div className="mt-3 space-y-4">
              {pastMine.map(({ session: s, rows }) => (
                <div key={s.id} className="space-y-1">
                  <p className="text-sm font-medium">
                    {sessionTitle(s.kind, one(s.course as { title: string } | null)?.title)}
                    {s.cancelled_at && <span className="ml-2 text-xs font-normal text-rose-700">cancelled by us</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{sessionWhen(s.starts_at, s.ends_at)}</p>
                  <ul className="grid gap-1 text-sm sm:grid-cols-2">
                    {rows.map((r) => (
                      <li key={r.id}>
                        {nameOf(r)} <span className="text-xs text-muted-foreground">— {resultLabel(r)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </DashboardShell>
  );
}
