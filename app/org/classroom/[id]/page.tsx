import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { SignInCode } from "./sign-in-code";
import { FinishSession } from "./finish-session";

// Finishing issues a certificate PDF for each person who passed.
export const maxDuration = 120;

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * A classroom session people are signing in to (29 Oct 2026): the QR code on
 * the trainer's screen, who has signed in, each person's practical result,
 * and Finish. A finished session lives on the list, not here.
 */
export default async function ClassroomSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "training.classroom");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: s }, { data: attendance }, { data: staff }] = await Promise.all([
    supabase
      .from("classroom_sessions")
      .select("id, title, held_on, trainer_name, duration_minutes, location, finished_at, course:courses (title)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("classroom_attendance")
      .select("user_id, signed_in_at, created_at, person:users!classroom_attendance_user_id_fkey (full_name, email)")
      .eq("session_id", id)
      .order("created_at"),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organisation_id", context.organisationId!)
      .eq("status", "active")
      .in("role", ["learner", "org_admin", "org_office"])
      .order("full_name")
      .limit(1000),
  ]);
  if (!s) notFound();
  if (s.finished_at) redirect("/org/classroom");

  const course = one(s.course as unknown as { title: string } | null);
  const attendees = (attendance ?? []).map((a) => {
    const p = one(a.person as unknown as { full_name: string | null; email: string | null } | null);
    return { id: a.user_id as string, name: p?.full_name || p?.email || "Someone no longer on the system", scanned: !!a.signed_in_at };
  });
  const inIt = new Set(attendees.map((a) => a.id));
  const others = (staff ?? [])
    .filter((u) => !inIt.has(u.id as string))
    .map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) }));

  return (
    <DashboardShell title={s.title as string} context={context}>
      <div className="space-y-6">
        <Link href="/org/classroom" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Classroom sessions
        </Link>
        <p className="text-sm text-muted-foreground">
          {[
            formatDate(s.held_on as string, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
            s.trainer_name ? `Trainer: ${s.trainer_name}` : null,
            s.duration_minutes ? `${s.duration_minutes} minutes` : null,
            s.location as string | null,
            course?.title ? `Covers ${course.title}` : "Not linked to a course",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <SignInCode sessionId={s.id as string} />
        <Card>
          <CardHeader>
            <CardTitle>Signed in ({attendees.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <FinishSession sessionId={s.id as string} attendees={attendees} others={others} course={!!course} />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
