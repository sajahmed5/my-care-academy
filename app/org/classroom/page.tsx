import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { RecordSession } from "./record-session";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * Classroom and blended training (ROADMAP §4): sessions an organisation's own
 * trainer ran, with who attended. A session that covers a library course
 * completes it for each attendee, with a certificate, so it sits in the same
 * matrix as the e-learning.
 */
export default async function ClassroomPage() {
  const context = await requireConsole();
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [{ data: sessions }, { data: courses }, { data: staff }] = await Promise.all([
    supabase
      .from("classroom_sessions")
      .select("id, title, held_on, trainer_name, duration_minutes, location, course:courses (title), attendance:classroom_attendance (user_id, certificate_id, person:users!classroom_attendance_user_id_fkey (full_name, email))")
      .eq("organisation_id", orgId)
      .order("held_on", { ascending: false })
      .limit(200),
    supabase.from("courses").select("id, title").order("title"),
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

  return (
    <DashboardShell title="Classroom sessions" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Training your own trainers deliver face to face. Record each session and who attended; if it covers one of our
          courses, everyone who attended completes it and gets a certificate, so it shows in the matrix like any other.
        </p>
        <RecordSession
          courses={(courses ?? []).map((c) => ({ id: c.id as string, title: c.title as string }))}
          staff={(staff ?? []).map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) }))}
        />
        {(sessions ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No sessions recorded yet.</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(sessions ?? []).map((s) => {
              const course = one(s.course as { title?: string } | { title?: string }[] | null);
              const attendance = (s.attendance as { user_id: string; certificate_id: string | null; person: unknown }[]) ?? [];
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
