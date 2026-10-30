import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import Link from "next/link";
import { RecordSession } from "./record-session";
import { StartSignIn } from "./start-sign-in";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * Classroom and blended training (ROADMAP §4): sessions an organisation's own
 * trainer ran, with who attended. A session that covers a library course
 * completes it, with a certificate, for each attendee who passed the
 * practical, so it sits in the same matrix as the e-learning. Since 29 Oct
 * 2026 a session can be started on the day, with people signing in by QR code.
 */
export default async function ClassroomPage({ searchParams }: { searchParams: Promise<{ finished?: string }> }) {
  const context = await requireConsole();
  const { finished } = await searchParams;
  await requireFeature(context, "training.classroom");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [{ data: sessions }, { data: courses }, { data: staff }] = await Promise.all([
    supabase
      .from("classroom_sessions")
      .select("id, title, held_on, trainer_name, duration_minutes, location, finished_at, course:courses (title), attendance:classroom_attendance (user_id, certificate_id, practical_passed, person:users!classroom_attendance_user_id_fkey (full_name, email))")
      .eq("organisation_id", orgId)
      .order("held_on", { ascending: false })
      .limit(200),
    supabase.from("courses").select("id, title").is("retired_at", null).order("title"),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .in("role", ["learner", "org_admin", "org_office"])
      .order("full_name")
      .limit(1000),
  ]);

  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const open = (sessions ?? []).filter((s) => !s.finished_at);
  const done = (sessions ?? []).filter((s) => s.finished_at);
  const courseList = (courses ?? []).map((c) => ({ id: c.id as string, title: c.title as string }));

  return (
    <DashboardShell title="Classroom sessions" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Training your own trainers deliver face to face. Start a session and people sign in by scanning a QR code, or
          record one after the fact. Each person gets a practical result; if the session covers one of our courses,
          everyone who passed completes it and gets a certificate, so it shows in the matrix like any other.
        </p>
        {finished !== undefined && (
          <p className="text-sm text-teal-700">
            Session finished{Number(finished) > 0 ? ` — ${finished} certificate${finished === "1" ? "" : "s"} issued` : ""}.
          </p>
        )}
        <div className="flex flex-wrap items-start gap-3">
          <StartSignIn courses={courseList} />
          <RecordSession
            courses={courseList}
            staff={(staff ?? []).map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) }))}
          />
        </div>
        {open.length > 0 && (
          <Card>
            <CardContent className="space-y-2 pt-6">
              <p className="text-sm font-medium">Open for sign-in</p>
              <ul className="divide-y text-sm">
                {open.map((s) => (
                  <li key={s.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <Link href={`/org/classroom/${s.id}`} className="font-medium text-primary hover:underline">
                        {s.title as string}
                      </Link>
                      <span className="text-muted-foreground"> · {fmt(s.held_on as string)}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {((s.attendance as unknown[]) ?? []).length} signed in · not finished
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {done.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No sessions recorded yet.</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {done.map((s) => {
              const course = one(s.course as { title?: string } | { title?: string }[] | null);
              const attendance =
                (s.attendance as { user_id: string; certificate_id: string | null; practical_passed: boolean | null; person: unknown }[]) ?? [];
              return (
                <Card key={s.id as string}>
                  <CardContent className="space-y-2 pt-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{s.title as string}</p>
                      <span className="text-xs text-muted-foreground">{fmt(s.held_on as string)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[
                        s.trainer_name ? `Trainer: ${s.trainer_name}` : null,
                        s.duration_minutes ? `${s.duration_minutes} minutes` : null,
                        s.location as string | null,
                        course?.title ? `Covers ${course.title}` : "Not linked to a course",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <details>
                      <summary className="cursor-pointer text-sm">{attendance.length} attended</summary>
                      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                        {attendance.map((a) => {
                          const p = one(a.person as { full_name?: string | null; email?: string | null } | null);
                          return (
                            <li key={a.user_id}>
                              {p?.full_name || p?.email || "Someone no longer on the system"}
                              {a.practical_passed === false && <span className="ml-2 text-xs text-rose-700">practical not passed</span>}
                              {a.practical_passed === true && !a.certificate_id && (
                                <span className="ml-2 text-xs text-teal-700">practical passed</span>
                              )}
                              {a.certificate_id && <span className="ml-2 text-xs text-green-700">certificate issued</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
