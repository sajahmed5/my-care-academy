import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sessionTitle, sessionWhen, ukDay, ukTime } from "@/lib/face-to-face";
import { formatDateTime } from "@/lib/dates";
import { SessionForm } from "../session-form";
import { CancelSession } from "./cancel-session";
import { RemoveBooking } from "./remove-booking";

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked",
  attended: "Attended",
  no_show: "Didn't come",
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** One session: its details, to change or cancel. */
export default async function FaceToFaceSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireRole("platform_admin");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: s }, { data: courses }, { data: closed }, { data: bookings }] = await Promise.all([
    supabase
      .from("face_to_face_sessions")
      .select("id, kind, course_id, starts_at, ends_at, trainer_name, places, location, notes, cancelled_at, course:courses (title)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("courses").select("id, title").order("title"),
    supabase.from("face_to_face_closed_days").select("day, reason").gte("day", ukDay(new Date())),
    supabase
      .from("face_to_face_bookings")
      .select(
        "id, status, created_at, person:users!face_to_face_bookings_user_id_fkey (full_name, email), booker:users!face_to_face_bookings_booked_by_fkey (full_name, email), org:organisations (name)",
      )
      .eq("session_id", id)
      .neq("status", "cancelled")
      .order("created_at"),
  ]);
  if (!s) notFound();

  const title = sessionTitle(s.kind as string, one(s.course as { title: string } | { title: string }[] | null)?.title);
  const ended = new Date(s.ends_at as string) < new Date();

  return (
    <DashboardShell title={title} context={context}>
      <div className="space-y-6">
        <Link href="/platform/face-to-face" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          All sessions
        </Link>
        <div className="space-y-1">
          <p className="font-medium">{sessionWhen(s.starts_at as string, s.ends_at as string)}</p>
          <p className="text-sm text-muted-foreground">
            {[s.trainer_name ? `Trainer: ${s.trainer_name}` : "No trainer named yet", `${s.places} places`, s.location as string].join(" · ")}
          </p>
          {s.cancelled_at && (
            <p className="text-sm text-rose-700">Cancelled {formatDateTime(s.cancelled_at as string)}.</p>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              Who&apos;s booked ({(bookings ?? []).length} of {s.places as number})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(bookings ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Name</th>
                      <th className="py-2 pr-3 font-medium">Company</th>
                      <th className="py-2 pr-3 font-medium">Booked by</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(bookings ?? []).map((b) => {
                      const person = one(b.person as unknown as { full_name: string | null; email: string | null } | null);
                      const booker = one(b.booker as unknown as { full_name: string | null; email: string | null } | null);
                      const name = person?.full_name || person?.email || "Someone no longer on the system";
                      return (
                        <tr key={b.id as string}>
                          <td className="py-2 pr-3 font-medium">{name}</td>
                          <td className="py-2 pr-3">{one(b.org as unknown as { name: string } | null)?.name ?? "—"}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{booker?.full_name || booker?.email || "—"}</td>
                          <td className="py-2 pr-3">{STATUS_LABEL[b.status as string] ?? (b.status as string)}</td>
                          <td className="py-2 text-right">
                            {b.status === "booked" && !ended && <RemoveBooking id={b.id as string} name={name} />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {!s.cancelled_at && !ended && (
          <Card>
            <CardHeader>
              <CardTitle>Change the session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <SessionForm
                courses={(courses ?? []).map((c) => ({ id: c.id as string, title: c.title as string }))}
                closedDays={Object.fromEntries(
                  (closed ?? [])
                    .filter((d) => d.day !== ukDay(s.starts_at as string))
                    .map((d) => [d.day as string, (d.reason as string | null) ?? null]),
                )}
                session={{
                  id: s.id as string,
                  what: s.kind === "course" ? `course:${s.course_id}` : (s.kind as string),
                  date: ukDay(s.starts_at as string),
                  start: ukTime(s.starts_at as string),
                  end: ukTime(s.ends_at as string),
                  trainer: (s.trainer_name as string | null) ?? "",
                  places: s.places as number,
                  notes: (s.notes as string | null) ?? "",
                }}
              />
              <CancelSession id={s.id as string} title={title} />
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
