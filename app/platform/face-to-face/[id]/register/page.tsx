import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { sessionTitle, sessionWhen, ukDay } from "@/lib/face-to-face";
import { RegisterForm, type RegisterLine } from "./register-form";

// Saving issues a certificate PDF for each person who passed.
export const maxDuration = 120;

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * The register, taken on the day on the trainer's tablet (FACE-TO-FACE.md):
 * everyone booked, here or not, and the practical result for each who came.
 */
export default async function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireRole("platform_admin");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: s }, { data: bookings }] = await Promise.all([
    supabase
      .from("face_to_face_sessions")
      .select("id, kind, starts_at, ends_at, cancelled_at, course:courses (title)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("face_to_face_bookings")
      .select("id, status, practical_passed, certificate_id, person:users!face_to_face_bookings_user_id_fkey (full_name, email), org:organisations (name)")
      .eq("session_id", id)
      .neq("status", "cancelled"),
  ]);
  if (!s) notFound();

  const title = sessionTitle(s.kind as string, one(s.course as unknown as { title: string } | null)?.title);
  const opens = ukDay(s.starts_at as string);
  const lines: RegisterLine[] = (bookings ?? [])
    .map((b) => {
      const p = one(b.person as unknown as { full_name: string | null; email: string | null } | null);
      return {
        id: b.id as string,
        name: p?.full_name || p?.email || "Someone no longer on the system",
        company: one(b.org as unknown as { name: string } | null)?.name ?? "",
        came: b.status === "attended" ? ("yes" as const) : b.status === "no_show" ? ("no" as const) : null,
        practical: b.practical_passed === true ? ("passed" as const) : b.practical_passed === false ? ("not_passed" as const) : null,
        certificate: !!b.certificate_id,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <DashboardShell title={`Register: ${title}`} context={context}>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href={`/platform/face-to-face/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          The session
        </Link>
        <p className="font-medium">{sessionWhen(s.starts_at as string, s.ends_at as string)}</p>
        {s.cancelled_at ? (
          <p className="text-sm text-rose-700">This session was cancelled.</p>
        ) : opens > ukDay(new Date()) ? (
          <p className="text-sm text-muted-foreground">The register opens on the day of the session.</p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody was booked on this session.</p>
        ) : (
          <RegisterForm sessionId={id} lines={lines} course={s.kind === "course"} />
        )}
      </div>
    </DashboardShell>
  );
}
